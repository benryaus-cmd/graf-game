# Aippy ZIP reconciliation — 7 October 2026

Compared the supplied ZIP with GitHub main `49faf00e6a3ea122c6ba8747f789d7046b9476f3` by file content.

## Intentional changes found only in Aippy, brought into GitHub
- `worldPainting.ts`: all six head types interpolate; intermediate holdSamples is 1; final point retains dwell; cap is 96 segments. Preserved exactly.
- `PaintWorkspaceHud.tsx`: grace Done calls `exit` rather than `clear`. Kept in new presentation.
- `WorldScene.tsx`, `worldSession.ts`, new `pieceFlatten.ts`: Done and timer call `finalizePiece`. Capture/upload uses the proven immediate `piece_flatten` fallback when deferred capability is absent. Flattening infrastructure preserved; a local player-pick counter is the sole later UI-wiring addition.
- `architectureWalls.ts`, `paintSurfaceLayer.ts`: proportional per-face resolution is actually present: reference resolution / 4 world units, max dimension 2048, minimum 32, numeric compatibility. Preserved exactly.
- `artworkSync.ts`, `pieceSync.ts`, `worldSession.ts`: flattened artwork metadata/reload, image decoding concurrency 10, loading indicator and cleanup. Artwork sync and piece metadata preserved exactly; session flattening logic remains unchanged.
- `ProjectFileViewer.tsx`: File + canShare/share, cancellation handling, browser fallback and 30-second URL revocation are actually present. Preserved exactly.

## Already in GitHub
- Local-first paint and replay plumbing, Solo/multiplayer paint separation, payment/quote guards, existing server endpoints and permission checks.
- Latest canvas payment tests and protection-mode tests. The ZIP has older versions of some tests/docs; those older versions were not copied back.

## Unrelated/accidental differences
- `cityChunks.ts`: whitespace-only; retained GitHub.
- ZIP `graffciti-menu.webp` is empty because the viewer exports non-text bytes as empty placeholders. Kept the real GitHub binary; the update manifest restores it in the host if needed.
- `connection.ts`: Aippy tolerates snapshots without players and reads server count, but reported connected before consuming snapshot. Existing test showed count 1 instead of 4. Restored snapshot-before-status order while retaining tolerant parsing. No protocol/endpoints changed.
- Older ZIP `final-goal.md`, credits documentation and tests were not used to overwrite newer GitHub content.

## Deferred flattening status
Prepare/cancel/commit helpers check protocol 2 and `piece_flatten_deferred`; they do not activate when that capability is absent. The client does not enable server capabilities. Existing immediate capture occurs before complete/clear and uploads via `piece_flatten`.

The supplied ZIP alone cannot prove the currently running server's advertised capability list. No server changes were made. No per-piece temporary layer architecture was added; capture can still include existing wall-layer paint underneath a selection.

## UI-only session wiring
A local `playerPickSequence` counter in `worldSession.ts`/`MultiplayerView` lets a dismissed player sheet reopen on a repeated tap. It never goes over the socket and does not alter player updates or gameplay. Departures dismiss the player sheet without blocking controls.

## UI update
Shared bounded sheets, scoped typography/container sizing, grouped Paint Tools, compact status HUD, chat unread/reading position, selected art/player sheets, settings/closet/weather and quieter admin surfaces. UI uses existing actions, prices and timing.

## Apply to the existing Aippy host
The GitHub source repo is the standalone upstream game, not a second copy of the Aippy wrapper. `updates/mobile-ui-7oct2026.json` maps updated source files to `src/games/importedGame/upstream/` and includes the three host sizing files under `updates/mobile-ui-host/`.

Apply that incremental manifest using the existing Node 22 staging/promote route. Download every entry before replacing target files, fail on incomplete downloads, and mark success only afterward. Do not run a full older import over these changes. The host's cached GitHub importer will otherwise skip a fresh download.

## Validation
142 tests passed, standalone and patched Aippy host production builds passed, TypeScript application check passed and full upstream ESLint passed. Host update templates are excluded from the standalone lint project because their imports belong to the Aippy wrapper; they are validated in the host integration build. Byte preservation comparison passed, with only the documented local player-pick wiring in worldSession. No browser portrait/Aippy WebView playtest claim: available cloud browser cannot open the local server and the workspace has no browser binary.
