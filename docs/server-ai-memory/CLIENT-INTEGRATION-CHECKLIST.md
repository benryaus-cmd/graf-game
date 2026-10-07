# Client integration checklist

The server work is ahead of the production client. Do not create a second networking stack. Extend the existing files.

## Connection

`src/multiplayer/connection.ts`

- wait for `hello`
- preserve protocol 2
- inspect `hello.capabilities`
- when `spatial_interest_v1` exists, send `spatialInterest:true` plus initial world position
- preserve legacy fallback when capability is absent
- keep username, nickName and displayName separate
- do not depend on the proposed networkRevision gate until it is verified live

## World session

`src/multiplayer/worldSession.ts`

- pass initial player position into connection join
- use `playerDirectory` for the Online roster
- use `players` / spatial player events for 3D avatar lifecycle
- implement `spatial_world_delta`
- distinguish temporary spatial unload from permanent deletion
- preserve local-first painting
- keep player movement max around current 10Hz
- add undo/redo request + state handling
- add owner reference list/save/delete
- add admin bulk removal progress

## Protocol types

`src/multiplayer/protocol.ts`

Add concrete types/readers for SpatialConfig, DirectoryPlayer, SpatialStatus, SpatialWorldDelta, StrokeHistoryState, gesture undone/redone, OwnerReference, owner reference list/saved/deleted, admin bulk removal progress and saved-art responses where not already typed.

## Player directory / avatars

`src/multiplayer/playerDirectory.ts`
`src/multiplayer/remotePlayers.ts`

Global roster and rendered avatars are different things.

Spatial out-of-range:
- remove/despawn 3D avatar
- retain Online/profile identity

Real disconnect:
- remove directory identity

## Painting

`src/multiplayer/paintSync.ts`
`src/multiplayer/paintReplay.ts`

- undo deletes the exact supplied authoritative stroke IDs
- redo restores supplied full strokes
- rebuild only affected surfaces
- add temporary spatial unload path that can later reload same IDs
- never mark spatial unload as permanent/tombstoned

## Pieces

`src/multiplayer/pieceSync.ts`

- support spatial upsert
- support temporary unload
- keep authoritative `piece_removed` permanent
- retain ownerUsername/ownerNickName

## Artwork

`src/multiplayer/artworkSync.ts`

- reduce `MAX_CONCURRENT_IMAGE_LOADS` from 10 to **7**
- spatially unmount off-range art and permit later reload
- permanent `artwork_removed` remains permanent
- preserve async image decoding

## Reference images

Relevant files include `src/game/referenceImage.ts`, `src/game/referenceGuide.ts`, `src/components/ReferenceSheet.tsx`, and `src/components/ReferenceControls.tsx`.

Required:
- temporary reference lifecycle cleanup
- local IndexedDB URL/file reference library + thumbnails
- owner explicit server-persistent references
- world/reference colour sampling
- reference remains non-raycastable for painting

## Product/UI work grouped with this integration

- undo/redo near zoom controls, last 2 full finger gestures
- Brush Settings between Brush and Colour
- replace Drip with ERAZE, white background/black text
- art owner identity + profile link
- selected art throbs/glows through walls for >=3s
- Nearby Art -> View triggers same pulse
- admin/owner Remove All Art uses one staged server job
- SOLO button asks only whether to join multiplayer
- top bar: `Credits XYZ` -> `C XYZ`
- remove the word `Online` beside the green count
