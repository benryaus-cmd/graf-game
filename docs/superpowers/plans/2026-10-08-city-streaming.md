# Mobile city streaming implementation plan

**Goal:** A continuous-looking city and an attractive adjacent courtyard, with device-local controls and reproducible performance logs accessible through GG.

**Architecture:** Keep Three.js, Aippy identity/import shell and the existing server. Separate cheap distant city geometry from canonical painted walls. Stage procedural chunks ahead of movement, retain them across boundary oscillation and pin the selected piece. Developer settings and reports live on-device; no server logging or new protocol.

**Spec:** Approved GraffCiti_Open_World_Streaming_Plan.md plus the 8 October implementation request. User explicitly requests autonomous implementation and experimentation.

## Global constraints

- Do not modify worldPainting.ts, sprayHeads.ts, pieceFlatten.ts, paintSync.ts, paintReplay.ts, artworkSync.ts, worldSession session logic, movement or server code.
- Preserve every legacy surface ID and proportional paint texture resolution.
- Completed art remains visible normally. Distance settings defer remote live stroke rendering only; never drop canonical strokes or alter own input.
- Use existing tap + GG access. Add menu choice, collapsible/movable live controls and local last-three-run copy output.
- Keep all new render controls client-local and reactive without per-frame React updates.

## Review focus

- Paint or edit-grace selection while its owner chunk would be evicted.
- Rapid changes of travel direction, canceled construction and disposal during a queued build.
- Corrupt or unavailable local storage; interrupted/backgrounded tests.
- Remote strokes skipped at distance, then entering range or inspecting that wall.
- Shared resources released only by their owner, including pending downloads.

## Tasks

- [x] Developer controls: add renderSettings.ts, performanceLog.ts, DeveloperPanel.tsx; wire App.tsx and WorldScene.tsx. Test persisted finite settings, last-three reports, percentile math, hidden frame exclusion and bounded events. Verify GG choice, panel collapse/drag and mobile scroll.
- [x] Distant city: extract identical seeded building descriptions to cityBlockLayout.ts, add cityHorizon.ts, retain source IDs and matching footprints. Test old/new geometry signatures and bounded proxy geometry. Compare actual calls and visual screenshots.
- [x] Chunk staging: add generator-backed preparation to cityChunkContent.ts; stage ahead of travel in cityChunks.ts with hysteresis and selected-wall pin. Dispose pending work safely. Test diagonal movement, cancellation and retention; browser-test local saved paint re-entry.
- [x] Urban pilot: add urbanCourtyard.ts in chunk (1,0), preserving its existing buildings and walls. Add trees, paving, planters, benches and facade accents. Use a small permissively licensed asset from the current maker's GitHub where practical, with fallback and attribution. Test footprint/collision integration and screenshots.
- [x] Live-stroke distance: narrow adapter scheduling in worldSession.ts using a testable distance helper; own drawing bypasses culling. Test canonical catch-up and changing distance.
- [x] Verification: full npm test, app typecheck, focused lint, standalone and imported-host build; browser setting comparisons with actual recorded runs and screenshots. Document software-renderer limitations honestly.
- [x] Publish: commit runtime changes to GitHub, pin incremental and rollback manifests to tested commits, provide exact Node22 Aippy import prompt and server handover. No server changes needed by this patch.
