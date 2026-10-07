# Building distance and concrete colour correction

Incremental patch after fixture-building-7oct2026. Runtime files: src/game/cityChunks.ts, src/game/fixtureBuilding.ts, src/game/fixtureBuildingGrain.ts.

The model cutoff was still 80m, but its owner chunk (0,-1) could unload early when the player crossed the normal 3x3 chunk neighborhood. Retain that chunk within 88m of the player (80m plus room for the existing 5.6m third-person camera), and apply the original 80m horizontal camera cutoff on render. Check retention changes even when the player's chunk coordinates have not changed. Ordinary city streaming stays unchanged.

The concrete grain now samples only within 20m, one quarter of the visibility cutoff. Outside that range the building remains visible with plain material. Low-saturation concrete regions take the same warm hue as the existing city material (#e6e0d3), preserving each atlas shade's luminance. Brown door/other saturated colours remain unchanged. No additional downloaded image, texture or draw pass.

Validation: 271 tests pass, app TypeScript/scoped lint pass, standalone and imported-host builds pass. Browser regression failed before the fix because the fixture unloaded at a chunk boundary, then passed after the fix: identical fixture survives positions (0,25), (0,48), (75,buildingZ); model visible at camera distance79m and hidden at81m. The original WebGL paint/capture/Solo session and chunk-restoration checks also pass. Visual model still adds one draw call and 2,884 triangles. This client fix changes no canvas IDs or paint/flatten/protocol logic.

## Multiplayer Undo/Redo investigation

No multiplayer runtime file was changed in this patch. The existing client tests pass for supplied stroke_history_state, disabled controls while painting/requesting, server Undo/Redo requests, authoritative stroke removal/restoration, and enabling the button immediately after finger release.

The supplied live-server contract explicitly documents stroke_history_state replies after Undo/Redo. It does not document an initial state after stroke_end. The client correctly waits for that authoritative state, so a server that only sends history after Undo/Redo will leave the initial Undo button disabled. This is a suspected handshake gap, not a verified live-server diagnosis: the live socket and health endpoint were unreachable from this workspace.

Send the server AI:

```text
Investigate why GraffCiti multiplayer Undo/Redo never becomes available. The client accepts the documented stroke_history_state and uses its canUndo/canRedo for the buttons. Its tests pass. Confirm hello advertises stroke_undo_redo and capture what history messages the painting player's socket receives for one own active, non-flattened piece.

If availability is only sent after an Undo/Redo request, fix that bootstrap gap using the EXISTING stroke_history_state message. Send fresh authoritative history to the drawing player's connection after accepted stroke_begin (redo cleared) and stroke_end, and after Undo/Redo. Initialize it when an active own piece is created/restored where appropriate. Use existing full-gesture grouping, the server's two-gesture limit, ownership checks and current data.

Payload remains:
{type:"stroke_history_state",pieceId,canUndo,canRedo,undoDepth,redoDepth,limit:2,serverTime}

Do not change stroke IDs/samples, painting, flattening, protocol version, economy or session handling. Do not add a local client Undo stack. Report the actual before/after websocket messages and verify paint → Undo enabled → Undo → Redo enabled → Redo, plus a new gesture clearing Redo.
```

## Aippy import

```text
Use Node22 to apply:
https://raw.githubusercontent.com/benryaus-cmd/graf-game/main/updates/fixture-distance-colour-7oct2026.json

Download all3 files using manifest.baseUrl + source. Stage all successfully, then replace only their exact target paths in the current game. Preserve unlisted files and the existing importer/host. No full re-import. Run the normal production build and report version, downloads/replacements X/3 and build PASS/FAIL.
```

