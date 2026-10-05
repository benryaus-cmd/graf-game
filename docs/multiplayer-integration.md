# Existing-server multiplayer integration plan

**Goal:** Add opt-in multiplayer around the existing game using the owner's deployed protocol-1 server.

**Architecture:** A client connection joins public after hello. Existing local rendering emits stroke samples afterwards. A stroke journal replays server snapshots onto the existing paint canvases; remote characters interpolate in the existing render loop. Solo paint storage stays separate.

**Tech stack:** Existing React, Three.js, TypeScript and native browser WebSocket; no new runtime dependencies or server work.

**Spec:** Owner's supplied protocol and scope; this instruction overrides backend deployment proposals in final-goal.md.

## Constraints

- No server/container/infrastructure changes. Room defaults to public, with a configurable room field.
- No socket in solo. Movement/camera/brush run locally before network work.
- Use VITE_MULTIPLAYER_URL through one config module.
- Stay below 64 KB/message, 128 points/batch, 20,000 points/stroke and 120 messages/second.
- Reuse current avatars and paint renderer. Chat/accounts/claims/economy are later work.

## Files and tasks

1. Add src/multiplayer/{config,protocol,connection,playerSync,remotePlayers,paintSync,surfaces,worldSession}.ts. Add tests with the Node test runner and existing esbuild dependency. Test explicit join, assigned identity, missing/unavailable transport, duplicate echoes, delayed snapshot and stroke limits.
2. Add deterministic geometry-based wall IDs in cityChunkContent. Expose a paint-session switch in cityChunks/createWorld/worldTypes that saves solo first and never reads/writes solo paint in multiplayer. Test IDs across regenerated/reordered chunks, and replay after streaming/reconnect.
3. Hook worldPainting after stampPaintHit, stroke release/cancel in worldControls, and multiplayer ticks after advanceWorld. Reconstruct UVs from real world-space samples on the identified face, then call the same stampPaintHit renderer. Preserve geometry when switching paint sessions and guard delayed solo image decodes.
4. WorldScene owns the multiplayer lifecycle; App passes explicit join/leave requests and receives status. Add a small visible MultiplayerControls component with the default Aippy profile, join/leave/reconnect and occupancy. Read useUserInfo once in App; prefer nickname then @username then PLAYER, respect loading, show avatar/fallback. No custom profile service or name-entry requirement. Solo loads without connecting.
5. Run protocol/paint tests, TypeScript, lint and production build. Exercise two clients against the live WSS server, record observed protocol shapes, and verify late-join reconstruction. Update HOW_I_DID_IT and final-goal to acknowledge the existing backend. Publish one reviewed GitHub commit.

## Review focus

- Reconnect assigns a new player ID; local stroke IDs still prevent duplicate replay.
- A snapshot can race an active brush gesture; clear/replay must retain provisional strokes and reset obsolete texture-space previous points.
- Chunk objects are disposed/recreated; stroke history must address stable surfaces, not old mesh pointers.
- Joining/leaving must not write shared textures or posters into solo browser saves.
- Slow/broken sockets must not grow an unbounded send queue or stop local drawing; disconnected drafts remain local and status says so.

## Verification

Automated checks use a controlled transport and the actual client classes, plus Three.js geometry and recorded canvas draw calls. Live tests use the existing deployed WSS endpoint, not a new server. Browser/WebGL visual verification is recorded separately if available; a passing build is not a claim of measured phone performance.
