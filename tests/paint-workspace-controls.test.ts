import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  movePaintWorkspaceToUv,
  selectPaintWorkspaceFace,
  setPaintWorkspaceLinked,
  setPaintWorkspaceMoving,
  setPaintWorkspaceSize,
} from '../src/game/paintWorkspace';
import { workspaceWorldBounds } from '../src/game/paintWorkspaceFeedback';
import type { PaintWall, WorldEngine } from '../src/game/worldTypes';

function setup() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.1));
  const wall = {
    mesh,
    uvScales: Array(6).fill({ u: 1, v: 1 }),
    faceDimensions: Array(6).fill({ width: 20, height: 20 }),
    layers: [], contexts: [], textures: [], createLayer: () => { throw new Error('unused'); },
  } as PaintWall;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const world = {
    scene,
    renderer: { domElement: { clientWidth: 800, clientHeight: 600 } },
    onPaintWorkspaceChange: undefined,
  } as unknown as WorldEngine;
  const state = selectPaintWorkspaceFace(world, wall, 4, { minU: .45, minV: .45, maxU: .55, maxV: .55 });
  return { world, wall, state };
}

test('linked width and height controls always resize as a square', () => {
  const { world, state } = setup();
  setPaintWorkspaceSize(world, 5, 2);
  assert.equal(state.selection?.width, 5);
  assert.equal(state.selection?.height, 5);
  setPaintWorkspaceLinked(world, false);
  setPaintWorkspaceSize(world, 6, 2.5);
  assert.equal(state.selection?.width, 6);
  assert.equal(state.selection?.height, 2.5);
  setPaintWorkspaceLinked(world, true);
  assert.equal(state.selection?.width, 6);
  assert.equal(state.selection?.height, 6);
});

test('move mode repositions the bounded rectangle on its selected wall face only before painting', () => {
  const { world, wall, state } = setup();
  state.selection!.started = true;
  const originalPreview = state.selection!.preview;
  setPaintWorkspaceMoving(world, true);
  movePaintWorkspaceToUv(world, new THREE.Vector2(.8, .75));
  assert.equal(state.selection?.wall, wall);
  assert.equal(state.selection?.face, 4);
  assert.equal(state.selection?.moving, true);
  assert.equal(state.selection?.started, true);
  assert.ok(state.selection!.bounds.minU > .7);
  assert.ok(state.selection!.bounds.minV > .65);
  assert.ok(Math.abs((state.selection?.width ?? 0) - 2) < 1e-8);
  assert.ok(Math.abs((state.selection?.height ?? 0) - 2) < 1e-8);
  assert.notEqual(state.selection?.preview, originalPreview);

  state.selection!.hasPaint = true;
  const boundsAfterPaint = { ...state.selection!.bounds };
  setPaintWorkspaceMoving(world, false);
  movePaintWorkspaceToUv(world, new THREE.Vector2(.2, .2));
  assert.equal(state.selection?.moving, false, 'painted geometry cannot remain in move mode');
  assert.deepEqual(state.selection?.bounds, boundsAfterPaint);
});

 test('purchased canvas geometry is fixed even before its first paint sample', () => {
  const { world, state } = setup();
  state.selection!.purchaseApproved = true;
  const original = state.selection;
  setPaintWorkspaceSize(world, 8, 8);
  setPaintWorkspaceMoving(world, true);
  assert.equal(state.selection, original);
  assert.notEqual(state.selection!.moving, true);
 });
 test('canvas quote bounds use exact metres without padded area', () => {
  const { world, state } = setup();
  setPaintWorkspaceSize(world, 8, 8);
  const bounds = workspaceWorldBounds(state.selection!);
  assert.ok(Math.abs(bounds.max[0] - bounds.min[0] - 8) < 0.00001);
  assert.ok(Math.abs(bounds.max[1] - bounds.min[1] - 8) < 0.00001);
 });

 test('selection edges render above painted overlays without writing scene depth', () => {
  const { state } = setup();
  const preview = state.selection!.preview;
  const material = preview.material as THREE.LineBasicMaterial;
  assert.equal(material.transparent, true);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  assert.ok(preview.renderOrder >= 10000);
  const edge = preview.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh;
  assert.ok(edge);
  assert.equal((edge.material as THREE.MeshBasicMaterial).depthTest, false);
 });
