import test from 'node:test';
import { readFileSync } from 'node:fs';
import { FIXTURE_SCALE, FIXTURE_MODEL_OFFSET } from '../src/game/fixtureBuildingFaces';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addFixtureBuilding, FIXTURE_POSITION, FIXTURE_DEPTH } from '../src/game/fixtureBuilding';
import { createFixtureGrain, applyFixtureGrain } from '../src/game/fixtureBuildingGrain';
import { createCityChunk } from '../src/game/cityChunkContent';
import { assignSurfaceIds, pointToHit, encodeSurface, decodeSurface } from '../src/multiplayer/surfaces';
import { selectPaintWorkspaceFace, enterPaintWorkspace, exitPaintWorkspace } from '../src/game/paintWorkspace';
import { clearChunkPaint } from '../src/game/cityChunkPaint';
import { isPaintTargetReachable } from '../src/game/paintTargeting';

const materials = () => ({ wallMaterial: new THREE.MeshStandardMaterial(), groundMaterial: new THREE.MeshStandardMaterial(), railMaterial: new THREE.MeshStandardMaterial(), glassMaterial: new THREE.MeshStandardMaterial() });
const model = () => ({ scene: new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial())), animations: [] });

test('fixture belongs to one streamed chunk and preserves identical reconstructable slab IDs', () => {
  const a = createCityChunk(0, -1, materials()), b = createCityChunk(0, -1, materials()), unrelated = createCityChunk(0, 0, materials());
  const slabs = a.walls.filter(w => w.mesh.userData.fixtureSlab);
  assert.ok(slabs.length > 100); assert.equal(unrelated.walls.some(w => w.mesh.userData.fixtureSlab), false);
  assert.deepEqual(a.walls.map(w => w.surfaceId), b.walls.map(w => w.surfaceId));
  assert.equal(new Set(a.walls.map(w => w.surfaceId)).size, a.walls.length);
  for (const wall of slabs) { assert.equal(decodeSurface(encodeSurface(wall.surfaceId!, 0, 0))?.wallId, wall.surfaceId); const p = wall.mesh.localToWorld(new THREE.Vector3()); assert.ok(pointToHit(wall, 0, { x: p.x, y: p.y, z: p.z, pressure: 1 })); }
  assert.ok(Math.abs(FIXTURE_POSITION.z - (-12 - 2 * FIXTURE_DEPTH)) < 1e-8);
});

test('slab paint allocates only on use, keeps proportional density and clears with the normal chunk path', () => {
  const group = new THREE.Group(), fixture = addFixtureBuilding(group);
  assert.ok(fixture.walls.every(w => w.contexts[0] === null && (w.layers[0].mesh.material as THREE.Material).visible === false));
  const wall = fixture.walls.find(w => w.faceDimensions[0].height > 5 && w.faceDimensions[0].width > 2)!;
  const context = wall.layers[0].ensureFace(0)!;
  assert.ok(Math.abs(context.canvas.width / wall.faceDimensions[0].width - 64) < 1);
  assert.ok(Math.abs(context.canvas.height / wall.faceDimensions[0].height - 64) < 1);
  assert.equal((wall.layers[0].mesh.material as THREE.Material).visible, true);
  context.fillRect(0, 0, 2, 2); clearChunkPaint({ group, walls: fixture.walls, colliders: [], staircases: [], walkSurfaces: [] });
  assert.equal(context.getImageData(0, 0, 1, 1).data[3], 0);
  fixture.dispose();
});

test('workspace camera includes building context then restores every original layer', () => {
  const group = new THREE.Group(), fixture = addFixtureBuilding(group), scene = new THREE.Scene().add(group);
  const wall = fixture.walls.find(w => w.faceDimensions[0].height > 5)!;
  group.updateMatrixWorld(true); const context = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); fixture.root.add(context);
  const world: any = { scene, renderer: { domElement: { clientWidth: 390, clientHeight: 640 } } };
  selectPaintWorkspaceFace(world, wall, 0, { minU: .1, maxU: .9, minV: .1, maxV: .9 }); enterPaintWorkspace(world);
  assert.equal(context.layers.isEnabled(31), true); exitPaintWorkspace(world); assert.equal(context.layers.isEnabled(31), false); fixture.dispose();
});

test('close grain, far cutoff and collider allow reachable slab painting', () => {
  const fixture = addFixtureBuilding(new THREE.Group());
  fixture.updateDistance(0, FIXTURE_POSITION.z); assert.equal(fixture.root.visible, true); assert.equal(fixture.detail.value, 1);
  fixture.updateDistance(30, FIXTURE_POSITION.z); assert.equal(fixture.root.visible, true); assert.equal(fixture.detail.value, 0);
  fixture.updateDistance(81, FIXTURE_POSITION.z); assert.equal(fixture.root.visible, false);
  fixture.updateDistance(0, FIXTURE_POSITION.z);
  fixture.root.updateMatrixWorld(true);
  let reachable = 0;
  for (const wall of fixture.walls.filter(w => w.faceDimensions[0].width > .4 && w.faceDimensions[0].height > .4)) {
    const point = wall.mesh.localToWorld(new THREE.Vector3()); const n = new THREE.Vector3(0, 0, 1).applyQuaternion(wall.mesh.quaternion); const origin = point.clone().addScaledVector(n, 2);
    const direction = n.clone().negate();
    const first = new THREE.Raycaster(origin, direction).intersectObjects(fixture.walls.map(w => w.mesh), false)[0];
    if (first?.object !== wall.mesh) continue; // Interior/reverse faces are occluded by the nearer slab.
    assert.equal(isPaintTargetReachable(new THREE.Ray(origin, direction), point, 2, origin, [fixture.collider]), true, wall.mesh.name); reachable++;
  }
  assert.ok(reachable > 10); fixture.dispose();
});

test('disposing a streamed fixture rejects late visual attachment and releases loaded resources', async () => {
  let resolve!: (asset: ReturnType<typeof model>) => void; const fixture = addFixtureBuilding(new THREE.Group(), () => new Promise(r => { resolve = r; }));
  const pending = fixture.ensureVisual(); fixture.dispose(); const asset = model(); let disposed = 0;
  asset.scene.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.addEventListener('dispose', () => disposed++); });
  resolve(asset); await pending; assert.equal(fixture.root.getObjectByName('quaternius-building'), undefined); assert.equal(disposed, 1);
});

test('grain is one deterministic small repeat texture and modifies the existing material shader', () => {
  const grain = createFixtureGrain(), again = createFixtureGrain(); assert.equal(grain.image.data.byteLength, 128 * 128 * 4); assert.deepEqual(grain.image.data, again.image.data);
  assert.equal(grain.wrapS, THREE.RepeatWrapping); assert.equal(grain.wrapT, THREE.RepeatWrapping);
  const material = new THREE.MeshStandardMaterial(), enabled = { value: 1 }; applyFixtureGrain(material, grain, enabled);
  const shader: any = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer); assert.equal(shader.uniforms.fixtureGrain.value, grain); assert.equal(shader.uniforms.fixtureDetail, enabled);
  grain.dispose(); again.dispose(); material.dispose();
});

test('a visual arriving during canvas mode has its camera layers restored on exit', async () => {
  const fixture = addFixtureBuilding(new THREE.Group(), async () => model());
  const scene = new THREE.Scene().add(fixture.root); const world: any = { scene, renderer: { domElement: { clientWidth: 390, clientHeight: 640 } } };
  selectPaintWorkspaceFace(world, fixture.walls[0], 0, { minU: 0, maxU: 1, minV: 0, maxV: 1 }); enterPaintWorkspace(world);
  await fixture.ensureVisual(); const visual = fixture.root.getObjectByName('quaternius-building')!;
  assert.equal(visual.children[0].layers.isEnabled(31), true); exitPaintWorkspace(world);
  assert.equal(visual.children[0].layers.isEnabled(31), false); fixture.dispose();
});

// Compare proxies to the source mesh, including its slightly tilted door jambs.
test('tilted vertical canvases remain just outside their actual source triangles', () => {
  const bytes = readFileSync('public/assets/preview/building.glb');
  const length = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const accessor = gltf.accessors[0], view = gltf.bufferViews[accessor.bufferView];
  const offset = 28 + length + view.byteOffset;
  const fixture = addFixtureBuilding(new THREE.Group()); fixture.root.updateMatrixWorld(true);
  let checked = 0;
  for (let i = 0; i < accessor.count; i += 3) {
    const points = [0, 1, 2].map(j => new THREE.Vector3(...[0, 1, 2].map(k => bytes.readFloatLE(offset + (i + j) * 12 + k * 4))));
    const normal = new THREE.Triangle(...points).getNormal(new THREE.Vector3());
    if (Math.abs(normal.y) < .001 || Math.abs(normal.y) > .025) continue;
    const center = new THREE.Triangle(...points).getMidpoint(new THREE.Vector3()).multiplyScalar(FIXTURE_SCALE).add(new THREE.Vector3(...FIXTURE_MODEL_OFFSET));
    const match = fixture.walls.some(w => {
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(w.mesh.quaternion);
      const p = w.mesh.worldToLocal(center.clone()), d = w.faceDimensions[0];
      return n.dot(normal) > .9999995 && Math.abs(p.x) <= d.width / 2 + .002 && Math.abs(p.y) <= d.height / 2 + .002 && p.z < 0 && p.z > -.004;
    });
    assert.ok(match, `source triangle ${i / 3} needs an aligned outward canvas`); checked++;
  }
  assert.ok(checked > 0); fixture.dispose();
});
