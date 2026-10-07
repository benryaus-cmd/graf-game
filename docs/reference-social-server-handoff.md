# Server AI: reference/social patch

No server work is needed for reference placement, ghost stacking, bounds visibility, colours, panel collapse or a names list when the current presence events already contain identities. No new WebSocket action or endpoint was introduced.

Verify existing moderation against the deployed backend:

- `admin_kick`: `{type:'admin_kick', targetUsername, reason?}`. Owners/admins should be validated by the backend. Remove the target connection and broadcast existing `player_left`; the initiating UI waits for departure rather than inventing a success ACK.
- `admin_ban`: `{type:'admin_ban', targetUsername, durationSeconds, reason?}`. Existing client presets are 600, 3600, 86400, 604800 seconds, or null for permanent. Preserve existing expiration/enforcement and reply with `admin_ban_complete`, targetUsername, bannedUntil (epoch milliseconds) or permanent. `admin_unban` and `admin_unban_complete` already exist in the client.
- Presence snapshot/join should carry stable playerId, separate username/nickName and role; role changes retain existing player_role_changed. A count alone cannot supply missing names or safe admin target handles. Do not infer usernames from displayName.

For reliable author identification after leaving/reconnecting, include authenticated `username` and `nickName` in each existing chat message object and persisted chatHistory entry, alongside id/playerId/displayName/text/timestamp. The new client already accepts these optional fields. Source them from the authenticated server session; never trust text or a sender-provided handle for moderation authority. Backfill old history only when there is a reliable identity mapping; otherwise retain its known ID and leave the tag unavailable.

No server-wide announcement contract was found in the client. If the backend already supports one, provide its exact action, role rules, payload and acknowledgement before client UI is added. Do not overload normal public chat to fake a special announcement.

Preserve local-first movement/painting, all stroke/sample/piece IDs and existing immediate piece_flatten flow. Deferred flatten capability remains disabled. This patch does not address wall-level paint layers, permanent piece stacking or save/upload stalls. The separate server-save-lag-handoff.md remains the diagnostic brief for save stalls; no speculative server optimisation was performed here.
