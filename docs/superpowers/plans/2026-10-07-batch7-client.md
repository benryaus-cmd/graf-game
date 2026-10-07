# GraffCiti Batch 7 client implementation plan

**Goal:** Wire the supplied live-server features into the existing client while preserving local-first painting, identity/privacy, immediate flattening and the Aippy host.

**Architecture:** Extend existing connection and sync classes. Keep room-wide identity presence separate from nearby avatar rendering. Distinguish temporary streaming unload from authoritative deletion, and queue/coalesce affected wall recomposition using the existing incremental replay engine.

**Tech stack:** Existing TypeScript, React, Three.js, WebSocket protocol 2, IndexedDB. No backend or new React root.

**Spec:** User upload graffciti-game-coder-handover-b7(1).txt, received 7 October 2026.

## Constraints and observed state

- Revision 6; capabilities spatial_interest_v1, spatial_world_delta_v1, player_directory_v1; join spatialInterest:true with real current playerPosition.
- The live health endpoint already reports minimumNetworkRevision:6. Do not change that or any server setting; verify live spatial acceptance before release claims.
- Gameplay paint samples/brush interpolation and physical size are unchanged; no deferred flatten enablement.
- Mute/credit privacy release remains the baseline. Server balances and all undo/moderation results remain authoritative.
- The full server-schema handover is supplied; client readers and actions use its exact field names.
- Interpret moving Brush setting between Brush and Colour as placing the existing BRUSH SETTINGS (size/opacity) section between heads and Colour.
- Follow direct imports and named symbols; no whole-repository rereads.

## Pass 1: Revision gate and presence

Files: src/multiplayer/connection.ts, protocol.ts, worldSession.ts; new src/multiplayer/spatialDirectory.ts; tests/identity.test.ts (existing exact name to inspect), new tests/spatial-network.test.ts.

- [x] Add failing tests for exact protocol-2 join capabilities/revision/real position, protocol-1 compatibility, unsupported revision/capability gate and client_update_required without reconnecting.
- [x] Extend connect with an initial-position argument supplied by WorldSession.join; retain existing identity separation.
- [x] Implement spatial directory snapshot/join/leave/role changes and roster/profile lookup independent of RemotePlayers. Spatial player_left hides the avatar only; directory_left marks actual offline.
- [x] Test far-away online players remain selectable and moderatable by known server role. Test self identity and legacy snapshots.

## Pass 2: Spatial streaming

Files: src/multiplayer/paintSync.ts, artworkSync.ts, pieceSync.ts, worldSession.ts; new tests/spatial-streaming.test.ts. PaintReplay uses its current incremental rebuild API.

- [x] Reproduce unload/reload with the same IDs and assert temporary removal creates no tombstone.
- [x] Add PaintSync.unloadStrokeIds(ids):string[] and upsertStrokes(values):string[] returning affected surfaces without drawing per record; preserve local active unconfirmed paint.
- [x] Add incremental PieceSync mutation without deletion broadcasts for unload; ArtworkSync unload cancels pending loads/disposes mounted resources and permits later re-upsert.
- [x] Process spatial_world_delta fields in batches; enqueue affected wall IDs in a Set and rebuild each affected wall once using the existing replay budget. Avoid full resnapshots on deltas.
- [x] Reduce ArtworkSync image concurrency to 7, retain async decoding; update meaningful concurrency tests.
- [x] Verify live client handshake and spatial_status enabled:true using an anonymous isolated test connection, with no admin or paint actions.

## Pass 3: Painting controls and references

Files: PaintDock.tsx, BrushTuning.tsx, PaintWorkspaceHud.tsx, ReferenceSheet.tsx, ReferenceControls.tsx, ReferenceGuide.ts, paintEyedropper.ts, App.tsx, WorldScene.tsx; new game/referenceLibrary.ts and tests/reference-library.test.ts; gameplay controls wiring only where necessary.

- [x] Place BRUSH SETTINGS before Colour. Replace the visible Drip slot with white/black ERAZE using the existing eraser action. Preserve the drip head implementation and interpolation.
- [x] Add disabled Undo/Redo controls beside zoom consuming optional server history state; requests/results implemented only against supplied schema. No independent local history authority.
- [x] Sample visible world/ref colours without changing the guide's non-raycast paint-target behaviour.
- [x] Add device-local IndexedDB reference library with thumbnail/name, URL/file import, select and delete. Handle blocked/quota/failed storage and object URL cleanup. Do not upload private library records.
- [x] Clear temporary active guide on actual piece/session end, including existing DONE/timeout and multiplayer reset notifications. Preserve re-edit grace and existing finalisation events.
- [x] Wire owner KEEP/DELETE/list only after the exact persistent reference schema is supplied.

## Pass 4: Art/social surfaces

Files: MultiplayerControls.tsx, CanvasCredits.tsx, GraffitiPieces.tsx, PlayerInteractionCard.tsx, pieceSync.ts, artworkSync.ts, playerDirectory.ts, worldSession.ts, App.tsx; focused helper for temporary art highlighting if required.

- [x] SOLO opens Join multiplayer? confirmation; YES invokes existing join, cancel does nothing. Connected status keeps the roster and green/count display without literal Online. Credits become C N while the existing server-driven gain display remains.
- [x] Preserve metadata identity and open profile from art creator even when not nearby/offline. Never substitute role names for nicknames or fabricate usernames.
- [x] Add a >=3s temporary through-wall art pulse plus locator, dispose effect on end/removal. Keep existing Nearby Art VIEW focus.
- [x] Add REMOVE ALL ART request and progress under server permissions, using the existing staged job and exact supplied progress fields. Apply returned removals promptly with queued wall recomposition, never a client delete loop.

## Final validation and release

- [x] Focused missing-behavior checks and the full regression suite pass.
- [x] Application typecheck, lint, standalone production build, isolated Aippy-host production build and mobile portrait/landscape checks pass.
- [x] Review all changed sync paths for temporary-vs-authoritative deletion, local responsiveness and stale asynchronous callbacks.
- [x] Recheck GitHub main, publish changed files on its current tree without touching unlisted files; create a pinned exact-path Node22 incremental manifest.
- [x] Report each handover checklist item truthfully. Do not recommend server revision-gate changes until the imported/deployed client is confirmed.
