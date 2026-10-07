import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pulsePieceBounds } from '../src/multiplayer/piecePulse';

const bounds = { min: [1, 2, 3], max: [5, 6, 7] } as { min: [number, number, number]; max: [number, number, number] };

function clock() {
  const oldRaf = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  const start = performance.now();
  let next = 0;
  const pending = new Map<number, FrameRequestCallback>();
  globalThis.requestAnimationFrame = callback => { pending.set(++next, callback); return next; };
  globalThis.cancelAnimationFrame = id => { pending.delete(id); };
  return {
    tick(elapsed: number) { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(start + elapsed)); },
    get pending() { return pending.size; },
    restore() { globalThis.requestAnimationFrame = oldRaf; globalThis.cancelAnimationFrame = oldCancel; },
  };
}

test('piece pulse stays visible through walls for at least three seconds and stops itself', () => {
  const time = clock(), scene = new THREE.Scene();
  const stop = pulsePieceBounds(scene, bounds);
  try {
    const helper = scene.children[0] as THREE.Box3Helper;
    assert.equal((helper.material as THREE.LineBasicMaterial).depthTest, false);
    assert.equal((helper.material as THREE.LineBasicMaterial).depthWrite, false);
    time.tick(3100);
    assert.equal(helper.parent, scene, 'default locator must last at least three seconds');
    time.tick(3500);
    assert.equal(scene.children.length, 0);
    assert.equal(time.pending, 0);
  } finally { stop(); time.restore(); }
});

test('piece pulse overlays mapped art with world transforms and exact bounds without changing shared materials', () => {
  const time = clock(), scene = new THREE.Scene();
  const map = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map, opacity: .8 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), material);
  const parent = new THREE.Group(); parent.position.set(2, 3, 4); parent.rotation.y = .7;
  mesh.position.set(1, 2, 3); parent.add(mesh); scene.add(parent);
  const renderer = { localClippingEnabled: false };
  const stop = pulsePieceBounds(scene, bounds, undefined, () => [mesh], renderer);
  try {
    time.tick(20);
    const overlay = scene.children.find(child => (child as THREE.Mesh).isMesh) as THREE.Mesh;
    assert.ok(overlay, 'actual artwork must be visible through walls, not only its bounds');
    assert.notEqual(overlay.geometry, mesh.geometry);
    const cloned = overlay.material as THREE.MeshBasicMaterial;
    assert.notEqual(cloned, material);
    assert.equal(cloned.map, map);
    assert.equal(cloned.depthTest, false);
    assert.equal(cloned.depthWrite, false);
    assert.ok(overlay.renderOrder >= 1e9);
    overlay.updateMatrixWorld(true);
    assert.deepEqual(overlay.matrixWorld.elements, mesh.matrixWorld.elements);
    assert.equal(cloned.clippingPlanes?.length, 6);
    assert.equal(cloned.clipIntersection, false);
    const center = new THREE.Vector3(3, 4, 5);
    assert.ok(cloned.clippingPlanes!.every(plane => plane.distanceToPoint(center) >= 0));
    for (const outside of [[0, 4, 5], [6, 4, 5], [3, 1, 5], [3, 7, 5], [3, 4, 2], [3, 4, 8]]) {
      assert.ok(cloned.clippingPlanes!.some(plane => plane.distanceToPoint(new THREE.Vector3(...outside)) < 0));
    }
    const opacity = cloned.opacity;
    time.tick(200);
    assert.notEqual(cloned.opacity, opacity, 'art itself should pulse');
    assert.equal(material.depthTest, true);
    assert.equal(material.depthWrite, true);
    assert.equal(material.transparent, false);
    assert.equal(material.opacity, .8);
    assert.equal(material.clippingPlanes, null);
    assert.equal(renderer.localClippingEnabled, true);
  } finally { stop(); time.restore(); }
});

test('piece pulse disposes only owned resources and restores clipping exactly once', () => {
  for (const initialClipping of [false, true]) {
    const time = clock(), scene = new THREE.Scene();
    const map = new THREE.Texture(), geometry = new THREE.PlaneGeometry();
    const material = new THREE.MeshBasicMaterial({ map });
    const mesh = new THREE.Mesh(geometry, [material, material]);
    const renderer = { localClippingEnabled: initialClipping };
    let originalDisposals = 0, cloneDisposals = 0;
    map.addEventListener('dispose', () => originalDisposals++);
    material.addEventListener('dispose', () => originalDisposals++);
    geometry.addEventListener('dispose', () => originalDisposals++);
    const stop = pulsePieceBounds(scene, bounds, undefined, () => [mesh], renderer);
    try {
      time.tick(20);
      const overlay = scene.children.find(child => (child as THREE.Mesh).isMesh) as THREE.Mesh;
      assert.ok(overlay);
      overlay.geometry.addEventListener('dispose', () => cloneDisposals++);
      const materials = overlay.material as THREE.Material[];
      materials.forEach(clone => clone.addEventListener('dispose', () => cloneDisposals++));
      stop(); stop();
      assert.equal(originalDisposals, 0);
      assert.equal(cloneDisposals, 1 + materials.length);
      assert.equal(renderer.localClippingEnabled, initialClipping);
      assert.equal(scene.children.length, 0);
      assert.equal(time.pending, 0);
      time.tick(5000);
      assert.equal(cloneDisposals, 1 + materials.length);
    } finally { stop(); time.restore(); }
  }
});

test('piece pulse waits for late artwork sources without extending its lifetime', () => {
  const time = clock(), scene = new THREE.Scene();
  let sources: THREE.Object3D[] = [], requests = 0;
  const stop = pulsePieceBounds(scene, bounds, undefined, () => { requests++; return sources; });
  try {
    time.tick(100);
    time.tick(500);
    assert.ok(requests >= 2);
    assert.equal(scene.children.filter(child => (child as THREE.Mesh).isMesh).length, 0);
    sources = [new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ map: new THREE.Texture() }))];
    time.tick(1000);
    assert.equal(scene.children.filter(child => (child as THREE.Mesh).isMesh).length, 1);
    const requestsWhenFound = requests;
    time.tick(1500);
    assert.equal(requests, requestsWhenFound);
    time.tick(3500);
    assert.equal(scene.children.length, 0);
  } finally { stop(); time.restore(); }
});
