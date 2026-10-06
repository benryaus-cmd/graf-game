# GraffCiti direct reference URLs

Paste a direct image address in Canvas → Reference Image → Image URL, then tap USE IMAGE URL. The image downloads once into browser memory, passes through the existing decode/downsample step, and becomes a local blob-backed ghost guide. The existing opacity, size, rotation, movement, fit and hide/show actions remain. Replacing or closing the sheet cancels pending downloads; failed replacements retain the previous guide. Reference blob/GPU cleanup is unchanged.

This works in Solo and Multiplayer and does not depend on a game-server connection. Internet is needed to retrieve a remote image. Nothing is uploaded to the artwork server, bundled into project source, baked into paint, or broadcast to other players. These are temporary session assets.

Image links may contain query strings or lack a file extension. PNG/JPEG/WebP/GIF signatures cover binary responses without an image MIME header; other image MIME types are passed to the browser decoder. Phone selection now requests image/* instead of three specific MIME types. Supported decoding depends on the browser. The existing 12 MB download limit and 1600-pixel preparation cap are retained, with a 20-second network timeout.

Browser cross-origin rules still apply. A site which blocks cross-origin image downloads cannot be imported into a WebGL texture by copying its URL alone; the UI reports the failed import and preserves the existing guide. An ordinary Google webpage inside an iframe cannot expose clicked image links to the parent game. Google provides a different, supported Programmable Search Element, requiring a configured public Search Engine ID. Automatic Google browsing/selection is not part of this update. No paid search API or server changes were introduced.

Validation: all 168 tests pass; application TypeScript and ESLint pass; standalone and isolated Aippy host production builds pass. Chromium checks exercise the actual phone-input touch picker, direct URL → local blob import in Solo, and retaining the guide when replacing it with an HTML page fails. Real Aippy Android file-chooser handling remains unverified; this URL route bypasses that chooser.

Import updates/reference-url-7oct2026.json with the existing Node 22 incremental downloader. Three runtime targets; preserve all unlisted files and prior creative-tools/tutorial fixes.
