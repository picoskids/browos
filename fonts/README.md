# SF Pro (bring your own)

Apple's license doesn't let this project redistribute SF Pro, so the files are not included.
To use it on your own private deployment:

1. Download "SF Pro" from https://developer.apple.com/fonts/ (free Apple ID) and install the .dmg/.pkg.
2. Convert the variable font to WOFF2, for example:
   `pip install fonttools brotli` then
   `fonttools ttLib.woff2 compress -o SF-Pro.woff2 "/Library/Fonts/SF-Pro.ttf"`
3. Put the result here as `SF-Pro.woff2` (and optionally `SF-Pro-Italic.woff2`).

The site falls back to Inter when the file is missing. Don't deploy these files to a publicly reachable URL.
