# Map 2 premium streets Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the approved Morning Quarter with varied imported architecture, complete vertical paint coverage and paintable benches.

**Architecture:** Keep the nine-chunk layout and outside backdrop. Share five additional Quaternius models per world, precompute their vertical paint slabs offline, and allocate paint textures only after use. Append surfaces after the existing V1 wall slots to preserve device paint addresses.

**Tech Stack:** Existing Three.js, React, Vite and Node; no new runtime dependency.

**Spec:** User's approved layout and current request: premium assets inside walls, grass off paths, all imported vertical faces and seats paintable; play before and after.

## Global Constraints
- Map 1 geometry, art and multiplayer addresses stay compatible.
- Map 2 retains its separate map2-v1 art namespace and device-only access.
- Keep the cotton-candy preset and four pooled shadow-free street lights plus player light.
- Preserve the two-metre overlap between 3D and flat replacements.

## Review Focus
- Existing Map 2 floor and facade paint must not move to other objects after new slabs are added.
- New imported faces must be reachable outside inset collision, including tilted trim.
- Failed or late downloads must retain a fallback without leaking shared resources.
- Individual bricks must allocate no full-size canvas before use.
- Morning and night routes must remain walkable with grass confined to beds.

### Task 1: Paint coverage
**Files:** tests/map2.test.ts, src/game/morningQuarterContent.ts, src/game/quarterPaintSurface.ts.
- [x] Add regression tests for all 766 favorite-building slabs, canonical ray hits, bench six-face paint and V1 wall prefix stability; run and observe failure.
- [x] Implement lazy shared paint targets; retain the original ten broad slots and append missing trim and benches after legacy walls.
- [x] Run npm test and verify regression tests pass.

### Task 2: Imported streets and landscaping
**Files:** public/assets/quarter/*.gltf, src/game/quarterBuildingAssets.ts, src/game/morningQuarterAssets.ts, src/game/morningQuarterContent.ts, src/game/morningQuarterLayout.ts, scripts/generate-quarter-buildings.mjs.
- [x] Convert five pinned CC0 OBJ sources offline to self-contained glTF and generate vertical paint tables.
- [x] Add shared model requests and full slab coverage; use existing building footprints and stable shell slots, hide their targets when imported visuals are ready.
- [x] Give gathering areas bordered paving and confined planters; add coherent doors, signs and street furniture within the same draw budget.
- [x] Play morning/night routes, spray a brick and a bench, inspect mobile and landscape screenshots and fix visible defects.

### Task 3: Verify and publish
**Files:** docs/map2-premium-8oct2026.md, updates/map2-premium-8oct2026.json, updates/map2-premium-8oct2026-aippy-prompt.txt.
- [x] Run tests, application typecheck, lint and standalone/Aippy host builds.
- [x] Review resource ownership, collision, paint indexing and model failure paths.
- [ ] Publish code/assets to GitHub, then a manifest pinned to that commit and a direct fetch/build/load prompt.
