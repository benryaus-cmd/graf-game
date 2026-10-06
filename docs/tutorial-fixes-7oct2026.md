# GraffCiti tutorial corrections — 7 October 2026

Reviewed the supplied 51-second Aippy recording and current GitHub tutorial implementation. Preserve the existing HOW TO PLAY cover button and TUTORIAL / REPLAY TUTORIAL settings entry. The guide appears only while running.

## Corrections
- Skip advances one task; a separate X exits the tutorial.
- Back displays the previous task in review mode so already-completed game state cannot instantly advance it again. Resume Guide restores automatic observation; Skip can continue browsing.
- Tutorial geometry is relative to the actual game shell, including its existing rotation and the visual viewport. The coach occupies a reserved top region; sheets and canvas controls move below it. It no longer defaults to covering the bottom joysticks.
- Short frames use a compact coach with an expandable HELP description. Heading/actions remain reachable while instructions scroll. During tutorial tools/paint tasks, the redundant fixed workspace footer is omitted so brushes retain a scrolling body.
- Tool selection is a separate task. CLOSE TOOLS & PAINT closes the sheet and uses the existing enter action when a started canvas is available. If tools are reopened while drawing, the guide explicitly explains how to close them and paint on the wall.
- Move Area minimizes the canvas control panel throughout the game, not just the tutorial. Done Moving remains visible and restores the controls. The tutorial waits for a repositioned box and Done Moving before advancing.
- Finish leads to the actual Done/Edit Again grace step. The guide observes the existing grace completion/clear event before continuing to radio; Edit Again returns to painting. The underlying finalization/timer code is unchanged.
- Starting/replaying the tutorial resumes an existing canvas at the relevant task. It no longer forces a multiplayer player to leave or clears their piece.
- Radio and multiplayer still use their existing controls. The guide exposes connection notices and allows skipping a stalled connection task. No purchases are performed by the tutorial.
- Existing selected spray-head ticks/highlighting remain intact.

## Validation
152 tests passed, including regression tests for tool-panel dismissal guidance, movement minimization, replay routing, Back observation suppression and grace completion/Edit Again. Standalone and patched Aippy host production builds passed, as did TypeScript and ESLint. Independent code review found no remaining Critical/Important findings.

Painting, movement, rendering, camera, session switching, flattening, paint sync/replay, protection and server code are unchanged relative to the inspected tutorial baseline. Only UI/tutorial state observes or calls their existing actions.

Actual phone/WebView geometry and input remain unverified: the local browser binary was unavailable and its download failed. The original recording was inspected; no claim of a device playtest of these fixes is made.

## Aippy import
Use `updates/tutorial-fixes-7oct2026.json`, version `tutorial-fixes-7oct2026`, containing 11 upstream runtime mappings. Download all raw bytes using Node 22, stage everything before replacing targets, and record the new version only after successful promotion. Use the manifest's pinned baseUrl. Do not reuse the old tutorial marker to skip this update or perform a full import. No host wrapper or server changes are required.
