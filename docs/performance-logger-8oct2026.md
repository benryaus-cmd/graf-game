# Single recoverable performance log and skyline experiments

This incremental update follows `city-streaming-8oct2026`. It changes nine client runtime files and requires no server work, dependency changes, host wrapper edits or full re-import.

## Recording and recovery

Open the existing Settings tap + `gg` tool and choose Live Game Settings. Press **START LOGGING**. The optional **Include 5-second blank-scene baseline** is enabled initially: the world render is blank for five seconds, then returns automatically. Stand still during that period. Game simulation, networking and the HUD continue; this is a rendering baseline, not a paused room or an isolated measurement of total recorder cost. Stop Logging also restores normal rendering immediately on the next frame.

Baseline and city statistics are separate. The report's top-level FPS and rendering summary contain only city frames. The baseline never inflates the city FPS. Logger overhead is measured separately under `overhead`, covering frame aggregation, half-second sampling, scope collection, settings collection and checkpoint serialization/storage.

Only one test is retained. Starting a new test replaces the previous one immediately. **COPY LOG** works during recording or after stopping, and the WebView has a selectable-text fallback if clipboard access fails. Existing v1 history is migrated to its most recent report and the older history key is removed after successful migration.

The active log checkpoints to device storage approximately every two seconds, preferably during an idle opportunity with a one-second timeout. Slow checkpoint writes increase the interval up to ten seconds; the actual interval and measured write cost appear in the report. Errors, unhandled rejections, WebGL context loss/restoration, page hiding and navigation trigger immediate best-effort checkpoints.

A native WebView crash, OS kill or sudden power loss cannot be depended on to run JavaScript. Recovery therefore uses the last completed checkpoint. On reopening, an unfinished log is labelled **RECOVERED UNFINISHED LOG** and `status: interrupted`; it does not automatically resume. The label cannot distinguish a crash from a reload or forced close. The tail after the last successful checkpoint may be missing. Copy the recovered log before starting another test.

Recording does no per-frame JSON, DOM reads, storage writes or React state updates. Half-second time samples include position, view mode, active painting/selected surface, viewport, pixel ratio, rendering statistics, loaded chunks and horizon inventory. All actual settings changes are recorded with elapsed timestamps and their complete settings snapshot. Number fields commit on Enter or blur, avoiding slider event floods.

Older samples are progressively merged when the timeline exceeds 600 entries; their frame totals, weighted averages and maxima remain represented. Recent samples retain half-second detail. Compacted samples retain the final position/context of their interval and the settings revision range, rather than every intermediate position. The latest 400 diagnostic events are retained; `discardedEvents` reports any omitted earlier events. Operation totals and the settings-change timeline remain available independently of diagnostic-event retention.

While recording is off, no sampling timers, long-task/resource observers or diagnostic history run. With the live panel open, a small FPS pulse remains available, including in its collapsed header; it is not saved as another log. Closing the panel ends that idle FPS pulse, while an explicitly started recording continues.

## What can now identify a hitch

| Measurement | Meaning |
|---|---|
| `chunk.paintReadback` | Existing dirty canvas readback/cache path |
| `chunk.paintEncodeAndStore` | Existing paint PNG encoding and local persistence |
| `chunk.posterStore` | Existing poster persistence |
| `chunk.dispose` | Released chunk geometry/material/texture disposal |
| `chunk.buildStep` | One staged procedural construction step |
| `chunk.restoreSync` | Synchronous portion of chunk paint restoration |
| `paint.restoreImage` | Saved-image composition into the paint canvas |
| `horizon.planRing` / `horizon.buildBlock` | Planning and building simple 3D proxy blocks |
| `horizon.buildFlatRing` | Building the instanced tall-building silhouettes |
| `settings.apply` | Applying rendering preferences and refreshing visual tiers |
| `asset.requestElapsed` | Resource request elapsed time, when WebView resource timing is available |

Each scope has count, total milliseconds and maximum milliseconds. Scopes taking at least four milliseconds also produce an elapsed-time event. Scope durations can overlap, so do not add all operation totals together as total CPU work. `asset.requestElapsed` measures asynchronous elapsed time, not CPU use. Per-frame `cpuMs` measures CPU time submitting the renderer call, not GPU completion time. Phone-wide CPU percentage is unavailable and is not fabricated.

The paint persistence functions are only wrapped for timing. Their data, save/restore order, composition, surface IDs and gameplay semantics are unchanged. Painting interpolation, replay implementation, flattening, ArtworkSync, room protocol, economy, timers, movement and server code are not rewritten.

## Visual controls

The expanded panel is wider where the game container permits and uses two columns. Every numeric field and visual toggle has its own reset. Values apply on Enter or blur; Reset Settings restores everything. The collapsed header shows FPS.

| Setting | Default | Available range |
|---|---:|---:|
| Render pixel-ratio cap | 1 | 0.35–3, capped by device pixel ratio |
| Haze density | 0.011 | 0–0.2 |
| Detailed resident chunks | 96 m | 4–144 m |
| Simple 3D block ring | 192 m | 48–768 m |
| Flat tall-building skyline | 480 m | 48–1152 m |
| Minimum silhouette building height | 24 m | 5–56 m |
| Silhouette width multiplier | 1.05 | 0.5–3 |
| Exposure | 1.15 | 0.1–3 |
| Remote live strokes | 30 m | 5–240 m |
| Chunk preparation budget | 2 ms | 0.25–12 ms |
| Chunk retention | 5 s | 0–30 s |

City Proxies, Flat Skyline and Tree Detail can be toggled and reset independently. Flat skyline is part of City Proxies, so disabling City Proxies hides both distant tiers.

Tall silhouettes use one instanced draw with camera-facing opaque planes at the same seeded building locations and heights. They become the simple 3D proxy blocks inside the 3D ring, then the existing detailed buildings where their resident chunk is visible. Loaded detailed chunks mask their matching silhouettes, including when the detail range exceeds the 3D range. Proxy construction is staged rather than building the entire enlarged 3D ring in one update. All these are visual-only tiers; the existing loaded collision/paint neighbourhood is retained. Increasing Detail Range does not load arbitrary distant real chunks.

For a visible skyline experiment, try Haze `0.001`–`0.003`, 3D Blocks `144`–`216`, Flat Skyline `480`–`720`, with Landmark Height `24`. These are experiments, not benchmark-selected phone defaults. High haze can conceal distant buildings even when their range is large. The existing camera far plane remains 1200 m.

## Verification

- Full automated suite: **293 tests passed**, zero failures.
- Application TypeScript check and focused source ESLint passed.
- Standalone and existing imported Aippy host production builds passed.
- Browser checks passed for two-column numeric entry, per-setting reset, collapsed FPS, portrait and landscape scrolling, blank baseline/automatic city restoration, settings-change capture, periodic checkpoints and clipboard fallback.
- Deliberately crashed the Chromium renderer using CDP `Page.crash` after an automatic checkpoint, then reopened the game in the same browser context. The unfinished single log was recovered and copied, with recorded data matching the checkpoint. No stop/save/pagehide callback was needed.
- Skyline instancing compiled and rendered without shader errors. Regression tests cover duplicate tall-building suppression, baseline-boundary classification, stored-log corruption/quota failure, newest-only migration, sample compaction and operation error propagation.
- Browser testing uses software SwiftShader. Recorded overhead exercised real code but does not predict Android timings; no phone-wide CPU usage or physical phone FPS improvement is claimed.

## Files in the Aippy update

Every source below maps to the same suffix under `src/games/importedGame/upstream/`:

1. `src/components/DeveloperPanel.tsx`
2. `src/components/WorldScene.tsx`
3. `src/game/performanceLog.ts`
4. `src/game/worldPerformance.ts`
5. `src/game/renderSettings.ts`
6. `src/game/cityHorizon.ts`
7. `src/game/cityChunks.ts`
8. `src/game/paintPersistence.ts`
9. `src/index.css`

Use `updates/performance-logger-8oct2026.json`, staging all nine raw-byte downloads before replacing persistent targets. Preserve every unlisted file. A corresponding rollback manifest restores these nine files from the prior main snapshot. No server deployment is required.
