importScripts('./System/Library/WebKit/CoreServices.js')
// Take over as soon as a new worker is installed, so a fixed launchd.js controls open tabs on the next reload instead
// of waiting behind the old one (which would keep serving the previous, possibly buggy, fetch handler).
addEventListener('install', () => skipWaiting())
addEventListener('activate', (e) => e.waitUntil(clients.claim()))
// Some browsers give a service worker no Request.body, so every POST would reach the proxy empty. Read the bytes
// ourselves and hand the controller a request that carries them.
// A service worker is stopped when idle and restarts with no memory of the open proxy frames, so requests that arrive
// first would fall through to the host (S3 answers 403 and sites like TikTok then give up). The controller re-registers
// frames once it hears from the restarted worker; hold proxied requests until it has, and nudge it along.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const nudge = async () => { for (const c of await clients.matchAll()) c.postMessage({ $controller$swrevive: {} }) }
async function handle(e, ready) {
  for (let n = 0; !ready && n < 100; n++) {
    if (n % 10 === 0) await nudge()
    await sleep(50)
    ready = $scramjetController.shouldRoute(e)
  }
  if (!ready) return new Response('The proxy is still starting. Reload the page and try again.', { status: 503 })
  const r = e.request
  let body = r.body
  if (body == null && r.method !== 'GET' && r.method !== 'HEAD') {
    try { const b = await r.clone().arrayBuffer(); body = b.byteLength ? b : null } catch { body = null }
  }
  try {
    return await $scramjetController.route({
      clientId: e.clientId,
      resultingClientId: e.resultingClientId,
      request: { url: r.url, referrer: r.referrer, destination: r.destination, mode: r.mode, method: r.method, headers: r.headers, cache: r.cache, body },
    })
  } catch (err) {
    console.error('proxy route failed', r.url, err)
    return new Response('Proxy error: ' + (err && err.message), { status: 502 })
  }
}
// Movie files: the page that owns the stream fetches each range through the proxy and hands the bytes over a piece at
// a time (see src/lib/mediaStream.ts). Pieces are only asked for as the video reads them, so nothing piles up here.
const MEDIA = '/System/Library/CoreMedia/'
async function media(e) {
  const id = new URL(e.request.url).pathname.split(MEDIA)[1]
  const range = e.request.headers.get('range')
  const owner = e.clientId ? await clients.get(e.clientId) : null
  const targets = owner ? [owner] : await clients.matchAll({ type: 'window' })
  const ports = targets.map((c) => {
    const ch = new MessageChannel()
    c.postMessage({ $browos$media: { id, range } }, [ch.port2])
    return ch.port1
  })
  return new Promise((answer) => {
    let ctl = null, waiting = null, port = null
    const wake = () => { if (waiting) { waiting(); waiting = null } }
    const timer = setTimeout(() => answer(new Response('Nobody answered for this stream', { status: 504 })), 60000)
    if (e.request.signal) e.request.signal.addEventListener('abort', () => { if (port) port.postMessage('cancel') })
    const on = (p) => (m) => {
      const d = m.data
      if (d.head) {
        clearTimeout(timer)
        port = p
        answer(new Response(new ReadableStream({
          start: (c) => { ctl = c },
          pull: () => new Promise((r) => { waiting = r; p.postMessage('pull') }),
          cancel: () => { p.postMessage('cancel'); wake() },
        }, { highWaterMark: 1 << 22, size: (c) => c.byteLength }), { status: d.head.status, headers: d.head.headers }))
      } else if (d.chunk) { ctl.enqueue(d.chunk); wake() }
      else if (d.done) { ctl.close(); wake() }
      else if (d.error) {
        if (ctl) { ctl.error(new Error(d.error)); wake() }
        else { clearTimeout(timer); answer(new Response(d.error, { status: 502 })) }
      }
    }
    ports.forEach((p) => { p.onmessage = on(p) })
  })
}
// Installed browser extensions keep their files in Cache Storage (src/safari/ext/install.ts); serve them as ordinary
// same-origin pages and scripts.
const EXTENSIONS = '/Library/Extensions/'
const extFile = (url) => caches.match(url, { cacheName: 'browos-extensions', ignoreSearch: true })
async function extension(url) {
  return (await extFile(url)) || new Response('Not found', { status: 404 })
}
// An extension page lives at /Library/Extensions/<id>/, but its own files often reference a root-absolute path like
// /popup.js (that's what chrome-extension://<id>/popup.js becomes once the leading host is gone). Those hit the site
// root and 403, leaving the popup blank. Map such a request back into the referring extension; if it isn't one of
// that extension's files, fall through to the network so real site assets still load.
const extId = (ref) => (ref.match(new RegExp('/Library/Extensions/([a-p]{32})/')) || [])[1]
addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  const path = url.pathname
  if (path.indexOf(MEDIA) !== -1) return e.respondWith(media(e))
  if (path.indexOf(EXTENSIONS) !== -1 && path.indexOf('/Library/Safari/') === -1) return e.respondWith(extension(e.request.url))
  if (url.origin === location.origin) {
    const id = extId(e.request.referrer || '')
    if (id) return e.respondWith((async () => (await extFile(location.origin + EXTENSIONS + id + path)) || fetch(e.request))())
  }
  const ready = $scramjetController.shouldRoute(e)
  // the scramjet prefix is rotated per install by src/lib/cloak.ts, so the
  // fall-through guard widens to the whole /Library/ tree rather than the
  // old static /Library/Safari/ name.
  if (!ready && path.indexOf('/Library/') === -1) return
  e.respondWith(handle(e, ready))
})
