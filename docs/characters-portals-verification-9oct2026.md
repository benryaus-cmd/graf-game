# Characters and courtyard portals — verification

Release: `characters-portals-9oct2026`. Twelve choices: Original, existing Hoodie, ten new Quaternius civilian variants.

- Full automated suite: 443 tests, zero failures. Added character protocol, UI, animation/resource ownership, portal entry/exit and paused-input/jump regressions.
- Application TypeScript (`tsc -p tsconfig.app.json --noEmit`), ESLint, upstream Vite build and current Aippy host fixture build pass. Verification ran on Node 24.19.0; installation prompt requires the project's existing Node 22 workflow.
- Real Chromium integration loads all eleven imported GLBs. Ten new models play mapped Idle/Walk/Jump clips; the existing Hoodie has Idle/Walk/Wave and falls back to Idle while jumping. Actual bone poses change, with independent skeletons for simultaneous players.
- Portal checks cover spawn not triggering, menu close while on a pad, leaving/re-entering, paused keyboard input, normal local jumping, court landing and existing multiplayer join flow.
- Browser mock server verifies selected model on existing outbound player state, remote same-model template reuse, independent bones, visible name label and peer removal preserving the local character.
- Existing shared court/HORSE browser regression covers 17 cases, including authority-only results, release offset, invitations/acceptance, turn repositioning and other players' free shooting.
- Ten GLBs pass header, length, hashes, skin, embedded-resource and 17-clip checks. All 23 published character asset/audit files were fetched from their immutable raw GitHub URLs and matched local bytes.

Models are downloaded on demand; parsed templates share GPU geometry/materials while each player owns bones, skeleton texture and mixer. Cache retains at most four idle templates. No new dependencies or decoder requirements.

These checks use software-rendered Chromium and a mocked town server; they are not Android FPS measurements or proof of live server rollout. Server relay/snapshot support for the optional model field is required; see the server handover. Official Google Drive downloads were quota-blocked, so verified credited mirror GLBs were packaged with per-file provenance and CC0 records in `public/assets/characters/`.

Imported characters retain authored clothing. The existing inventory/gear remains on Original; rig-specific spray-can attachments and dedicated painting clips are future polish. Existing endpoints, protocol 2/network revision 6, court version 1 and artwork/save separation remain unchanged.
