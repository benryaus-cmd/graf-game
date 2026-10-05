# Existing-server credit and protection integration

The client now reads authoritative credits from `account_state.credits` (and accepts the earlier `credit_balance.balance` envelope for compatibility). It never creates a starter allowance, accrues funds, charges, refunds or awards a protection extension locally. Positive confirmed balance changes animate in the HUD.

Sizing sends debounced world-space `protection_quote` requests with `pieceId` and `bounds`. The client serializes/coalesces quotes and invalidates displayed quotes immediately when the selected rectangle changes. `protection_quote_result` supplies cost and duration; `protection_purchase` submits the confirmed bounds, and only `protection_purchased` supplies the balance and expiry. Pending requests time out without assuming a charge was rejected; late purchase confirmations use the original purchased bounds. After an ambiguous quote timeout, quoting stays paused until reconnect because replies do not identify the request. Disconnection clears session balances and quotes.

Snapshots parse `protected`, `protectedUntil`, and `protectionBounds`. Red filled previews use public protected bounds or insufficient server-quoted funds as advisory feedback. Admin/owner bypass uses server role/permissions; server checks remain final. `piece_protection_updated` with `addedSeconds:3600` can display a confirmed +1 hour. Existing Like currently sends `piece_like`; confirm whether the final server wants that command to qualify/extend protection or a separate `piece_vote` command before replacing the working Like path.

## Remaining server contract details

- Cheap unprotected canvas purchasing/accrual pricing still needs its request/ack contract. The client currently charges only the optional protection purchase, never fabricates a canvas charge.
- Quote handlers currently require a piece ID, so a sizing draft is registered through existing `piece_create`. Clean up empty abandoned drafts server-side. Persist final piece bounds/protection bounds when purchasing after resize.
- Cancel on an empty canvas does not imply refunding purchased protection. Supply an idempotent reservation cancel/refund contract if that is intended.
- Echo a quote/request ID or bounds in quote results to distinguish a very late result after a timeout/retry.
- Paint rejection should identify rejected stroke IDs so optimistic local strokes can be removed safely; a generic error alone cannot distinguish a rejected stroke from an offline draft.
- Comments still need supported submit/fetch/broadcast messages. No fake shared comments were added.

Roles, credits, bans, kick decisions, paint validation, protected overlap, timers, qualifying votes and persistence remain owned by the existing backend. No server code or infrastructure was changed.

## Artwork names

Optional titles are trimmed to 60 characters and accompany `piece_complete` as `title`. Snapshot/piece metadata accepts `title`. Confirm the existing server stores and broadcasts that field; there is no separate invented rename API. Until that support is confirmed, a submitted name is local display metadata and is not guaranteed across reconnects.
