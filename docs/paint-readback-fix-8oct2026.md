# Painting readback fix — 8 October 2026

Solo Undo/Redo capture is disabled to restore paint responsiveness. The lifecycle API still reports unavailable controls, so no changes to painting or multiplayer are required. Multiplayer server Undo remains unchanged.

The old helper read the live paint Canvas2D before each gesture, including crops as large as 2048×2048. In a controlled Chromium experiment using actual paint stamps and Three texture uploads, history increased median paint/upload/render time from about 0.5 ms to about 24 ms, with gesture-start freezes up to 2.57 seconds. The internal browser backend mechanism was not directly traced; the enabled/disabled cost difference was reproduced.

After removal, production history made zero pixel readbacks or face allocations, final painted pixels were identical, and the controlled frame cost returned to about 0.5 ms. This is a software-GPU paint-pipeline measurement, not a phone FPS claim.

The isolated release passed 322 tests, application TypeScript, standalone and imported-host builds, and independent code review. Only `src/game/soloPaintHistory.ts` is replaced by the Aippy manifest. Reload after applying it to recreate canvases previously affected by history reads. Saves, paint marks, brush recipes, texture resolution, importer, dependencies and server are unchanged.
