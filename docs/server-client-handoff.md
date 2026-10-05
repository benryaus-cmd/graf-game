# Existing-server client handoff

Use the existing protocol-v2 backend at the configured VITE_MULTIPLAYER_URL. No new service or infrastructure is included.

## Accepted owner updates

The owner reports the position validation callback is fixed for player and world-item arrays. The client sends finite [x,y,z] and preserves local-first movement and painting. This pass has not independently reverified the live deployment.

Aippy username, nickName and resolved displayName remain separate in joins and remote player records. These values are intentionally client-trusted display identity. Server connection playerId is authoritative. No token request or client-side owner privilege is introduced.

## Graffiti pieces

Selected painting sessions send piece_create with world-space anchor and bounds, associate stroke_begin with pieceId, and send piece_complete when finished. The client does not register a catalogue of walls; its deterministic surface IDs are rendering metadata. Current snapshots remain supported. Piece metadata is isolated from stroke rendering so nearby chunk delivery can be added without rebuilding the drawing system.

The ART panel displays nearby pieces and requests piece_like. Server metadata owns counts, window dates and survival status. Each piece receives its own 24-hour window and needs 20 new qualifying likes per window. The owner has implemented cleanup on the existing server. piece_removed removes associated strokes, rebuilds affected loaded surfaces and tombstones late stroke echoes. Full snapshots also reconcile removed accepted paint and artwork.

The client accepts piece_created, piece_updated, piece_completed and piece_liked metadata broadcasts when supplied. Exact broadcast envelopes beyond the supplied piece_removed contract should be checked against server output. A coalesced resnapshot provides metadata refresh compatibility.

## Remaining contracts and quality work

- Nearby chunk subscriptions/paged checkpoints are forthcoming server work; this client still accepts whole-room snapshots. Replay is frame-budgeted and indexed; image loading is bounded, cancelled on stale requests and times out.
- artwork_place uploads use the existing binary endpoint and persistent assetRef. Association of poster artwork with piece survival and removal has not been specified; do not assume strokeIds deletes posters.
- The visual selection box is UNPROTECTED. Four-hour claims, paid expansion/overpainting and credit rewards require supported authoritative events.
- Inventory/trade scaffolding retains server validation. Do not bypass verified-account requirements or invent a local shared economy.
- Existing avatars remain. Advanced wall heads, layers, collectible/trading UI and licensed model upgrades are later work. Tag Studio heads are implemented independently.
- Unit tests, application TypeScript and production build are checked. Phone frame rates and two-browser live convergence still require gameplay testing; a passing build does not establish AA production readiness.
