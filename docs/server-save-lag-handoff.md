# GraffCiti image-save lag — server AI handover

The player reports that saving/loading artwork pauses everyone, even with only one or two players. This release fixes client UI features; it does **not** claim to fix that shared pause. The server was not profiled or modified.

## Existing contract to keep

- Client uploads binary PNG/JPEG/WebP to the existing `POST /artwork-upload` endpoint, then uses the returned persistent `assetRef`.
- Finished graffiti uses the proven immediate `piece_flatten` path. DONE and the existing 60-second timeout both finalize. Do not enable `piece_flatten_deferred` or its prepare/commit/cancel messages.
- Movement and painting remain local-first. Preserve stroke IDs, ordered broadcasts, ownership, protection pricing and session isolation.
- Reference guides are local-only: no upload, server entity, new protocol message or server work is needed.
- Emotes still use existing `player_action` (`action: 'emote'`, `data.emote`); speech bubbles use existing `chat_message` with `message.playerId`, `id`, `text`, `timestamp`. No additional broadcast is needed. Verify sender echo and other-player delivery if the deployed backend differs from that contract.

## Instrument these three stages first

| Stage | Measurements |
| --- | --- |
| `POST /artwork-upload` | Body-read time; input bytes/dimensions; hashing/validation/encoding time; file/object-store write time; DB time; response time. Identify any synchronous work sharing the multiplayer process or room lock. |
| `piece_flatten` | Time from receipt through asset lookup, persistence, stroke pruning and broadcast. Record removed stroke count, total remaining points on affected walls, room/player count, outgoing JSON bytes, and whether a whole room snapshot or stroke history is serialized. |
| Asset GET (`assetRef`) | Server response latency, cache hits, bytes, image dimensions, and whether processing happens for each request or only once at upload. |

Correlate logs by piece ID/asset reference. Measure event-loop lag (or the runtime's equivalent), room-lock duration, CPU, memory/GC, and WebSocket send-queue growth during those same intervals. Do not print image bodies or user chat content into diagnostics.

Reproduce with two clients: one continuously walks while the other finishes a piece. Compare: few strokes versus many strokes at the same image size, then a poster upload of a similar size. Observe timing at upload start, upload completion, `piece_flatten` arrival and `piece_flattened` broadcast. A sustained movement/heartbeat delay at the server points toward shared server work; smooth transport with client frame stalls points toward rendering/replay work.

## Client findings to distinguish from a server stall

- `src/multiplayer/pieceFlatten.ts` captures and synchronously encodes WebP using `toDataURL`, capped at 1024 pixels on its largest dimension, quality 0.82. That can stall **the saving browser**; it does not itself execute on observers.
- `src/multiplayer/artworkUpload.ts` converts the data URL, computes a SHA-256 digest through Web Crypto, caches successful uploads by content, and awaits fetch asynchronously. Do not assume the fetch is blocking the game loop.
- `src/multiplayer/worldSession.ts` reacts to authoritative removed stroke IDs by indexing/removing strokes and scheduling affected-wall replay on **each client**. `PaintReplay.enqueue` prepares per-point hold samples synchronously before its render queue runs.
- `src/multiplayer/paintReplay.ts` already budgets drawing at about 3 ms / 256 network points per update. Canvas commit copies and later GPU texture uploads can still cost more than that budget on large wall textures. A frame pause shared by observers therefore does not prove the server is blocked.
- `src/multiplayer/artworkSync.ts` already uses asynchronous image decoding, a concurrency limit of 10 and server asset references. Image decode/texture upload remains a profiling candidate; preserve the proven fast reload behavior.

These are source-level candidates, not measured bottlenecks. No flattening, replay, texture-resolution or image-loader code was changed for this release.

## Optimize only the measured bottleneck

If the server is blocked by upload image processing, isolate that work using the existing architecture's async I/O or worker facilities. Avoid holding the room lock during encoding or asset writes. If full room persistence/serialization dominates flattening, write the affected piece/stroke records and broadcast the existing small delta rather than rebuilding a whole snapshot for every save, while retaining authoritative ordering and atomic state.

If asset serving dominates, serve existing immutable/content-addressed assets with suitable cache headers or conditional caching for mutable URLs; avoid repeated transcoding. Keep existing endpoints and response/message shapes.

Return before/after timings, which stage caused the pause, exact server files changed, and the two-client result. If the server stays responsive, return the correlated timestamps so the client AI can profile capture, stroke-removal queue setup, replay commits and texture uploads separately. Piece-owned temporary paint layers remain a separate future project.
