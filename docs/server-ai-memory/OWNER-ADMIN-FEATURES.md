# Owner/admin/server feature map

Use the exact wire schemas in CLIENT-SERVER-SCHEMAS.txt.

## Permissions rule

Never unlock moderation because a nickname says "owner" or "admin". Use the role/permissions returned by the server.

## Owner persistent references

Capability: `owner_reference_persistence`

Messages:
- `owner_reference_list`
- `owner_reference_save`
- `owner_reference_saved`
- `owner_reference_delete`
- `owner_reference_deleted`

Maximum persistent owner references: 50.

A permanent owner reference points at a server-managed artwork assetRef plus surface, world transform, size, opacity, layer preference, name and timestamps.

Normal user reference images remain temporary/local. Owner persistence is an explicit tool, useful for reseeding default graffiti/reference material after resets.

## Saved finished-art library

Capability: `saved_art_library`

Messages:
- `saved_art_list`
- `saved_art_library`
- `saved_art_save`
- `saved_art_saved`
- `saved_art_delete`
- `saved_art_deleted`
- `saved_art_place`
- `saved_art_placed`

This is account/server saved finished art and is separate from the local reference-image library.

Batch 5 defaults included 25-credit reuse and max 50 saved items, but runtime settings are authoritative because owner settings can change them live.

## Staged remove-all-art

Request:
`admin_remove_user_art`

Server emits:
- `admin_remove_user_art_started`
- `admin_remove_user_art_progress`
- `admin_remove_user_art_complete`

The server removes pieces/poster artwork in small batches, yielding between batches. The client should send one job request and show progress. Do not send hundreds of individual delete calls.

## Direct moderation deletion

Poster/image:
- request `admin_delete_artwork`
- world broadcast `artwork_removed`
- actor receives `admin_delete_artwork_complete`

Graffiti pieces use the existing admin piece-delete path.

## Owner server tools

Batch 3 provides guarded owner actions:
- save art baseline
- restore baseline
- wipe art
- restart server
- reset art + restart

Never commit the server-side owner PIN.

## Server performance

Owner can request `server_perf_status`. Health/perf includes event-loop and spatial counters. Do not poll it rapidly from ordinary player clients.
