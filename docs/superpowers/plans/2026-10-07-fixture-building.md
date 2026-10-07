# Paintable fixture building implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Permanently place the existing Quaternius building farther behind its door, add close concrete grain, and reuse the existing canvas system on vertical walls/brick slabs.

**Architecture:** Append deterministic slab surfaces to chunk (0,-1), preserving every existing wall and ID. Paint surfaces and collision exist synchronously; the pinned GLB remains an asynchronous visual. Use existing paint layers, Solo persistence, multiplayer indexing, piece capture and artwork placement.

**Tech Stack:** Existing TypeScript, Three.js, GLTFLoader, Canvas 2D; no new dependency or server.

**Spec:** User request in this session: concrete grain on wall/base bricks; detail starts at one third of 80 m cutoff; every vertical slab can hold canvases; move twice model depth away from door; permanent fixture; report measured rendering comparison.

## Global Constraints

- Keep brush interpolation, paint size/texel density, local-first input, immediate flatten, DONE/timer, protocol, economy and existing IDs unchanged.
- Existing fit: width 4 m; source bounds x [-.5472319722,.5683469772], y [-.0151930004,2.7420880795], z [-1.0773019791,1.0773019791]. Door faces +Z. New center Z is -12 minus twice fitted depth (about -27.45 m).
- Grain: one deterministic 128x128 repeating grayscale DataTexture, only grayscale concrete vertical material regions, active within 80/3 m; visual cutoff 80 m.
- Slab geometry is generated offline from connected coplanar vertical triangles; append fixed planes with normalized UVs and proportional 64 px/world-unit, max 2048, min 32. Individual planes stay separate canvas faces; no wrap-around rewrite.
- Preserve all old chunk paint indexes by appending slabs after existing surfaces. Empty slabs must submit no draw calls or large paint canvases. Base model stays a single mesh/material.

## Review Focus

- Async load completes after chunk unload: abort and dispose, never attach to dead chunk.
- Re-enter chunk/session: existing persistence and MP indexing see identical slab IDs and clear/restore paint normally.
- Canvas camera: include fixture visuals and raised pieces, so selected face is visible in context.
- Gray base-brick grain must preserve brown door and atlas colours; far state must skip detail sampling.
- Added collision must not block painting recessed door/front faces or cover neighboring map surfaces.

### Task 1: Stable slab surfaces and chunk ownership

**Files:** create `src/game/fixtureBuildingFaces.ts`, `src/game/fixtureBuilding.ts`; modify `src/game/cityChunkContent.ts`, `src/game/cityChunks.ts`, `src/game/cityChunkResources.ts`, `src/game/disposeWorld.ts`, `src/game/paintWorkspace.ts`; test `tests/fixture-building.test.ts`.
**Interfaces:** `addFixtureBuilding(group: THREE.Group): { walls: PaintWall[]; collider: Collider }`; fixture group userdata owns distance update/disposal; slab mesh userdata `paintWorkspaceContext` names its fixture group.
- [x] Write/run failing tests for fixture presence only in its owning chunk, stable IDs, proportional lazy faces, context camera, and disposal.
- [x] Generate fixed vertical connected slab rectangles from pinned mesh; include walls, base, door, vertical trim.
- [x] Create slab planes with invisible target material and lazy visible paint material; append before ID assignment and after legacy walls.
- [x] Hook existing chunk update/disposal and workspace context, without changing session/persistence/flatten code.
- [x] Run full suite and application typecheck.

### Task 2: Grain and visual lifecycle

**Files:** create `src/game/fixtureBuildingGrain.ts`; modify fixture helper, `src/game/assetPreview.ts`, `src/components/AvatarMenu.tsx`; test fixture and preview tests.
**Interfaces:** `createFixtureGrain(): THREE.DataTexture`, `applyFixtureGrain(material, grain, enabledUniform)`; exported existing `loadModel`/`release` used for pinned building.
- [x] Write/run failing tests for near/far detail, texture/shader mask, late download cleanup, and no optional duplicate preview.
- [x] Load model only when rendered, apply fit/placement and shared detail sampler; retry transient failed visual load while fallback remains usable.
- [x] Remove optional building preview controls/creation; preserve character option and its device preference.
- [x] Run full suite, scoped ESLint, app typecheck and standalone/imported host builds.

### Task 3: Browser verification and publication

- [x] Render real model, confirm grain compiles, paint on wall/base/raised faces, canvas/finish capture and texture reload, and collision/reach.
- [x] Measure triangles/draw calls and texture bytes with old city alone vs new fixture near/far/painted, without claiming mobile FPS from software GPU.
- [x] Fresh whole-branch code review, fix material defects and rerun checks.
- [x] Publish only changed files and pinned incremental/rollback manifests. Supply exact Aippy import prompt and server work, if any.

## Verification results

- 271 tests pass; application TypeScript, scoped ESLint, whitespace check, standalone production build and imported Aippy host fixture build pass.
- Regression compares tilted canvas normals/positions against every qualifying source triangle: proxies remain just outside the visual mesh, including door jambs.
- Chromium/WebGL at 390x640 rendered the actual pinned GLB and grain shader. Building increment: one draw call, 2,884 triangles; 766 empty slab targets add zero draw calls. Original model download 278,532 bytes; colour atlas 32x32; generated grain 128x128 RGBA (64KiB base, approximately 85KiB including mipmaps).
- Real wall/base/raised-face paint pixels and existing capture verified; camera context is retained; Solo paint clears for Multiplayer and restores after chunk unload/re-entry.
- Tests do not establish physical-phone FPS or exercise the live multiplayer server. Players need the same updated client to see the new fixture and its surface IDs. Existing concrete photo texture is shared; its resolution/bytes could not be retrieved, so no unsupported total-cost comparison is made.
- A review found tilted door-jamb proxy clipping; full quaternion/up-axis extraction fixed it and passed the source-geometry regression. Chunk distance updates use one optional callback per active chunk, without traversing every slab each frame.
