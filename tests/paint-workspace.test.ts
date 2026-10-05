import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  centeredPaintWorkspaceBounds,
  enterPaintWorkspace,
  exitPaintWorkspace,
  isPaintWorkspaceHitAllowed,
  PAINT_WORKSPACE_LAYER,
  selectPaintWorkspaceFace,
  updatePaintWorkspaceCamera,
} from '../src/game/paintWorkspace';
import type { PaintWall, PaintWorkspaceSelection, WorldEngine } from '../src/game/worldTypes';

const wall = {
  uvScales: [{ u: 1, v: 1 }],
  faceDimensions: [{ width: 4, height: 3 }],
} as PaintWall;

test('paint workspace selection stays within a two metre rectangle on large faces', () => {
  const bounds = centeredPaintWorkspaceBounds(wall, 0, new THREE.Vector2(0.5, 0.5));
  assert.equal(bounds.minU, 0.25);
  assert.equal(bounds.maxU, 0.75);
  assert.ok(Math.abs(bounds.minV - 1 / 6) < 1e-12);
  assert.ok(Math.abs(bounds.maxV - 5 / 6) < 1e-12);
});

test('workspace selection shifts its rectangle inward at face edges', () => {
  const bounds = centeredPaintWorkspaceBounds(wall, 0, new THREE.Vector2(0, 1));
  assert.equal(bounds.minU, 0);
  assert.equal(bounds.maxU, 0.5);
  assert.ok(Math.abs(bounds.minV - 1 / 3) < 1e-12);
  assert.equal(bounds.maxV, 1);
});

test('paint hit validation clips both the selected face and normalized UV bounds', () => {
  const otherWall = {} as PaintWall;
  const selection = { wall, face: 0, bounds: { minU: 0.25, minV: 0.2, maxU: 0.75, maxV: 0.8 } } as PaintWorkspaceSelection;
  assert.equal(isPaintWorkspaceHitAllowed(selection, wall, 0, new THREE.Vector2(0.5, 0.5)), true);
  assert.equal(isPaintWorkspaceHitAllowed(selection, wall, 1, new THREE.Vector2(0.5, 0.5)), false);
  assert.equal(isPaintWorkspaceHitAllowed(selection, otherWall, 0, new THREE.Vector2(0.5, 0.5)), false);
  assert.equal(isPaintWorkspaceHitAllowed(selection, wall, 0, new THREE.Vector2(0.9, 0.5)), false);
});

test('workspace camera sees only the selected wall subtree and lights without changing visibility', () => {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.1), new THREE.MeshBasicMaterial());
  const unrelated = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const light = new THREE.AmbientLight();
  scene.add(mesh, unrelated, light);
  const paintWall = {
    ...wall,
    mesh,
    uvScales: Array(6).fill({ u: 1, v: 1 }),
    faceDimensions: Array(6).fill({ width: 4, height: 3 }),
    layers: [],
    contexts: [],
    textures: [],
    createLayer: () => { throw new Error('not used'); },
  } as PaintWall;
  const world = {
    scene,
    walls: [paintWall],
    renderer: { domElement: { clientWidth: 800, clientHeight: 600 } },
    onPaintWorkspaceChange: undefined,
  } as unknown as WorldEngine;
  const beforeUnrelatedVisibility = unrelated.visible;
  const workspace = selectPaintWorkspaceFace(world, paintWall, 4, { minU: 0, minV: 0, maxU: 1, maxV: 1 });
  enterPaintWorkspace(world);
  assert.equal(workspace.camera.layers.isEnabled(PAINT_WORKSPACE_LAYER), true);
  assert.equal(workspace.camera.layers.isEnabled(0), false);
  assert.equal(mesh.layers.isEnabled(0), true);
  assert.equal(mesh.layers.isEnabled(PAINT_WORKSPACE_LAYER), true);
  assert.equal(light.layers.isEnabled(PAINT_WORKSPACE_LAYER), true);
  assert.equal(unrelated.layers.isEnabled(PAINT_WORKSPACE_LAYER), false);
  assert.equal(unrelated.visible, beforeUnrelatedVisibility);
  const cameraBeforePan = workspace.camera.position.clone();
  (workspace as typeof workspace & { pan: THREE.Vector2 }).pan = new THREE.Vector2(0.5, 0.25);
  updatePaintWorkspaceCamera(workspace, 800, 600);
  assert.ok(workspace.camera.position.distanceTo(cameraBeforePan) > 0.1, 'right look input must be able to pan the live canvas');
  exitPaintWorkspace(world);
  assert.equal(mesh.layers.isEnabled(PAINT_WORKSPACE_LAYER), false);
  assert.equal(light.layers.isEnabled(PAINT_WORKSPACE_LAYER), false);
  assert.equal(unrelated.visible, beforeUnrelatedVisibility);
});
