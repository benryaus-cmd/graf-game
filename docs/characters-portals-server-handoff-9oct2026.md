# Animated characters and courtyard portals — server handover

## Required server change

Preserve one optional appearance field in the existing protocol 2 `player_state` contract: `state.cosmetics.characterModel`. There are no new wire message types, endpoints, authentication flows or capabilities. Keep current room/world identity, court version 1, HORSE rules, releaseOffset, shot physics, artwork, saves and clothing permissions unchanged.

Allowed IDs:

```json
["original","hoodie","casual-female","casual-male","casual2-female","casual2-male","casual3-female","casual3-male","suit-female","suit-male","worker-female","worker-male"]
```

Example existing request (other existing state fields remain valid):

```json
{"type":"player_state","state":{"position":[0,1.72,5],"rotation":[0,0,0],"movement":"idle","cosmetics":{"outfit":"street","top":"coral","bottom":"charcoal","accessory":"none","characterModel":"casual-male"}}}
```

Validate the model against the allowlist. Missing or unknown values render `original`; never accept arbitrary asset URLs. Preserve the existing four cosmetic fields and their validation. The twelve model choices are free and do not grant inventory, coins, outfits or permissions. Derive identity from the existing socket player, never a client-supplied player ID.

Store the normalized field alongside current player state and preserve it in existing `player_state` relays, `player_join` data and `world_snapshot.players` state, including late joins/reconnections. Changing only this field must still relay the update. Do not introduce a new appearance message. Old clients safely ignore the additional property; new clients render Original when it is absent. Model preference persists locally, so the client sends it again after joining.

Animation IDs and emote messages are unchanged. Asset-specific clips are mapped client-side; no bone or per-frame animation packets are required. The source assets use immutable GitHub URLs in the client catalog.

## Portals

The Characters portal opens local UI. Basketball teleports the player from the courtyard to `[-42,1.72,-32]`, outside the east court edge, facing the hoop. It does not reserve a seat or start a game. The resulting position uses the existing player-state transport. If the server enforces a maximum position delta, review this fixed town transition before rollout. No undocumented teleport request has been invented; propose an agreed schema if your movement validation needs one.

The Multiplayer portal is available only in solo/disconnected town play and uses the existing join flow: protocol 2, room `morning-quarter-v1`, world `map2-v1`, existing hello/authentication/profile handling. There is no new room or portal endpoint. The Original local map is unchanged.

## Acceptance checks

1. Two real clients choose different new models and see each other correctly.
2. Changing appearance while connected updates a peer without reconnecting.
3. A late join receives the current models in its snapshot; reconnect resends local choice.
4. Missing/invalid model IDs fall back to Original without disturbing movement, clothes, chat, paint or court play.
5. Existing movement validation permits the fixed courtyard-to-court landing or returns an agreed alternative contract.

Frontend tests and a mocked browser server verify client behavior only. They do not prove deployment of this server change. No `horse_decline` or `horse_cancel` command was added by this update.
