# GraffCiti Town Multiplayer + Basketball Contract Review

Date: 9 Oct 2026
Repo: benryaus-cmd/graf-game, branch main

## 1. Main town backend decision

The current frontend town contract fits the existing GraffCiti server architecture. No alternate backend/service/socket is needed.

Current frontend already does the required town scoping:

- `src/multiplayer/config.ts`
  - `MAIN_ROOM_ID = "morning-quarter-v1"`
  - `MAIN_WORLD_ID = "map2-v1"`
- `src/game/mapPreference.ts`
  - only `map2` may join multiplayer
  - original city remains local-only
- `src/components/WorldScene.tsx`
  - town join calls `WorldMultiplayerSession.join(..., MAIN_ROOM_ID, ..., MAIN_WORLD_ID)`
- `src/multiplayer/connection.ts`
  - sends `worldId` on protocol-2 join
  - refuses a `world_snapshot` whose `roomId` or `worldId` does not match
  - does not fall back to `public`
- `src/multiplayer/surfaces.ts` + town construction
  - town wall IDs are already namespaced independently of the original city

The server already persists every room independently as `/data/worlds/<roomId>.json`, routes all post-join mutation handlers through the connection-bound `ws.room`, and keeps accounts/credits/roles outside room persistence. Therefore `morning-quarter-v1` is a clean new persistent world while `/data/worlds/public.json` remains preserved.

No old public artwork is migrated or deleted. The town starts as its own empty/shared art namespace.

## 2. Batch 9 server additions

The prepared server patch adds only explicit world identity on top of the existing room isolation.

Static mapping:

```js
{
  "morning-quarter-v1": "map2-v1"
}
```

Hello adds optional capability:

```json
{
  "type": "hello",
  "protocol": 2,
  "networkRevision": 6,
  "capabilities": [
    "...existing capabilities...",
    "world_identity_v1"
  ]
}
```

Accepted town join remains exactly the frontend's existing shape:

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
  "capabilities": [
    "spatial_interest_v1",
    "spatial_world_delta_v1",
    "player_directory_v1"
  ],
  "spatialInterest": true,
  "position": [0, 1.72, 5]
}
```

Accepted initial and resync snapshot keeps the existing schema and adds the identity field:

```json
{
  "type": "world_snapshot",
  "protocol": 2,
  "roomId": "morning-quarter-v1",
  "worldId": "map2-v1",
  "playerId": "server-issued-player-id",
  "revision": 0,
  "sequence": 0,
  "strokes": [],
  "artworks": [],
  "graffitiPieces": [],
  "worldItems": [],
  "chatHistory": [],
  "players": [],
  "playerDirectory": []
}
```

The real message continues to include all current fields. Empty arrays above are only examples.

Town missing/wrong identity is rejected before room admission:

```json
{
  "type": "error",
  "code": "world_update_required",
  "roomId": "morning-quarter-v1",
  "expectedWorldId": "map2-v1",
  "receivedWorldId": null,
  "message": "The server requires the Town world identity map2-v1. Solo is still available.",
  "serverTime": 1791490000000
}
```

A client attempting to attach an explicit world identity to a legacy/non-mapped room is rejected:

```json
{
  "type": "error",
  "code": "unsupported_world",
  "roomId": "public",
  "expectedWorldId": null,
  "receivedWorldId": "map2-v1",
  "message": "That room/world combination is not supported. Solo is still available.",
  "serverTime": 1791490000000
}
```

Legacy `public` and other existing rooms remain backward compatible when they omit `worldId`.

The server now sends the accepted town `world_snapshot` before `permissions`, `account_state` and `spectator_state`, matching the scoped client's current pre-snapshot guard. Identity, roles, moderation, credits, artwork uploads, protected canvas purchases, saved art and all existing APIs remain unchanged.

Town persistence records also carry:

```json
{
  "roomId": "morning-quarter-v1",
  "worldId": "map2-v1"
}
```

The room filename remains `/data/worlds/morning-quarter-v1.json`; the original public room remains `/data/worlds/public.json`.

## 3. Main-town frontend changes required

None for the current `main` branch.

The relevant current files already match the server contract:

- `src/game/mapPreference.ts`
- `src/multiplayer/config.ts`
- `src/multiplayer/connection.ts`
- `src/multiplayer/worldSession.ts`
- `src/components/WorldScene.tsx`
- `src/multiplayer/surfaces.ts`

Do not rename `map2`, `map2-v1`, `morning-quarter-v1`, or the namespaced `ss1:map2-v1:...` paint IDs.

## 4. Main-town deployment smoke checks in Batch 9

The installer checks:

- exact source SHA before modifying the server
- source backup before replacement
- backup of current `/data/worlds/public.json`, public art baseline, account data and runtime/moderation settings into `/data/town-migration-backups/<timestamp>/`
- `node --check`
- rebuild/restart and 2 CPU / 2 GB container limit
- public health endpoint
- `world_identity_v1` hello capability
- accepted town join with `morning-quarter-v1` + `map2-v1`
- town resync returns the same room/world identity
- missing town `worldId` is rejected
- a legacy no-worldId room still connects
- no player presence leaks from town to the legacy room
- the public world file remains present

The patch does not wipe, reset or migrate the old public room.

## 5. Shared basketball/HORSE status

NOT DEPLOYED in Batch 9.

The checked-in `CourtSession` is still a proposal. Its current `court_shot` request accepts only `gesture`, while local `BasketballGame.shoot()` launches from the actual movable held-ball world release position. Those two paths are not deterministic equivalents yet.

The clean backend contract is to amend the not-yet-deployed version-1 request with a bounded mark-relative release offset. Do not accept client velocity or a client `made` flag.

### Proposed v1 `court_shot`

```json
{
  "type": "court_shot",
  "version": 1,
  "roomId": "morning-quarter-v1",
  "mapId": "map2",
  "courtId": "map2-basketball",
  "revision": 12,
  "shotId": "s7-3",
  "sequence": 3,
  "seatEpoch": 7,
  "gesture": {
    "dx": 0.08,
    "dy": 0.54,
    "durationMs": 92
  },
  "releaseOffset": {
    "right": -0.32,
    "up": 1.48,
    "forward": 0.81
  }
}
```

`releaseOffset` is in metres relative to the server-assigned shooting mark, not arbitrary world space.

For the assigned mark:

```text
spot = BASKETBALL_COURT.spots[seat.spotId].position
forward = normalized horizontal vector from spot -> rim centre
right = perpendicular horizontal vector [forward.z, 0, -forward.x]
origin = spot + right * releaseOffset.right
              + [0, releaseOffset.up, 0]
              + forward * releaseOffset.forward
```

Server validation before simulation:

```text
right   finite and -1.75 <= right <= 1.75
up      finite and  0.40 <= up    <= 2.80
forward finite and  0.05 <= forward <= 1.75
hypot(right, forward) <= 2.10
reconstructed origin must remain inside the court bounds expanded by 2 m
```

The server still validates the existing gesture, seat epoch, sequence, turn, cooldown and canonical `shotId`. The server computes velocity with the shared `launchFromFlick` code using the reconstructed authoritative origin. No world-space velocity comes from the client.

Because `basketball_court_v1` has never been deployed, this can remain protocol `version: 1`; update the proposal before the first deployment rather than inventing a v2 compatibility layer for a protocol that has no live users.

### Shared shot server flow

1. Validate connection is already admitted to `morning-quarter-v1` / `map2-v1`.
2. Ignore any payload player ID; use `ws.clientId`.
3. Validate court scope is exactly `map2` / `map2-basketball`.
4. Validate assigned seat/epoch/sequence and bounded `releaseOffset`.
5. Reconstruct release origin.
6. Run the shared launch + fixed-step simulation server-side.
7. Immediately broadcast authoritative launch:

```json
{
  "type": "court_shot",
  "version": 1,
  "roomId": "morning-quarter-v1",
  "mapId": "map2",
  "courtId": "map2-basketball",
  "revision": 13,
  "serverTime": 1791490000000,
  "playerId": "server-player-id",
  "seatEpoch": 7,
  "sequence": 3,
  "launch": {
    "courtId": "map2-basketball",
    "shotId": "s7-3",
    "spotId": 2,
    "version": 1,
    "origin": [-52.9, 1.48, -34.7],
    "velocity": [0.2, 6.3, -3.8]
  }
}
```

8. Broadcast/schedule the authoritative result no earlier than its physical result time:

```json
{
  "type": "court_result",
  "version": 1,
  "roomId": "morning-quarter-v1",
  "mapId": "map2",
  "courtId": "map2-basketball",
  "revision": 13,
  "serverTime": 1791490000942,
  "playerId": "server-player-id",
  "seatEpoch": 7,
  "sequence": 3,
  "result": {
    "courtId": "map2-basketball",
    "shotId": "s7-3",
    "spotId": 2,
    "version": 1,
    "outcome": "make",
    "swish": true
  },
  "state": { "...authoritative CourtState...": true }
}
```

The existing `court_state`, `court_rejected`, seat allocation and HORSE state shapes can otherwise remain as documented.

### Frontend changes required before shared basketball can be enabled

1. `src/game/basketballSession.ts`
   - add required `releaseOffset` to `court_shot`
   - decode/validate the same bounded shape
2. `src/game/basketballGame.ts`
   - when the held ball is released, compute the mark-relative offset from the actual `held.position`
   - expose both `gesture` and `releaseOffset` to the multiplayer adapter
   - keep immediate local launch for responsiveness
3. `src/components/WorldScene.tsx` / multiplayer court adapter
   - only offer shared court controls when server hello advertises `basketball_court_v1`
   - send the request using server-issued seat epoch/revision
   - dedupe own authoritative launch echo by canonical shot ID
   - on rejection, reconcile to authoritative state without crediting a make/attempt to shared state
4. late arrivals
   - consume the server's bounded live-shot list and reconstruct elapsed balls with existing `createBall(launch, elapsedSeconds)`
5. HORSE
   - leave disabled until the shared-shot request above is implemented and two-client deterministic equivalence is verified

Do not add basketball state to `player_state`, chat, artwork persistence, or the public room.
