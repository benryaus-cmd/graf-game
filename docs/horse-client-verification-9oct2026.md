# HORSE client verification — 9 October 2026

Verified the six-file frontend update against the current shared basketball implementation:

- `npm test`: 421 passed, 0 failed. Coverage includes explicit server capability gating, invite/accept validation and stale reconciliation, reserved-mark origin/launch equivalence, waiting-player turn restriction, bystander free shooting, authoritative results and repositioning without clearing accepted flights. A regression test reproduced and fixed loss of an existing normal-seat ball in a late snapshot after HORSE starts.
- `npx tsc -p tsconfig.app.json --noEmit`: pass.
- `npm run lint`: pass.
- Standalone `npm run build`: pass.
- Exact six-source replacement in the imported Aippy host fixture, followed by its `npm run build`: pass. Host wrapper/importer/dependencies were not changed.
- Real Chromium at a 384×606 touch viewport with a mocked existing world socket: 17 checks passed, zero page errors. Covered prior shared admission/release/echo/rejection/result/leave/disconnect flows plus HORSE challenge, named invitee acceptance, authoritative letters/turn, reserved-mark touch release, waiting-player input restriction, normal-seat restoration and authoritative winner. No second court socket opened. Visual check confirmed the compact top-right status leaves the hoop and draggable ball visible.

The browser used software rendering at reduced resolution for deterministic input checks and restored the approved render scale for screenshots. These are not Android performance measurements or live server tests. No backend deployment, endpoint changes, physics/releaseOffset changes, court-version changes, artwork migration or predicted rewards were introduced. HORSE remains disabled until the server advertises basketball_horse_v1. Decline/cancel are documentation proposals only.
