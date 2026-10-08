# Basketball and painting recovery — 9 October 2026

Map 2 has local solo basketball at the existing hoop, with five restrained floor marks derived from the canonical shooting positions. Approach in Explore, choose PLAY BASKETBALL, select one of five three-point marks, then flick upward on the pad. Length/speed controls power and sideways motion controls aim. Unlimited balls fade and expire three seconds after launch. Made shots animate the rim/net, show BUCKET/streak feedback and use the existing sound volume. Swishes get a distinct restrained cue using the same existing effect resources. Overlapping shots count every result while streaks follow attempt order. Leave restores the previous position/camera and controls, retains any paint draft and clears in-flight balls/effects. Map changes dispose the game.

The court definition is shared by render geometry, deterministic gravity/contact/scoring and session rules. Original Map 2 paint addresses, including its backboard, are preserved. The ball pool has 24 reusable visual slots; shared geometry/materials and a small points effect avoid added lights, shadows, bloom or dependencies. Cancelled pointers, focus loss and menus abandon the gesture.

## Painting regression

Solo world Undo/Redo is disabled. Its live 2048×2048 Canvas2D readback caused subsequent texture uploads to slow dramatically in a controlled production-path browser benchmark. The replacement history lifecycle performs no reads or allocations, cannot be re-enabled by permission changes, and preserves painted pixels. Multiplayer server history and the manual tag drawing library are unchanged. Fully reload after updating to recreate canvases affected by older readbacks. Device FPS remains to be measured.

## Shared play status

`basketballSession.ts` implements tested five-seat allocation, bounded authoritative shot handling and two-player HORSE. These are groundwork, not deployed multiplayer. Existing server source/isolated Map 2 room support was unavailable; no second backend or unsupported join UI was added. See [basketball-server-handoff.md](basketball-server-handoff.md) for the exact proposed service adapter and rollout checks.

## Incremental delivery

`updates/basketball-9oct2026.json` lists 15 source files, including the urgent painting fix. Use the existing Node 22 downloader to stage every pinned raw file before replacing its exact upstream target. Preserve settings, saves, all unlisted files, importer, aliases, host wrapper and dependencies. No full re-import or server change. Build, load and fully reload. The sibling rollback manifest returns existing targets to the pre-release public commit.

Validation: 368/368 full-suite tests passed; source TypeScript, full ESLint, standalone and imported-host production builds passed. Actual browser flicks made baskets from all five marks. Pointer cancel/lost capture/blur/menu cancellation, explicit rotated portrait input, paused wall-clock expiry, camera/player restoration, retained backboard draft and actual painting after Leave, and map disposal passed. Follow-up checks verified finite idle transforms, pre-release power/aim preview, blur reset, and immediate Leave clearing pending shots with no late score. Browser rendering measurements use software Chromium and do not establish phone FPS. Validation runtime was Node 24.19.0; delivery uses the established Node 22 incremental downloader.

An extra build-configuration TypeScript check (`tsconfig.node.json`) reports the pre-existing `unknown.path` typing in unchanged `vite.config.ts:54`. The source check and both production builds pass; importer/build configuration is preserved.

## Scope decisions

Separate agents worked on disjoint tasks, with commits serialized by the coordinator; the cost of a mistaken ownership boundary would be integration conflicts. The verified painting fix published first and disables solo world Undo/Redo; the cost is losing those solo controls until a safe history design is implemented. Solo basketball and tested session groundwork ship without shared seats/HORSE because the existing server source and isolated Map 2 contract were unavailable; the cost is that shared play still needs the documented server adapter and real-client verification.

Final independent review approved all fixes: five merged floor rings, camera-relative held ball clear of the portrait HUD, attempt-order streaks and distinct swish feedback. Focused presentation regressions pass 13/13.
