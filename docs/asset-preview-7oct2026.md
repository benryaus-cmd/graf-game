# Reversible mobile asset preview — 7 October 2026

A small client-only experiment for the existing GraffCiti/Aippy game. No city replacement, player movement change, surface migration, paint rewrite, WebSocket change or server deployment.

## Try it

The building is approximately 12 metres straight ahead of spawn. Settings → PROFILE & CLOSET → HOODIE CHARACTER selects the additional model. Settings → FIRST PERSON cycles to third person so you can see yourself. EXISTING CHARACTER restores the equipped original look. BUILDING PREVIEW turns the building on/off. Choices are stored only on this device (`graffciti.asset-preview.v1`).

The character model is a local visual test, not a newly networked cosmetic. Other players continue to see the existing multiplayer appearance. The original outfit, gear, abilities and progress remain intact; selecting an owned existing outfit returns to the original model. The preview has fixed clothes. It uses Idle/Walk, Wave for joy, and existing root movement for jumping/spin/sleepy. Full facial/arm emote retargeting is outside this first asset test.

The building is a visual sample, not yet a paintable/collidable replacement. Existing walls, surface IDs, collision, paint storage and multiplayer art are unchanged. Do not use this preview as a permanent street layout without a separate paint-proxy/collision plan.

## Real source files and license

Both source packs are Quaternius CC0. Copies of the pack license notices are in `public/assets/preview/`.

| Preview | Exact original | Source | Converted bytes | Triangles |
| --- | --- | --- | ---: | ---: |
| Building | `Textured Models/Finished Textured Buildings/OBJ/2Story_Slim.obj` + `Textures/Texture_Grey.png` | [Official pack](https://quaternius.com/packs/ultimatetexturedbuildings.html), [public download](https://drive.google.com/drive/folders/1RE3qXhbE5yGS3t-xGFJ8GmOtTgCUF3LQ) | 278,532 | 2,884 |
| Male | `Ultimate Modular Men- Feb 2022/Individual Characters/glTF/Casual_Hoodie.gltf` | [FreeModels](https://github.com/agentkaerf/FreeModels/blob/db3df04d1e4714298a09510b26fb6de6645138a2/Ultimate%20Modular%20Men-%20Feb%202022/Individual%20Characters/glTF/Casual_Hoodie.gltf), [original pack](https://quaternius.com/packs/ultimatemodularcharacters.html) | 873,232 | 6,206 |

The requested qrowdx/LowPolyCharacterKit repository packages the original Quaternius characters as Unreal `.uasset`, which Three.js cannot load. The source hoodie downloaded from Quaternius matches the FreeModels copy exactly (Git blob `70878aec4464137c6c92ec99a74ef79578d29480`). We use the original web-compatible rig, not its UE5 skeleton conversion.

Conversion used Three.js OBJLoader / GLTFLoader / GLTFExporter offline. Building: one rough MeshStandardMaterial with the embedded 32×32 grey palette atlas. Character: retain only Idle, Walk and Wave; remove finger animation tracks and optimize clips; retain the original four modular mesh sections and 62-bone skin. No runtime OBJ/FBX parsing, decoder CDN, base64 model in HTML or additional npm dependency.

Models load from immutable GitHub raw URLs pinned to commit `77b8bb73af715da9dbd691dbddae109316e394fd`. Aippy's single-file hosting does not have to discover or preload `.glb` files. The building downloads asynchronously; the character only downloads when selected. Existing visuals stay available while loading or on failure. Returning to the original retains at most one cached model per world for fast reselect. Building rendering hides beyond 80 metres. Closing the world aborts requests and frees model resources; late results are discarded and disposed.

## Exact runtime patch

- `src/components/AvatarMenu.tsx`: optional model/building controls in the existing bounded closet.
- `src/components/WorldScene.tsx`: setup, preference changes and cleanup for the preview.
- `src/game/playerAvatarAppearance.ts`: one optional animation update call.
- `src/game/assetPreview.ts`: GLB load, placement, animation, lifecycle.
- `src/game/assetPreviewPreference.ts`: device-only preferences.

The Aippy manifest maps only these five runtime files into `src/games/importedGame/upstream/src/`. Preserve all unlisted host and game files. The GLBs and notices are published assets in GitHub, loaded through their pinned URLs rather than copied into Aippy source.

## Rollback

Use `updates/asset-preview-rollback-7oct2026.json`. It restores only AvatarMenu, WorldScene and playerAvatarAppearance to the prior published client commit. New helper/assets can remain unused. This leaves Batch 7, painting, references, social features and server changes intact. The closet toggles are a quicker way to disable the preview without importing rollback.

## Validation and limits

254 tests pass, including stale selection, failed-download retry, off switches, disposal during download and decoded-image cleanup. Application TypeScript, scoped ESLint, standalone production build and imported Aippy-host production build pass. Browser checks load/render both GLBs, preserve the 837 existing paint walls/collider list, restore original appearance, and check closet scroll bounds at 390×640, 390×480 and 844×390. These are desktop Chromium checks, not a promise of Android WebView frame rate: test the patch on your actual Aippy phone.

Full build-mode TypeScript also checks the existing Vite tooling and encounters two pre-existing `vite.config.ts:54` errors (`Property 'path' does not exist on type 'unknown'`). That file was not changed; the application typecheck and production builds pass.

## Server AI

No server work is required for this preview. Networked model cosmetics and permanent new building paint/collision surfaces should be separate follow-up work after the real phone test.
