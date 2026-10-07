# Spatial networking model

## Why it was necessary

Before Batch 6, each moving player could broadcast state to essentially every other player. At 50 movers, the measured traffic matched the expected all-to-all pattern: roughly 24,500 movement deliveries/second.

That architecture becomes expensive approximately as N².

Batch 6 changes the server to send high-frequency state only where it matters.

## Spatial join

The server still starts with a normal `hello`.

The client must check for `spatial_interest_v1` and only then opt in with:

```json
{
  "type": "join",
  "roomId": "public",
  "protocol": 2,
  "username": "...",
  "nickName": "...",
  "displayName": "...",
  "spatialInterest": true,
  "position": [x, y, z]
}
```

A valid initial position is required for spatial mode.

## Player delivery tiers

- 0–25m: full incoming update rate, currently up to about 10Hz from the client.
- 25–60m: about 4Hz.
- 60–100m: about 1Hz.
- >100m: avatar leaves relevance and receives no movement stream.

The global online list is separate from 3D avatar relevance.

## Directory vs avatar

Spatial snapshot:
- `playerDirectory[]` = global lightweight online identity list.
- `players[]` = currently relevant/renderable avatars.

Events:
- `player_directory_joined` / `player_directory_left` change the online roster.
- `player_joined` / `player_left` with `spatial:true` change the 3D avatar set.

A player leaving 3D relevance is not the same as disconnecting.

## Live paint

Live stroke begin/points/end are delivered to spatial clients within roughly 60m.

Legacy clients still get full-room delivery, which is why stale production clients should eventually be revision-gated after the new client is deployed.

## Persistent world

Spatial clients receive nearby pieces, poster/image artwork and strokes. The initial snapshot is filtered and ongoing changes arrive in `spatial_world_delta`.

## Critical unload rule

`spatial_world_delta.removePieceIds`, `removeArtworkIds`, and `removeStrokeIds` mean:

**temporarily unload because the entity is no longer relevant to this client.**

They do NOT mean the authoritative world deleted the entity.

The client must allow the same ID to return later through an upsert.

Permanent deletion uses normal authoritative events such as:
- `piece_removed`
- `artwork_removed`
- undo broadcast for authoritative stroke removal

Do not route spatial unloads through permanent tombstone/delete logic.

## Resource goal

Off-range artwork should release expensive render/GPU/image state where possible. Identity and authoritative knowledge must not be destroyed just because an object is currently outside spatial relevance.
