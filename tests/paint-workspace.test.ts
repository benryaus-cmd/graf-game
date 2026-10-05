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
  setPaintWorkspaceSize,
  setPaintWorkspaceZoom,
  setPaintWorkspaceLinked,
} from '../src/game/paintWorkspace';
import type { PaintWall, PaintWorkspaceSelection, WorldEngine } from '../src/game/worldTypes';

const wall = {
  uvScales: [{ u: 1, v: 1 }],
  faceDimensions: [{ width: 4, height: 3 }],
} as PaintWall;

test('painting area can grow to eight metres before drawing and then locks its bounds', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.1));
  const paintWall = { ...wall, mesh, uvScales: Array(6).fill({ u: 1, v: 1 }), faceDimensions: Array(6).fill({ width: 20, height: 20 }) } as PaintWall;
  const world = { scene: new THREE.Scene(), renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } } as unknown as WorldEngine;
  world.scene.add(mesh);
  const state = selectPaintWorkspaceFace(world, paintWall, 4, { minU: .45, minV: .45, maxU: .55, maxV: .55 });
  setPaintWorkspaceSize(world, 8);
  assert.ok(Math.abs(state.selection!.width - 8) < 1e-8);
  (state.selection as PaintWorkspaceSelection & { hasPaint: boolean }).hasPaint = true;
  setPaintWorkspaceSize(world, 1);
  assert.ok(Math.abs(state.selection!.width - 8) < 1e-8, 'painting bounds must remain stable once a piece has started');
});

test('workspace zoom changes orthographic span and clamps from .5x through 8x', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.1));
  const paintWall = { ...wall, mesh, uvScales: Array(6).fill({ u: 1, v: 1 }), faceDimensions: Array(6).fill({ width: 20, height: 20 }) } as PaintWall;
  const world = { scene: new THREE.Scene(), renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } } as unknown as WorldEngine;
  world.scene.add(mesh);
  const state = selectPaintWorkspaceFace(world, paintWall, 4, { minU: .45, minV: .45, maxU: .55, maxV: .55 });
  enterPaintWorkspace(world);
  const before = state.camera.projectionMatrix.elements[0];
  setPaintWorkspaceZoom(world, 2);
  assert.equal(state.camera.zoom, 2);
  assert.ok(Math.abs(state.camera.projectionMatrix.elements[0] - before * 2) < 1e-8);
  setPaintWorkspaceZoom(world, 99);
  assert.equal(state.camera.zoom, 8);
  setPaintWorkspaceZoom(world, .1);
  assert.equal(state.camera.zoom, .5);
});

test('box dimensions link as a square by default, unlock for independent width and height, and lock after paint', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.1));
  const paintWall = { ...wall, mesh, uvScales: Array(6).fill({ u: 1, v: 1 }), faceDimensions: Array(6).fill({ width: 20, height: 20 }) } as PaintWall;
  const world = { scene: new THREE.Scene(), renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } } as unknown as WorldEngine;
  world.scene.add(mesh);
  const state = selectPaintWorkspaceFace(world, paintWall, 4, { minU: .45, minV: .45, maxU: .55, maxV: .55 });
  assert.equal(state.selection!.sizeLinked, true);
  setPaintWorkspaceSize(world, 6);
  assert.equal(state.selection!.width, 6);
  assert.equal(state.selection!.height, 6);
  setPaintWorkspaceLinked(world, false);
  setPaintWorkspaceSize(world, 7, 3);
  assert.ok(Math.abs(state.selection!.width - 7) < 1e-8);
  assert.ok(Math.abs(state.selection!.height - 3) < 1e-8);
  setPaintWorkspaceSize(world, 99, 0.1);
  assert.ok(Math.abs(state.selection!.width - 8) < 1e-8);
  assert.ok(Math.abs(state.selection!.height - .5) < 1e-8);
  state.selection!.hasPaint = true;
  setPaintWorkspaceSize(world, 2, 2);
  assert.ok(Math.abs(state.selection!.width - 8) < 1e-8);
  assert.ok(Math.abs(state.selection!.height - .5) < 1e-8);
});

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
  assert.equal(isPaintWorkspaceHitAllowed(selection, wall, 0, new THREE.Vector2(.25, .2)), true);
  assert.equal(isPaintWorkspaceHitAllowed(selection, wall, 0, new THREE.Vector2(.24, .5), .08), true);
  assert.equal(isPaintWorkspaceHitAllowed(selection, wall, 0, new THREE.Vector2(.20, .5), .08), false);
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
