# Shared basketball client integration — 9 October 2026

Approved intent: implement the server report's bounded mark-relative release position and capability-gated frontend integration. Use the existing admitted town socket. Solo remains immediate and unchanged; shared play only becomes available when the server advertises basketball_court_v1. No backend deployment is performed here. HORSE stays disabled until the agreed server adapter and real two-client checks exist.

1. Pure contract: required releaseOffset {right,up,forward}, exact report bounds and assigned-mark reconstruction, matching local/server launch and physics. Reject malformed requests; keep undeployed version 1.
2. Transport: strict scope/state/event validation, assigned seat epochs and sequences, bounded pending shots and stale joins, own echo dedupe, rejection reconciliation, disconnect cleanup and optional bounded late-arrival live shots.
3. Game/UI: expose actual held origin as offset, immediate canonical predicted ball, authoritative shared counters/results, compact assigned-seat controls. Keep solo throw/drop semantics, current flick curve and painting readback fix.
4. Verification/delivery: pure rules and mocked multi-client flow, real touch solo/shared browser checks, source type/lint/build and imported-host build, independent review, exact-file GitHub manifest and Aippy/server prompts.

Interfaces: basketballRelease.ts exports ReleaseOffset, readReleaseOffset, encodeReleaseOffset(spotId,worldOrigin), releaseOriginFromOffset(spotId,offset). basketballSync.ts owns the network reducer; WorldMultiplayerSession exposes its existing admitted connection through a court bridge. WorldScene owns the game/adapter bridge.

Ruling: live-shot snapshot data is an optional documented client-supported extension, since the supplied report asks for late-arrival reconstruction but gives no exact snapshot field. Proposed court_state.liveShots has at most five entries {playerId,seatEpoch,sequence,launch,serverTime}; missing means empty, malformed entries do not render. The server must adopt this exact extension or return its schema before live late-arrival support can be claimed.

Ruling: shared counters and basket rewards use authoritative results only. Predicted balls give immediate response; rejected or cancelled pending shots cannot award shared attempts/makes. Solo coins remain local-only. No new economy or invitations are added.
