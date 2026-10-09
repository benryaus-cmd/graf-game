import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { addPosterOverlay } from '../src/game/posterOverlay';
import { ArtworkSync } from '../src/multiplayer/artworkSync';
import { encodeSurface } from '../src/multiplayer/surfaces';
import type { PaintWall } from '../src/game/worldTypes';

test('persisted flattened artwork mounts on canonical wall with detached blank paint layer, including snapshot reconnect', () => {
  const scene = new THREE.Scene();
  const target = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshBasicMaterial());
  const blankLayer = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshBasicMaterial());
  const wallId = 'ss1:0:0:quarter-fixture';
  target.scale.set(3, 2, 0.5);
  target.rotation.z = Math.PI / 6;
  scene.add(target);
  const wall = { surfaceId: wallId, mesh: target, layers: [{ mesh: blankLayer }], faceDimensions: [{width:8,height:5}] } as unknown as PaintWall;
  assert.equal(blankLayer.parent, null);
  const id = '08c8ca40-12ce-4418-95b7-1dd05509193e';
  const record = {
    id, surfaceId: encodeSurface(wallId, 0, 0), face: '0',
    assetRef: 'https://example.com/persisted.webp',
    image: 'https://example.com/persisted.webp',
    position: [0, 0, 0], quaternion: [0, 0, 0, 1], width: 2, height: 2
  };
  const direct = addPosterOverlay(wall, record, {} as HTMLImageElement);
  assert.equal(direct.parent, wall.mesh);
  assert.equal(direct.parent?.parent, scene);
  assert.equal(blankLayer.parent, null);
  const assertWorldDimensions = (object: THREE.Object3D) => {
    object.updateWorldMatrix(true, false);
    const vertices = (object as THREE.Mesh).geometry as THREE.PlaneGeometry;
    const position = vertices.getAttribute('position');
    const corners = [0, 1, 2].map(i => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld));
    assert.ok(Math.abs(corners[0].distanceTo(corners[1]) - 2) < 1e-6, 'world width exactly 2m');
    assert.ok(Math.abs(corners[0].distanceTo(corners[2]) - 2) < 1e-6, 'world height exactly 2m');
  };
  assertWorldDimensions(direct);
  assert.ok(Math.abs(direct.position.z * target.scale.z - 0.006) < 1e-6, 'world outward offset is 6mm');
  assert.equal((direct.material as THREE.MeshBasicMaterial).depthTest, true);
  assert.equal((direct.material as THREE.MeshBasicMaterial).depthWrite, false);
  direct.removeFromParent();

  const oldDocument = globalThis.document;
  const indicators = new Map<string, any>();
  const fakeDocument = {
    getElementById: (key: string) => indicators.get(key) ?? null,
    createElement: () => ({ id: '', textContent: '', style: {}, remove() { indicators.delete(this.id); } }),
    body: { appendChild(element: any) { indicators.set(element.id, element); } },
  };
  class MockImage {
    crossOrigin = ''; decoding = ''; onload: (() => void) | null = null; onerror: (() => void) | null = null;
    src = '';
  }
  Object.assign(globalThis, {document: fakeDocument});
  try {
    const pending: MockImage[] = [];
    const sync = new ArtworkSync(() => true, () => {}, () => {
      const image = new MockImage(); pending.push(image); return image as unknown as HTMLImageElement;
    });
    const walls = new Map([[wallId, wall]]);
    for (let reconnect = 0; reconnect < 2; reconnect++) {
      sync.snapshot([record]);
      sync.refresh(walls);
      assert.equal(pending.length, reconnect + 1);
      pending[reconnect].onload?.();
      const mounted = sync.meshFor(id);
      assert.ok(mounted, 'existing persisted piece reconstructed from snapshot without strokes');
      assert.equal(mounted.parent, wall.mesh);
      assertWorldDimensions(mounted);
      assert.equal(mounted.parent?.parent, scene);
      assert.equal(blankLayer.parent, null, 'ensureFace was never called');
      sync.clear();
    }
  } finally {
    if (oldDocument === undefined) delete (globalThis as any).document;
    else Object.assign(globalThis, {document: oldDocument});
  }
});
