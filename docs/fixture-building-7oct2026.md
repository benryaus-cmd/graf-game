# Permanent paintable building patch

Source commit: 29b172079e048bc96f5cdf3586045c7224cebf54

## Apply to the existing Aippy project

```text
Apply this incremental GraffCiti update:
https://raw.githubusercontent.com/benryaus-cmd/graf-game/main/updates/fixture-building-7oct2026.json

Use Node 22. Fetch the manifest, download manifest.baseUrl + source for every entry as raw bytes, and stage all 10 files first. Require all downloads to succeed before replacing only the exact target paths. Preserve every unlisted file.
Do not perform a full GitHub re-import or change the importer, Vite aliases, ImportedGame adapter, GameHostScreen, host sizing, or server code.

Verify the fixtureBuilding.ts, fixtureBuildingFaces.ts and fixtureBuildingGrain.ts persistent targets exist; cityChunkContent.ts calls addFixtureBuilding for chunk (0,-1); fixtureBuildingFaces.ts contains 766 face rows. Then run the normal production build.
If the build fails, report the first exact error without modifying import infrastructure.
Report version, downloads X/10, replacements X/10, marker verification and build PASS/FAIL.
```

The old optional building toggle is removed; the character options remain. The building is now a shared city fixture at X=0, Z=-27.451, shifted 15.451m away from its door. Vertical wall, base brick, trim and door faces use separate existing canvases. Canvases do not wrap automatically over multiple slabs. Full plane tilt is retained on door jambs.

Concrete grain appears within 26.667m of the player; the visual cutoff remains 80m. Gray concrete receives grain; wood and other coloured atlas regions remain unchanged.

## Validation and cost

271 tests pass, application TypeScript and scoped lint pass, standalone and imported-host production builds pass. Chromium/WebGL 390x640 verifies actual shader/model rendering, wall/base/raised-slab painting and capture, canvas context, Solo/Multiplayer clearing, and Solo restoration after streaming out/in. A source-geometry regression checks tilted faces remain outside the actual model.

Measured fixture increment: one draw call, 2,884 triangles. Model download is 278,532 bytes with a 32x32 palette atlas. Grain is one 128x128 RGBA texture: 64KiB base, about 85KiB with mipmaps. The 766 empty targets add no draw calls and no large paint textures; paint layers allocate on use. Extra raycast objects and painted layers still have a cost. The existing city's concrete photo is shared, and its resolution/bytes were not retrievable, so total photo-vs-model cost or physical-phone FPS has not been established.

## Server and compatibility

No server deployment is needed. No protocol, economy, pricing, ownership, stroke format, flattening, painting/interpolation, movement or session implementation changes. Existing wall IDs are preserved because new fixture faces are appended. All players need this client update to see the new fixture surfaces. Live multiplayer was not exercised during automated browser checks.

## Rollback

https://raw.githubusercontent.com/benryaus-cmd/graf-game/main/updates/fixture-building-rollback-7oct2026.json

Stage all seven rollback files before replacing exact targets. This restores the former optional preview; the three new helpers may remain unused. Saved fixture paint remains stored but invisible until the fixture update is restored.

