// First script in every extension page (background, popup, settings). The page is a same-origin frame of BrowOS,
// which builds its chrome.* object; see src/safari/ext/hub.ts.
;(function () {
  var w = window, host = null
  try { while (!host && w !== w.parent) { w = w.parent; host = w.__browosExtensions || null } } catch (e) { /* opened outside BrowOS */ }
  if (host) host.attach(window)
})()
