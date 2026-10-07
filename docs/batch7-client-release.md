# GraffCiti Batch 7 — client release, 7 October 2026

This update extends the existing game and server connection. It requires no new server implementation. Import only the pinned manifest runtime files into the existing Aippy upstream tree.

## Player changes

- Undo and Redo sit beside canvas zoom. Availability comes from the server's last-two-gesture history. Rejections release pending controls; no local undo authority was added.
- BRUSH SETTINGS comes before Colour. The sixth visible head slot is white/black ERAZE and uses the existing eraser mode; the underlying Drip implementation remains unchanged.
- Eyedropper samples displayed world pixels, including ghost references, without making references block painting.
- References have a device-local IndexedDB library: file/URL import, thumbnails, reuse and delete. Device entries remain private. The active guide clears on actual DONE, edit timeout, abandon, disconnect and session changes; it remains available during the same piece's 60-second edit grace.
- Only connected owners with the server capability receive persistent-reference KEEP/DELETE controls. KEEP uploads image bytes through the existing artwork upload path before saving the returned asset reference. Server replies remain authoritative; maximum 50 is server enforced. Persistent references render privately for the owner.
- Real graffiti/poster creator nicknames and @tags open the existing profile, including stored offline identities. Technical session IDs remain admin/owner only.
- VIEW and selection highlight actual art through walls for 3.4 seconds. Poster transforms account for translated/rotated walls. Effects share original textures safely and clean up after use.
- Admin/owner profiles expose a confirmed REMOVE ALL ART action when role, permission and capability allow it. One staged-job request is sent; progress and completion display server counts. Single image removal uses the existing server message.
- SOLO opens a compact Join multiplayer? confirmation. Multiplayer still opens the room-wide player list. Top credits read C N; the existing server-driven +delta display is retained.

## Networking and performance

Protocol remains 2. Join sends networkRevision:6, the three required capabilities, spatialInterest:true when advertised, and actual world.playerPosition. Unsupported requirements close cleanly with an update notice; solo remains available.

The room-wide identity directory is independent of nearby rendered avatars. Moving out of avatar range does not mark a person offline. Spatial world deltas update pieces, posters and strokes incrementally; temporary unload creates no rejection tombstone and the same IDs can reload. Active/unconfirmed local paint is protected. Spatial mode does not issue the old automatic full resnapshot after each idle paint batch.

Affected walls coalesce in a Set. History preparation and replay use the existing 3ms/256-work-unit frame budget, including dwell samples, instead of eagerly processing whole histories. Live local overlays are retained through staged reconstruction. ArtworkSync permits seven simultaneous image loads and preserves async decoding; removed resources/load slots are released.

## Verification

- Automated suite: 249 passed, zero failed.
- Application TypeScript and full ESLint: PASS.
- Standalone Vite production build: PASS.
- Existing imported Aippy-host production build: PASS; importer, aliases, adapter and host sizing files unchanged.
- Live browser test used production WorldMultiplayerSession and createWorld in isolated room batch7-client-qa-7oct. Join position equalled actual spawn [0,1.72,0]. Revision 6 and all three capabilities were sent. The real server returned spatial_status enabled:true/requested:true. No paint, moderation or economy operation was performed.
- WebGL eyedropper comparison: displayed pixel matches across wall/reference and world/map/canvas cameras.
- Prior profile/reward browser regression: PASS for session-ID privacy, offline creator profiles, owner self-credit grant, mute/unmute, custom ban and server-driven +2 display.
- WebGL pulse: mapped art visible through an occluding wall, clipped to piece bounds, clean restoration afterward.
- Mobile browser checks at 390x640, 390x480 and 844x390: PASS for bounded headers, sheet-body touch scrolling, SOLO Cancel/Yes, tool order/ERAZE, disabled unconfirmed undo/redo and owner capability gating. Real IndexedDB file/URL imports, reload, reuse and deletion: PASS with zero normal-reference uploads. This is browser emulation, not a physical Android WebView certification.
- Independent review corrected exact stroke_ rejection codes and wall-local poster transforms; regressions are included.

## Server AI handover

No server code changes are required for this patch. The schemas supplied are used directly. Live health/hello already report minimumNetworkRevision:6, despite the older handover's intended 0-to-6 deployment sequence. Do not raise or change the gate as part of importing this client; deploy the client and verify a real Aippy account connection first.

The original shared wall-layer/underlying-paint flatten limitation is unchanged. Deferred flattening was not enabled. This release preserves existing saved-art/backend tools; it does not add a replacement saved-art, economy or owner-settings architecture. Server-load claims are limited to the client streaming/replay improvements and the isolated handshake; no 120-player load test was performed.

## Required handover checklist

| Item | Result |
| --- | --- |
| Revision-6 join payload | YES |
| Real live spatial_status enabled:true | YES |
| Incremental spatial_world_delta | YES |
| Global directory vs nearby avatars | YES |
| Temporary unload permits reload | YES |
| Server-owned undo/redo | YES |
| Owner persistent-reference controls | YES |
| Local IndexedDB reference library | YES |
| Staged bulk remove progress | YES |
| ArtworkSync concurrency | 7 |
| Standalone and imported-host build | PASS |

## Exact runtime files (27)

- `src/App.tsx`
- `src/components/CanvasCredits.tsx`
- `src/components/GraffitiPieces.tsx`
- `src/components/MultiplayerControls.tsx`
- `src/components/PaintDock.tsx`
- `src/components/PaintWorkspaceHud.tsx`
- `src/components/PlayerInteractionCard.tsx`
- `src/components/ReferenceSheet.tsx`
- `src/components/WorldScene.tsx`
- `src/game/paintEyedropper.ts`
- `src/game/referenceGuide.ts`
- `src/game/referenceLibrary.ts`
- `src/game/worldControls.ts`
- `src/index.css`
- `src/multiplayer/adminActions.ts`
- `src/multiplayer/adminArtRemoval.ts`
- `src/multiplayer/artworkSync.ts`
- `src/multiplayer/connection.ts`
- `src/multiplayer/ownerReferences.ts`
- `src/multiplayer/paintReplay.ts`
- `src/multiplayer/paintSync.ts`
- `src/multiplayer/piecePulse.ts`
- `src/multiplayer/pieceSync.ts`
- `src/multiplayer/protocol.ts`
- `src/multiplayer/spatialDirectory.ts`
- `src/multiplayer/spatialProtocol.ts`
- `src/multiplayer/worldSession.ts`

## Tests changed/added

- `tests/batch7-art-social.test.ts`
- `tests/batch7-session-integration.test.ts`
- `tests/batch7-tools-status.test.ts`
- `tests/identity.test.ts`
- `tests/multiplayer.test.ts`
- `tests/owner-references.test.ts`
- `tests/piece-pulse.test.ts`
- `tests/reference-library.test.ts`
- `tests/replay-budget.test.ts`
- `tests/spatial-network.test.ts`
- `tests/spatial-streaming.test.ts`
- `tests/visible-eyedropper.test.ts`

## Preserved

No changes to worldPainting.ts, sprayHeads.ts, paintSurfaceLayer.ts, architectureWalls.ts, pieceFlatten.ts or server code. No change to paint samples, brush size/interpolation, endpoints, ownership, prices, credits authority, movement, rendering loop, flatten completion/timer logic or SOLO paint clearing.
