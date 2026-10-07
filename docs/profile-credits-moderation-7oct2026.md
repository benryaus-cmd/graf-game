# GraffCiti profile privacy, online credits and moderation

Incremental client update over reference-social-polish-7oct2026. No server code, host wrapper, importer, paint, flattening, movement or economy implementation changes.

## Player profiles and permissions

Public profiles show nickname, known Aippy @username and ONLINE/OFFLINE. Old history with no stored username continues to say Aippy tag unavailable. Session/player ID and target role appear only in the collapsed ADMIN INFO section for a viewer whose server-returned role is owner or admin. Internal player IDs remain intact. The redundant public Role label in Nearby Art has been removed.

The viewer role comes from WorldMultiplayerSession's existing server permissions/status and is passed by App as ownRole. No nickname-based privilege checks exist. Owner alone sees SEND CREDITS and can grant to self or a known offline author. The card, App callback and action builder all restrict grants to owner. This uses the existing admin_give_credits request and server acknowledgment; it never changes a balance optimistically.

Admin/owner moderation remains in the player card opened from the roster, avatar or chat author. Kick targets online players immediately. Ban supports existing presets, permanent and custom whole minutes (converted to the existing durationSeconds field). Mute/unmute target known usernames, including offline authors whose role is known and allowed. Admin cannot target a known owner or an unknown role; owner can. Self-moderation is hidden. Existing role controls and server confirmation handling remain.

## Exact mute contract

MUTE CHAT sends `{type:"admin_mute",targetUsername,durationMinutes,reason?}`. The duration is an integer from 1 to 10080 inclusive (7 days), matching the supplied live server contract. Permanent mute is unsupported and has no UI option. UNMUTE CHAT sends `{type:"admin_unmute",targetUsername}`. No acknowledgment format was supplied for these requests; the card says Requested rather than claiming success.

The client presents chat_mute_state and chat_muted from the server. While a valid server-supplied remaining time is positive, Send is disabled and the chat footer shows MUTED with rounded-up minutes and an optional reason. Draft input is retained while composing. Explicit muted:false clears the notice. When the supplied time expires, the UI allows a new attempt and states that the server checks the message; it does not declare an authoritative unmute. Missing/invalid timing also allows a server-checked retry rather than inventing a permanent local block. An accepted live self-message clears stale presentation state. A one-second clock updates only the visible chat countdown, never credits or server mute state.

## Authoritative online reward display

The existing credit_balance message is accepted by ProtectionSync, which updates creditBalance and triggers its changed callback. WorldMultiplayerSession emits the protection view; WorldScene passes that view to App. App supplies protection.creditBalance to CanvasCredits. Its existing positive-delta display shows +2 for 2.5 seconds when the server balance increases by two. The same existing display remains available for other positive balance changes.

The connected credits HUD has a subtle tooltip: Online reward: +2 credits per full minute. No local earning timer, second economy balance, reward notification system or new credit protocol was added. ProtectionSync is unchanged. Account earning, persistence, full-minute timing and multi-connection deduplication remain server-owned.

## Exact runtime files

| Source | Aippy target |
| --- | --- |
| src/App.tsx | src/games/importedGame/upstream/src/App.tsx |
| src/components/CanvasCredits.tsx | src/games/importedGame/upstream/src/components/CanvasCredits.tsx |
| src/components/GraffitiPieces.tsx | src/games/importedGame/upstream/src/components/GraffitiPieces.tsx |
| src/components/MultiplayerChat.tsx | src/games/importedGame/upstream/src/components/MultiplayerChat.tsx |
| src/components/MultiplayerControls.tsx | src/games/importedGame/upstream/src/components/MultiplayerControls.tsx |
| src/components/PlayerInteractionCard.tsx | src/games/importedGame/upstream/src/components/PlayerInteractionCard.tsx |
| src/index.css | src/games/importedGame/upstream/src/index.css |
| src/multiplayer/adminActions.ts | src/games/importedGame/upstream/src/multiplayer/adminActions.ts |
| src/multiplayer/chatMute.ts (new) | src/games/importedGame/upstream/src/multiplayer/chatMute.ts |
| src/multiplayer/protocol.ts | src/games/importedGame/upstream/src/multiplayer/protocol.ts |
| src/multiplayer/worldSession.ts | src/games/importedGame/upstream/src/multiplayer/worldSession.ts |

Tests: tests/adminActions.test.ts, tests/player-surfaces.test.ts, tests/chat-mute.test.ts (new), tests/session-social-rewards.test.ts (new).

WorldSession edits are confined to mute presentation state, incoming mute messages, existing presentation reset sites, and view emission. Its painting, finishing, timers, flatten fallback and session-switch algorithms are unchanged. worldPainting, sprayHeads, paintSurfaceLayer, architectureWalls, paintSync, paintReplay, pieceFlatten, artworkSync, connection, pieceSync and server files are unchanged.

## Validation and server work

All 188 automated tests pass; application TypeScript, ESLint, standalone production build and isolated Aippy-host production build pass. Browser checks at a 390x640 portrait viewport exercise profile privacy, actual owner self-grant controls, roster/chat author resolution, custom ban conversion, exact mute/unmute requests, disabled/reenabled chat, draft composition and the existing +2 HUD gain. Transport is mocked; this does not claim a live administrative kick/ban/mute or a real credit grant was sent.

No additional server work is required for the supplied reward and timed-mute contracts. A future permanent mute would require a separately documented server contract before adding that option. Existing server enforcement remains authoritative for all admin and credit actions.

Import only the 11 pinned runtime mappings in updates/profile-credits-moderation-7oct2026.json using Node 22. Stage every download first, then replace the exact upstream targets. Preserve all unlisted files and run the normal production build. Do not perform a full re-import or modify host/import/build infrastructure.
