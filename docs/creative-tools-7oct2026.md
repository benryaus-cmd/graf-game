# GraffCiti references and player controls — 7 October 2026

Incremental update to the existing game and tutorial. Painting/networking architecture is retained.

## Player changes

- Canvas controls start collapsed in the upper-right gap beside the quick paint controls. A single mounted HUD retains collapse state through brush/menu changes and tutorial steps. Done Moving leaves it collapsed. DONE / EDIT AGAIN remain visible during the existing grace period.
- Open Canvas → Reference Image to choose a PNG/JPG/WebP. The local-only guide fits proportionally to the selected surface. Adjust opacity, size and rotation; drag it inside or beside the selected rectangle; hide/show/remove it. It follows the selected surface and remains separate from paint contexts, posters, piece capture and multiplayer uploads. Files are prepared once at a maximum 1600-pixel dimension; source/preview URLs and GPU resources are released on replacement/removal/unmount. Guides are session-local, not a gallery/save system.
- Emote opposite Jump opens all five existing animations. Choosing one closes the sheet, switches to the existing third-person view and uses the existing local/network action.
- Jump triggers on pointer down, with a keyboard click fallback. Joystick pointer capture remains independent, supporting walking and jumping with separate fingers.
- PICK COLOUR opens a saturation/brightness surface and hue slider with a preview. Existing swatches, hex input, recent colours and palette saving remain. EYEDROPPER separately samples paint in the world. Black/white/custom colours need no hex knowledge.
- Chat bubbles follow local and remote avatars from accepted live chat messages. They render plain text, last 8–16 seconds depending on length, and replace the speaker's previous bubble. Excess whitespace is compacted in the bubble to bound mobile texture size; chat history keeps its original format. History snapshots/duplicate delivery do not replay bubbles; leave/disconnect/player removal clean them up. Own bubble is visible to other clients and to yourself in third person; your own avatar remains hidden in first person as before.
- Native scrolling is allowed by panel ancestors. The game's manually rotated orientation uses scoped touch scrolling with local coordinate conversion, including nested chat logs and horizontal category tabs; drawing canvases, colour mixing and sliders keep their own gestures. World/joystick/reference drag surfaces retain their own gesture handling. Sheet bodies flex into remaining height; paint no longer reserves a large redundant fixed canvas footer.
- Tutorial canvas tasks explain opening CANVAS and highlight its collapsed toggle until their target controls are opened. Skip/Back, main-screen/Settings entries, save observation and completion persistence are preserved.

## Files and infrastructure

Runtime changes are App, GameHud, PaintDock, PaintWorkspaceHud, TutorialOverlay, WorldScene, index.css, chat, remotePlayers, worldSession; new ColorPicker, EmoteSheet, ReferenceSheet, colorPicker, referenceGuide, referenceImage, speechBubble and useRotatedSheetScroll. GameSheet shares the rotated scrolling handler. WorldScene changes only add/remove/update the local guide presentation and route its drag input. WorldSession changes only attach/clear speech presentation. No protocol fields, actions, prices, ownership, timers, camera math or session-switching behavior were replaced.

`worldPainting`, `sprayHeads`, `paintSurfaceLayer`, `architectureWalls`, `paintSync`, `paintReplay`, `pieceFlatten`, `artworkSync`, `connection` and `pieceSync` are unchanged. Existing image save/reload flow is preserved. See `server-save-lag-handoff.md` for the separate profiling handover.

## Aippy import

Use `updates/creative-tools-7oct2026.json`. It maps 19 runtime files into `src/games/importedGame/upstream/`. Stage all downloads from the manifest's pinned base URL before replacing targets, preserve every unlisted file, and run the normal production build. No host adapter, importer, wrapper or server file is part of this update.

## Validation

The release passed all 163 automated tests, application TypeScript checking, ESLint, the standalone production build and an isolated Aippy host production build. Browser checks covered 390×640 and 390×480 portrait frames, 844×390 landscape, simultaneous joystick movement/jump, reference selection/movement/visibility, collapse retention after changing brushes, custom colour selection, and manually rotated sheet/tab/chat scrolling. Rotated drawing gestures retain their drawing surface. Review found no remaining critical or important issues.

These checks used Chromium; a physical Android/Aippy WebView check remains necessary. The reported multiplayer save hitch is not claimed fixed: server profiling is a separate task described in the handover.
