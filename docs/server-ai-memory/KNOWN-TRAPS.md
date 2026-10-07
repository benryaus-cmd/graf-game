# Known traps — do not repeat

## 1. Spatial unload is not deletion
A `spatial_world_delta.remove*Ids` entry means "not relevant to this client right now". It must not enter permanent tombstone/delete state.

## 2. Online roster is not the rendered avatar list
With spatial mode, global identity comes from `playerDirectory`; nearby 3D actors come from `players` plus spatial enter/leave events.

## 3. Do not make another server/backend
The live server already exists. Do not add another WebSocket server, VM/backend architecture, peer-to-peer replacement, or second React root.

## 4. Do not assume GitHub deploys the server
GitHub is the game/client source. The live Node server is separately deployed under `/opt/aippy-game-server`.

## 5. Do not reintroduce deferred flatten
The old deferred flatten path caused bugs and was removed.

## 6. Do not restore position-mismatch flatten checks
A previous world-position comparison caused `piece_position_mismatch` failures.

## 7. Do not let image loading explode
Current client concurrency was 10; target is 7. Spatial unloading should help keep poster/image textures bounded.

## 8. Do not run giant client-side moderation loops
Use `admin_remove_user_art` once and consume server progress.

## 9. Don't confuse owner references with local reference library
These are separate: a local user IndexedDB reference library and owner-only server persistent placements.

## 10. Do not turn multiplayer into a dependency for solo play
Solo remains local-first and usable if the server is unavailable.

## 11. Legacy clients are expensive
Once the spatial client is deployed and verified, a revision gate is desirable so stale cached clients cannot silently undermine scaling.

## 12. Off-main branch is not secret storage
This branch is useful for memory/docs, not credentials.
