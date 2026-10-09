Use Node 22 to apply this update to the CURRENT GraffCiti project:

"Update manifest" (https://raw.githubusercontent.com/benryaus-cmd/graf-game/main/updates/horse-client-9oct2026.json)

Use the existing incremental downloader. Download the 6 listed files using manifest.baseUrl + source as raw bytes, then replace their exact target paths.

Preserve settings, saves, artwork, all unlisted files, importer, aliases, host wrapper and dependencies. No full re-import or server changes.

Build and load GraffCiti. Report version, downloads X/6, replacements X/6 and build PASS/FAIL.

HORSE stays disabled until the server advertises basketball_horse_v1 alongside basketball_court_v1. Keep ordinary shared free shooting working.
