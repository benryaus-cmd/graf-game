# GraffCiti main town: existing-server handover

Owner instruction, 9 October 2026 (Australia/Sydney): the premium town previously labelled Map 2 is now the main world and the only world offered multiplayer. The original city stays selectable for local play. Extend the existing server if this contract fits it; otherwise return your recommended exact schemas so the frontend can be adapted. Do not create another backend or silently move old artwork into the town.

Repository: https://github.com/benryaus-cmd/graf-game

## What is changing, and what is not yet deployed

- Fresh clients start in the town, offline. Joining multiplayer remains a deliberate action. Explicit saved map choices, settings and local artwork remain intact.
- The frontend requests an isolated town room and requires the snapshot to confirm its world identity. This is client integration work, not evidence that the live server accepts the new room.
- Main-town movement, painting, chat, profiles, existing artwork and account features reuse the current protocol-2 integration. The old city has no Join action.
- Basketball remains solo practice. Five-seat allocation, deterministic shots and two-player HORSE have reusable pure rules but no enabled shared-court client or deployed server adapter.
- Existing endpoint: `wss://24.144.88.205/multiplayer`. Existing health and binary artwork endpoints: `https://24.144.88.205/health` and `https://24.144.88.205/artwork-upload`. Keep them; no new socket, service, VM or account system.

## Stable identity and persistence isolation

| Concept | Town | Original city |
| --- | --- | --- |
| Internal map ID | `map2` | `original` |
| Layout/world identity | `map2-v1` | Existing original identity/addressing |
| Requested multiplayer room | `morning-quarter-v1` | Local only in this client; preserve old `public` server data |
| Local paint chunk keys | `map2-v1:<chunk-key>` | Existing unprefixed chunk keys |
| Multiplayer paint wall IDs | `ss1:map2-v1:<cx>:<cz>:<geometry-key>` | Existing unprefixed `ss1` wall IDs |
| Basketball court | `map2-basketball`, marks `0..4` | None |

The labels change; canonical IDs do not. Do not rename `map2` to `main` in save keys, strip `map2-v1`, or reuse the old `public` snapshot for the town. Isolate persisted strokes, artwork placements, pieces/claims, world items, revisions, operation deduplication and spatial subscriptions by their existing room/world scope. Account-level identity and balances may remain account-owned according to the existing service; do not reset or duplicate them merely because the player joins a new room.

The server must bind each connection to its admitted room/world and reject cross-scope operations. It must not trust a client to reassign its room through a paint or court payload. Preserve old `public` storage for recovery/older clients; this handover does not authorise its deletion, migration or reset.

## Required town join and snapshot contract

The client waits for the existing `hello`, checks protocol/network capabilities, then sends the existing join fields plus a world identity:

```json
{
  "type": "join",
  "protocol": 2,
  "roomId": "morning-quarter-v1",
  "worldId": "map2-v1",
  "displayName": "Aippy nickname",
  "username": "aippy_username",
  "nickName": "Aippy nickname",
  "networkRevision": 6,
  "capabilities": ["spatial_interest_v1", "spatial_world_delta_v1", "player_directory_v1"]
}
```

The optional existing spatial negotiation can also add `spatialInterest: true` and the initial `position: [x,y,z]`. Preserve it and all existing hello fields. Identity fields above are separate display/profile values; use existing authentication and server-issued player IDs rather than treating a nickname/username as verified credentials. Town admission requires protocol 2; generic legacy connection callers remain backward-compatible, but the main-town UI does not request the old public room.

Every accepted initial or resynchronisation `world_snapshot` must retain the existing schema and contain:

```json
{
  "type": "world_snapshot",
  "playerId": "the-player-id-issued-in-hello",
  "roomId": "morning-quarter-v1",
  "worldId": "map2-v1",
  "strokes": []
}
```

This is the minimum identity fragment, not a replacement schema. Keep revision/order fields, players/directory, chat, pieces, artworks, permissions, history, world items and existing metadata. Empty arrays are illustrative only; load the town's real persisted records. The frontend must not apply a missing/mismatched world snapshot or fall back to `public`. A server that cannot serve this town should explicitly reject the join and leave local play available. Do not advertise `map2-v1` while loading original geometry/artwork.

After admission, route deltas, strokes, artwork, chat and player updates only within that bound room/world, including reconnect/resync and background spatial updates. If your backend requires a different identity field or capability handshake, return the exact join, hello, snapshot, event and error schemas before replacing this contract; do not mask incompatibility by echoing a false identity.

The scoped town client ignores `account_state`, `permissions`, `credit_balance`, `spatial_status` and `chat_mute_state` received before an accepted world snapshot. Send those bootstrap updates after the matching snapshot, or include supported account fields in the snapshot itself. A world mismatch closes the connection before snapshot content is applied and shows “The server needs the Town world update. Solo is still available.” Implement an explicit rejection for an unsupported room/world rather than allowing a timeout.

## Files to inspect before wiring

| Source | Purpose |
| --- | --- |
| `src/game/mapPreference.ts` | Map selection, per-map sky/render preferences and unchanged local artwork namespace |
| `src/App.tsx`, `src/components/WorldScene.tsx` | Main/local UI choice, explicit join gating and world disposal |
| `src/multiplayer/config.ts`, `connection.ts`, `worldSession.ts` | Endpoint/room/world constants, join/snapshot guard and existing session lifecycle |
| `src/multiplayer/protocol.ts`, `spatialProtocol.ts`, `worldOrder.ts` | Actual decoders, ordered shared data and spatial deltas |
| `src/multiplayer/surfaces.ts` | Stable wall identity and `/f<face>/l<layer>` addresses; do not use mesh UUIDs or array indexes |
| `src/game/morningQuarterLayout.ts`, `morningQuarterContent.ts` | Town coordinates, building orientation, props, walkways, colliders and paint targets |
| `src/game/quarterBuildingAssets.ts`, `quarterPaintSurface.ts` | Imported building/individual brick surfaces and lazy paint layers |
| `src/game/basketballCourt.ts`, `basketballPhysics.ts`, `basketballSession.ts` | Court geometry, bounded simulation, seat/HORSE groundwork |
| `docs/basketball-server-handoff.md` | Detailed proposed shared-court contract and gaps still requiring agreement |

Town geometry uses nine 48 m resident chunks with district walls around x/z ±71 m. Spawn comes from `QUARTER_SPAWN` (currently x=0, z=5); preserve the game’s actual vertical player placement. Basketball bounds/rim/backboard and all five marks come from `BASKETBALL_COURT`, not hand-copied server coordinates. Imported façades, small bricks, benches and backboard are paint targets, not only the large building shells. Surface addresses are assigned before the preserved building pose transforms, so reconstruct world hit coordinates using the same transforms rather than assuming the ID encodes current orientation.

Do not confuse the renderer's 48 m chunk grid with the existing network spatial grid. Inspect `worldSession.ts` and the actual server spatial configuration before changing either. No map-geometry downloader, new game assets or renderer settings need to run on the server.

## Existing authority and responsiveness

Keep Aippy `username`, `nickName` and derived `displayName` separate. Roles/permissions, protected-area purchases, credits, verified-account checks, expiry, deduplicated spending and shared Undo/Redo remain server-owned. Do not grant owner/admin from a nickname, transfer browser solo coins into online credits, or bypass the current verified-account requirement.

Local movement/look/painting respond immediately; batch and reconcile remote events using the existing integration. Joining must not upload local town textures automatically. Disconnect returns to a usable solo world without importing shared art into local saves. Keep solo canvas-readback Undo/Redo disabled: its earlier painting regression must not be reintroduced while adding server history.

## Basketball is a separate, staged contract

First wire town presence/painting safely. Then agree the court protocol: explicitly advertise `basketball_court_v1`/version 1, allocate at most five unique marks, release them on leave/disconnect, bind shot IDs to allocation epoch/sequence, dedupe echoes and derive outcomes server-side. No client `made` flag, per-frame ball streaming or artwork persistence for balls. Balls expire after three seconds; local input/launch must not wait for the server.

The latest local interaction grabs and moves the visible ball; every normal release launches, including a zero-power drop. Cancellation/menu/blur/map change do not launch. Power uses recent release motion with a softer capped curve, not stationary charging. Consume the checked-in physics version rather than an older 9.1 m/s calibration.

There is an important contract gap to resolve before enabling shared basketball: local shots use the movable held ball's actual release origin, but the current pure `CourtSession` request contains only a gesture and computes a canonical origin. Do not claim deterministic client/server shot equivalence while those origins differ. Recommend either a bounded, server-validated release-origin representation attached to the assigned mark (and validated maximum launch speed/direction), or a shared reconstruction of held-ball placement. Return the exact request/validation/schema changes needed; the frontend can then be updated. Court/HORSE rules should consume authoritative validated simulation results, independently of presentation.

## Acceptance and requested reply

1. Verify unknown/mismatched world rejection, town join, correct initial/resync identity, preserved old `public` storage and no cross-world art/chat/player leaks.
2. Exercise two real clients for nearby presence, movement, painting/echo deduplication, artwork/piece reload and reconnect. Verify restart persistence on the existing service.
3. Verify original local selection never connects, local and shared art stay distinct, and unavailable service leaves solo painting/basketball working.
4. Keep existing permissions/account checks, economy and upload APIs unchanged unless an explicit schema change is returned for approval.
5. Only after agreed court support: test five simultaneous shooters/full court, seat cleanup/reconnect epochs, replayed shots, bounded release origin, deterministic rim/board results, late arrivals, and two-player HORSE turns/departure.

Reply with the backend files changed or proposed, the actual supported world/room mapping, exact wire JSON for any differences, capabilities/version/error additions, validation/persistence rules, test results, deployment status and frontend files/schema changes still required. Clearly separate deployed main-town multiplayer from proposed shared basketball/HORSE. If a different backend shape fits better, explain it and supply schemas; the owner will bring them back to the frontend developer.
