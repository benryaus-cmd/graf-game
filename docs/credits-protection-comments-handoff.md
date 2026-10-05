# Next existing-server contracts

The owner now requests credits, basic protection and comments. These are not in the supplied protocol-v2 handover. Do not invent live message names or pretend client-only state is shared authority.

Implement these in the existing backend, not a new service, then supply the exact request, acknowledgement, broadcast and snapshot shapes:

- Credits: starter balance sufficient for two maximum-size pieces; slow server-timed accrual only while connected. Persist balances across reconnects. Prevent reconnect starter grants and duplicate-session accrual. Reserve/deduct by piece or area, never per spray sample. Give accepted reservations a bounded painting budget so local drawing stays immediate. Specify starting allowance, maximum box area, cost and accrual rate together.
- Protection: reserve a world-space bounded area for a piece, retain owner and server expiry, reject overlapping placement/paint by other players until expiry (the agreed goal is four hours). Validate both strokes and artwork placement; drips outside a box must not bypass another protected piece. Include protected metadata in snapshots and broadcasts. Expiry and rejection belong to the server, not a local clock or localStorage.
- Art comments: piece ID, plain text, server-generated ID/timestamp and sender display identity. Bounded recent comments, length/rate limits, duplicate-request handling and removal when the piece expires. Supply fetch/submit/broadcast envelopes.

piece_like and piece metadata are already connected. Client-trusted Aippy names remain display identity, not secure ownership/authentication. Specify the temporary owner key policy consistently with the current server; do not claim this solves secure account identity.

No backend code or infrastructure was changed in this client pass.

## Admin additions requested

The supplied `permissions`, `admin_delete_piece`, `admin_delete_piece_complete`, and `piece_removed` contracts are now integrated. Client controls use server permissions and wait for shared removal. Contextual player management uses `admin_set_role`, its acknowledgement and `player_role_changed`; admins cannot assign or change owners. Server role persistence remains the owner's separate work. Protected-area enforcement and any independent poster-deletion contract remain server work; nickname matching grants no client privileges.

## Concrete canvas economy proposal (not a live server contract)

Use separate canvas credits: 1 credit per square metre, rounded up with minimum 1. A medium 2 × 2 m canvas costs 4; an ultra 8 × 8 m canvas costs 64. Give 128 starter credits once, then accrue 4 per 300 connected seconds (0.8 per minute). Solo costs nothing. Charge once when Start Painting accepts a piece reservation, not on individual strokes. Balance, starter entitlement, elapsed connected time, reservations, expansion costs, overlap rejection and admin bypass must be server-owned and included in reconnect snapshots. Keep drawing immediate after admission. Supply exact message envelopes before client wiring.
