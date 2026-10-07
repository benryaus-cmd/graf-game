# Paint controls, history and emote camera — 7 October 2026

Incremental client patch for the existing game. No server deployment, protocol revision, brush interpolation change, session reset change or flattening change.

## Behavior

- ERAZE is a main brush choice. Selecting any paint head switches directly back to painting. The obsolete lower SPRAY control is removed.
- Erasing uses a round destination-out stamp at full strength, independent of paint opacity and previously selected brush head. Size still uses the existing size slider/world radius. Network samples carry full erase opacity; normal paint opacity is preserved.
- While erasing a valid wall hit, show a white unfilled circle at the actual world radius. It is a separate scene outline, never part of a saved paint image; hide on release/cancel/leave or switching away.
- SOLO Undo/Redo restores the last two completed paint gestures on the selected canvas. Capture the selected face/layer pixels before the first actual stamp, including the maximum FAT dwell overspray; swap the saved patch on Undo/Redo. New strokes invalidate Redo. Canvas/session/reset changes clear history. Combined stored history is capped at 16 MiB; captures exceeding that budget disable that history rather than leave misleading old undo actions.
- MULTIPLAYER Undo/Redo remains server-authoritative. Refresh the existing history buttons when a stroke begins/ends so history received while drawing becomes usable immediately after release. No local multiplayer history or new messages.
- Starting an emote from first person temporarily shows third person, then returns to first person 2,000 ms after the latest emote choice. Further choices restart that timer. Emotes started in third person keep third person; a manual camera change cancels a pending return. Existing emote animation/networking remains unchanged.

## Exact runtime files

1. `src/App.tsx`: connect Solo history and emote camera timer.
2. `src/components/PaintDock.tsx`: head selection exits erase; remove old SPRAY control.
3. `src/components/WorldScene.tsx`: history/outline lifecycle and existing action routing.
4. `src/game/worldPainting.ts`: full-strength round erasing; optional pre-stamp history callback. The head interpolation loop is untouched.
5. `src/game/worldTypes.ts`: optional callback type only.
6. `src/multiplayer/worldSession.ts`: history UI refresh at stroke boundaries only.
7. `src/game/eraserGuide.ts`: disposable white outline.
8. `src/game/soloPaintHistory.ts`: bounded Solo pixel history.
9. `src/game/emoteViewReturn.ts`: cancellable two-second camera timer.

Aippy manifest: `updates/paint-fixes-7oct2026.json`. Stage all nine runtime downloads before replacing only their exact imported-game targets. Preserve unlisted files and host/importer infrastructure. Rollback manifest restores the six modified existing files; three new helpers can remain unused.

## Verification

264 automated tests pass, including tool switching, eraser head/opacity independence, canvas/session history isolation, crop-aware FAT-tail restoration, multiplayer history release refresh and repeated emote timing. Application TypeScript, scoped ESLint, standalone production build and imported Aippy-host production build pass.

Chromium UI checks pass at 390×640, 390×480 and 844×390, including paint-head switching, bounded scrollable paint panels and the repeated-choice camera return. The UI test pauses the render loop to isolate timer/DOM behavior on software GPU; it is not a device frame-rate benchmark. Real Canvas 2D checks erase to alpha zero and restore every FAT-tail pixel on Undo/Redo.

Full tooling TypeScript retains two pre-existing errors in unchanged `vite.config.ts:54` (`Property 'path' does not exist on type 'unknown'`). The application typecheck and both production builds pass.

## Server AI

No server changes needed. A read-only QA connection to the live server confirmed the existing `stroke_undo_redo` capability alongside `piece_flatten`. Multiplayer Undo/Redo still follows its existing ownership, active-piece, server history and availability checks. No live artwork was created or edited for this capability check.

On-device Aippy/Android touch feel and frame rate still need the user's phone test.
