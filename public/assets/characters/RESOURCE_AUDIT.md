# Character resource audit

Selected 10 civilian character variants from Quaternius Ultimate Animated Character Pack. The original procedural avatar and existing hoodie are separate catalog entries.

## Acquisition

Official creator page and November 2019 announcement identify this pack as CC0. Official Drive file listing provided exact glTF filenames and IDs; attempted glTF, FBX and license text downloads returned Google Drive quota-exceeded HTML. Valid GLB re-exports were acquired from the public Gameatude catalog, which attributes these models to the Quaternius contributor. Per-file mirror URLs, official IDs and SHA-256 hashes are retained in manifest.json. No quota-error HTML is packaged.

## Verification

- Python GLB header, declared length, JSON, skin, animation and SHA-256 verification passed for all 10.
- Installed Three.js GLTFLoader.parseAsync loaded all 10 with 6–7 skinned meshes each.
- AnimationMixer evaluated every one of the 17 clips per model; all resulting geometry bounds were finite.
- All models contain their own binary buffer and authored material factors, with no external buffer or image resources.
- No decoder extensions or added runtime dependencies are required.
- Actual mirror thumbnails are valid WebP images, inspected visually.
- Geometry, colors, skin weights, skeletons and all 17 animation clips are preserved unchanged.

## Budget

| Model | Bytes | Triangles | Joints | Clips |
|---|---:|---:|---:|---:|
| casual-female | 663,332 | 3,514 | 23 | 17 |
| casual-male | 709,196 | 5,121 | 23 | 17 |
| casual2-female | 873,044 | 6,752 | 32 | 17 |
| casual2-male | 689,324 | 3,216 | 32 | 17 |
| casual3-female | 956,492 | 8,444 | 32 | 17 |
| casual3-male | 772,928 | 4,920 | 32 | 17 |
| suit-female | 755,688 | 6,810 | 23 | 17 |
| suit-male | 747,220 | 6,518 | 23 | 17 |
| worker-female | 740,880 | 5,856 | 23 | 17 |
| worker-male | 644,276 | 2,524 | 23 | 17 |

Total GLB payload: 7,552,380 bytes. Each avatar is loaded on demand; the application should cache model promises and clone skeletons for remote avatars.

## Animation mapping

Idle, Walk, Run and Jump exist on every model. Casual 2 and Casual 3 exports prepend `CharacterArmature|`; catalog mappings use exact clip names. The wave/emote slot uses the verified Victory celebration because no Wave clip exists. The runtime should normalize each source height to the game avatar height and align the feet. Full clip arrays are in manifest.json.

## Reproduction

Run `python scripts/import-quaternius-characters.py --verify-only` to audit packaged models. Omit `--verify-only` to fetch the pinned mirror URLs and verify source hashes before replacing each asset. No Google Drive requests run in game.
