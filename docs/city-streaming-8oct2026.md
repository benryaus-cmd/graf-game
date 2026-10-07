# GraffCiti mobile city streaming pilot

Version: `city-streaming-8oct2026`

This is an incremental client update for the existing Aippy-hosted game. It keeps Three.js, the import wrapper, Aippy identity and the current multiplayer server. It introduces a visible city horizon, staged travel loading, an adjacent courtyard and on-device rendering tests. It does not claim that an entire finished city or automatic device tuning is complete.

## Open the developer tools

Use the existing hidden Settings tap sequence and enter `gg`. The unlock now offers **PROJECT FILE VIEWER** or **LIVE GAME SETTINGS**. The file viewer remains available unchanged. The live panel can be dragged by its header, collapsed while walking, or closed. Its body scrolls inside the actual game container, including short landscape viewports.

Settings apply immediately and persist on the device:

| Control | Default | Purpose |
|---|---:|---|
| Render scale | 1 | Caps rendering pixel ratio; lower values reduce pixel work |
| Haze | 0.011 | Exponential fog softens the distant scene |
| City horizon | 192 m | Outer ring of cheap building/ground silhouettes |
| Skyline | On | Enables the distant silhouettes |
| Tree detail | On | Shared imported trees; off keeps simple trunks to match collision |
| Live strokes | 30 m | Defers drawing distant remote strokes; 60 m is available for comparison |
| Load budget | 2 ms | Cooperative chunk preparation budget per existing update |
| Keep chunks | 5 s | Retains recently visited chunks to prevent boundary thrashing |

`renderScale` is a pixel-ratio cap, not a percentage of the phone's physical display. The game still sizes its canvas to the existing available container. No host sizing, fullscreen, camera-far-plane or orientation system is replaced.

## What changed in the world

- Distant blocks use opaque merged boxes without paint layers, texture downloads, collision or network subscriptions. They follow the same seeded house footprints as the full blocks and are replaced when the real chunk mounts. Ground continues through the proxy ring. Fog makes the difference less conspicuous; close silhouettes are not detailed façades.
- The initial collision-ready 3×3 neighbourhood is preserved. Subsequent chunk creation yields between the ground and individual buildings instead of creating a whole neighbourhood in one update. Travel direction prefetches neighbouring chunks 16 m ahead. Obsolete partial builds are canceled and disposed.
- Recently visited chunks remain for five seconds. At most one old chunk is released per update. An active or edit-grace selected wall pins its owning chunk. Solo paint uses the existing save/restore path; asynchronous restorations cannot write into disposed or replaced chunks.
- Opaque wall backgrounds now render through one material rather than six repeated face draws. Their canonical grouped raycast meshes, face indices, surface IDs, UVs and proportional paint resolutions remain intact. Empty paint faces do not submit draws until allocated.
- Chunk `(1,0)`, east of spawn, has a pilot courtyard. Walk toward `x=48`; its two planted plazas are around `z=16` and `z=-16`, beyond the existing central arch. Eight trees, benches, planters, warm paths and restrained façade accents reuse existing buildings. Existing wall IDs and the arch stay in place.
- The trees use a 51,504-byte self-contained Quaternius Cube World glTF with embedded geometry and a small palette texture. One mesh/material is shared across eight instances. Downloads fail gracefully to simple trees. Source and CC0 attribution are in `public/assets/city/LICENSE.txt`. The URL is pinned to an immutable GitHub asset commit; no server asset endpoint or new dependency is needed.
- The permanent test building keeps its 80 m visibility distance. Concrete grain starts at 20 m. Its previous distance/grain files are included in this manifest because that earlier patch may not have been applied in Aippy.
- A failed concrete texture request falls back to shaded architecture instead of leaving a black material.

## Remote paint distance

Only the scheduling of remote live stroke rendering changes. Out-of-range strokes stay in the existing canonical PaintSync state and are rebuilt when the wall comes into range or is selected. Own local painting and own echoed strokes bypass the range gate. Completed flattened images still use the existing ArtworkSync loading path. There are no new protocol messages.

The threshold measures distance to a wall's bounds, not each individual stroke. A large nearby wall can therefore render distant portions of its paint. This setting reduces client drawing/replay work, **not network traffic**. Piece-local layers remain a separate future architecture project.

## Phone test procedure

1. In Aippy, choose Live Game Settings and name a run `phone-default`. Start Test, collapse the panel, then walk the same 60-second route: spawn → east courtyard → past the next block boundary → turn back. Include a few normal turns and jumps.
2. Stop & Save. Repeat that route as `phone-low`, changing only render scale to `0.8`. Stop & Save.
3. Repeat as `phone-short-horizon` with scale `0.8` and horizon `144`. Alternatively use the third run to compare live strokes at `30` versus `60` m in a busy multiplayer room.
4. Press **COPY LAST 3 RUNS** and paste the report. If WebView clipboard access is unavailable, a selectable text report appears for manual copying. Reset Settings restores the defaults.

Use the same viewport, route and room population when comparing. Average FPS alone can hide hitches: compare p95/p99/max frame time, draw calls, texture/geometries counts and logged chunk spikes. Do not change five settings at once. Lower render scale trades sharpness for pixel work; shorter horizons trade distant scenery for memory/draw work.

Reports retain the last ten completed runs locally and export the last three. They capture start time, available game viewport, drawing buffer, pixel ratio, user agent, starting settings, setting-change events, frame timings, rendering counts and bounded error/context/long-task events. Background intervals are excluded from FPS. A running test is saved on page hide. This is aggregate measurement through the existing renderer, with no extra animation loop, per-frame React state, server logging or GPU readback. `cpuMs` is CPU time submitting the render call, not GPU completion time.

## Verification and measured result

- Full automated suite: **284 passed, zero failed**.
- Application TypeScript check: passed.
- Focused source ESLint: no errors; CSS is outside the repository's ESLint configuration.
- Standalone production build: passed; inlined output about 4.04 MB / 1.48 MB gzip.
- Existing imported Aippy host production build: passed; output about 3.92 MB / 1.45 MB gzip. No Vite aliases, import plugins or host components were changed by the patch.
- Browser checks at 390×640 portrait and 844×390 landscape: GG choice, setting persistence, collapse/expand, local run saving and panel scrolling passed.
- Actual Three.js browser checks: shared tree instances; selected-wall retention during travel; chunk release/re-entry with identical IDs; saved paint pixels restored; existing flatten capture; queue settling to nine active chunks and zero pending; no uncaught errors or shader failures.
- In the same controlled courtyard camera view, batching reduced draw calls from **1,498 to 293** with the triangle count unchanged: approximately **80% fewer calls**. This measures submission reduction, not a promised FPS increase.

The browser uses Chromium with software SwiftShader. Three short recorded setting comparisons exercised the real recorder, but their FPS results were highly variable in that shared software environment and must **not** determine phone defaults. Actual Android/Aippy FPS, thermal behaviour, live room performance and the appearance of imported network artwork require the phone tests above. No physical phone benchmark or live multiplayer load test was performed here.

## Server AI handover

**Nothing needs deploying on the server for this patch.** No server files, endpoints, protocol, economy, ownership, prices, timers or room-session switching are changed. Keep the proven immediate `piece_flatten` fallback and existing flattened-image service. There is no new credit authority, deferred flatten flow or fake local economy timer.

If many-player tests later show wire traffic or server image-saving stalls, collect server event-loop delay, image encode/write duration, payload sizes and room broadcast rates separately. Client draw-call reduction cannot demonstrate or repair a server stall. Nearby subscription/interest filtering would be a later coordinated protocol task, not enabled here.

## Limits and next decisions

The first nine chunks still bootstrap synchronously. One house is the smallest construction yield, so a slow house can exceed the nominal budget; spikes over 12 ms are recorded. Skyline generation is cheap but still runs synchronously when its block/range changes. Canonical walls remain individual meshes for painting. There is no compressed texture pipeline, automatic adaptive resolution, medium-detail façade tier, server interest filtering or engine migration in this patch.

Keep this pilot behind reversible client settings, collect real device reports, and tune one variable at a time. A later phase can stage the initial spawn build, cache skyline geometry, add another landmark proxy tier and expand the courtyard style into authored city districts without replacing working painting infrastructure.

## Import and rollback

Use `updates/city-streaming-8oct2026.json` for an atomic 21-file incremental import into `src/games/importedGame/upstream/`. Stage every download before replacing persistent targets; preserve all unlisted files. New source modules are intentionally included. Do not perform a full GitHub re-import or add a Vite plugin.

`updates/city-streaming-8oct2026-rollback.json` restores the prior 12 existing runtime files from the previous main snapshot. New modules may remain on disk but are no longer imported after rollback. Existing art and server state are not rolled back or deleted. Previously saved local settings/reports remain available if this update is applied again.
