import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ReferenceGuide } from '../src/game/referenceGuide';
import { OwnerReferences, type OwnerReferenceDraft } from '../src/multiplayer/ownerReferences';

const draft: OwnerReferenceDraft = { url: 'data:image/png;base64,eA==', name: 'Seed', surfaceId: 'ss1:0:0:wall/f4/l0', position: [1, 2, 3], quaternion: [0, 0, 0, 1], width: 4, height: 2, opacity: .35, aboveArt: true };
const record = { ...draft, url: undefined, id: 'one', referenceId: 'one', assetRef: 'https://server.test/artwork/a.png', createdAt: 1, updatedAt: 2 };

test('owner reference requests use uploaded assets and exact server envelopes without optimistic records', async () => {
  const scene = new THREE.Scene(), sent: any[] = [], uploaded: string[] = [];
  const refs = new OwnerReferences(scene, message => { sent.push(message); return true; }, () => {}, { assetRef: async source => { uploaded.push(source); return record.assetRef; } });
  assert.equal(refs.list(), false); assert.equal(await refs.save(draft), false); assert.equal(refs.remove('one'), false);
  refs.setAccess(true); assert.equal(refs.list(), true);
  assert.equal(await refs.save(draft), true); assert.deepEqual(uploaded, [draft.url]);
  const { url, ...placement } = draft;
  assert.deepEqual(sent, [{ type: 'owner_reference_list' }, { type: 'owner_reference_save', assetRef: record.assetRef, ...placement }]);
  assert.equal(refs.records.length, 0);
  assert.equal(refs.remove('one'), true); assert.deepEqual(sent.at(-1), { type: 'owner_reference_delete', referenceId: 'one' });
  assert.equal(await refs.save({ ...draft, referenceId: 'one' }), true);
  assert.equal(sent.at(-1).referenceId, 'one'); refs.dispose();
});

test('an upload finishing after access loss and re-entry never sends in the new session', async () => {
  let release!: (asset: string) => void;
  const sent: any[] = [];
  const refs = new OwnerReferences(new THREE.Scene(), message => { sent.push(message); return true; }, () => {}, { assetRef: () => new Promise(resolve => { release = resolve; }) });
  refs.setAccess(true); const pending = refs.save(draft);
  refs.setAccess(false); refs.setAccess(true); release(record.assetRef);
  assert.equal(await pending, false); assert.deepEqual(sent, []); refs.dispose();
});

test('external image sources go through upload bytes, and failed uploads do not send a save', async () => {
  const oldFetch = globalThis.fetch, uploaded: string[] = [], sent: any[] = [];
  globalThis.fetch = async () => new Response(new Blob(['image'], { type: 'image/png' }));
  try {
    const refs = new OwnerReferences(new THREE.Scene(), message => { sent.push(message); return true; }, () => {}, { assetRef: async source => { uploaded.push(source); return record.assetRef; } });
    refs.setAccess(true);
    assert.equal(await refs.save({ ...draft, url: 'https://external.test/image.png' }), true);
    assert.deepEqual(uploaded, ['data:image/png;base64,aW1hZ2U=']);
    assert.equal(sent[0].assetRef, record.assetRef);
    refs.dispose();
    const failed = new OwnerReferences(new THREE.Scene(), () => assert.fail('failed upload sent a save'), () => {}, { assetRef: async () => { throw new Error('offline'); } });
    failed.setAccess(true); assert.equal(await failed.save(draft), false); failed.dispose();
  } finally { globalThis.fetch = oldFetch; }
});

test('list replacement, deletion and access loss dispose owner-only meshes and ignore stale loads', () => {
  const oldImage = globalThis.Image, images: any[] = [];
  globalThis.Image = class { src = ''; onload?: () => void; constructor() { images.push(this); } } as any;
  try {
    const scene = new THREE.Scene(); let changed = 0;
    const refs = new OwnerReferences(scene, () => true, () => { changed++; });
    refs.snapshot([record]); assert.equal(scene.children.length, 0);
    refs.setAccess(true); refs.accept({ type: 'owner_reference_list', references: [record] });
    const first = scene.children[0] as THREE.Mesh;
    const staleLoad = images[0].onload;
    refs.accept({ type: 'owner_reference_saved', reference: { ...record, position: [4, 5, 6], opacity: .6, aboveArt: false } });
    assert.equal(images[0].src, '', 'cancel pending image work on replacement');
    staleLoad(); assert.equal(first.parent, null);
    const mesh = scene.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    images[1].onload(); assert.deepEqual(mesh.position.toArray(), [4, 5, 6]); assert.deepEqual(mesh.scale.toArray(), [4, 2, 1]);
    assert.equal(mesh.material.depthTest, true); assert.equal(mesh.material.depthWrite, false); assert.equal(mesh.renderOrder, 2);
    assert.deepEqual(new THREE.Raycaster().intersectObject(mesh), []);
    let disposed = 0; mesh.material.map!.addEventListener('dispose', () => { disposed++; });
    mesh.geometry.addEventListener('dispose', () => { disposed++; }); mesh.material.addEventListener('dispose', () => { disposed++; });
    refs.accept({ type: 'owner_reference_deleted', referenceId: 'one' }); assert.equal(disposed, 3); assert.equal(scene.children.length, 0);
    refs.snapshot([record]); const abandonedLoad = images[2].onload;
    refs.setAccess(false); abandonedLoad(); assert.equal(scene.children.length, 0); assert.equal(refs.records.length, 0);
    assert.ok(changed >= 4); refs.dispose();
  } finally { globalThis.Image = oldImage; }
});

test('only valid placements are rendered and owner lists remain bounded to fifty records', () => {
  const oldImage = globalThis.Image;
  globalThis.Image = class { src = ''; } as any;
  try {
    const refs = new OwnerReferences(new THREE.Scene(), () => true, () => {}); refs.setAccess(true);
    refs.snapshot([{ ...record, width: NaN }, ...Array.from({ length: 55 }, (_, index) => ({ ...record, id: String(index), referenceId: String(index) }))]);
    assert.equal(refs.records.length, 50); refs.dispose();
  } finally { globalThis.Image = oldImage; }
});

test('owner reference image loading is capped at seven and access loss clears queued loads', () => {
  const oldImage = globalThis.Image, images: any[] = [];
  globalThis.Image = class { src = ''; onload?: () => void; constructor() { images.push(this); } } as any;
  try {
    const refs = new OwnerReferences(new THREE.Scene(), () => true, () => {}); refs.setAccess(true);
    refs.snapshot(Array.from({ length: 20 }, (_, index) => ({ ...record, id: String(index), referenceId: String(index) })));
    assert.equal(images.filter(image => image.src).length, 7);
    images[0].onload(); assert.equal(images.filter(image => image.src).length, 8);
    refs.setAccess(false); assert.ok(images.every(image => !image.src)); refs.dispose();
  } finally { globalThis.Image = oldImage; }
});

test('persistent saves clamp opacity to the exact server range without changing the local draft', async () => {
  const sent: any[] = [];
  const refs = new OwnerReferences(new THREE.Scene(), message => { sent.push(message); return true; }, () => {}, { assetRef: async () => record.assetRef });
  refs.setAccess(true);
  const transparent = { ...draft, opacity: 0 };
  assert.equal(await refs.save(transparent), true); assert.equal(sent[0].opacity, .05); assert.equal(transparent.opacity, 0);
  assert.equal(await refs.save({ ...draft, opacity: 2 }), true); assert.equal(sent[1].opacity, 1);
  assert.equal(await refs.save({ ...draft, opacity: Infinity }), false); refs.dispose();
});

test('stalled owner images release loading slots and leave authoritative records intact', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const oldImage = globalThis.Image, images: any[] = [];
  globalThis.Image = class { src = ''; constructor() { images.push(this); } } as any;
  try {
    const refs = new OwnerReferences(new THREE.Scene(), () => true, () => {}); refs.setAccess(true);
    refs.snapshot(Array.from({ length: 8 }, (_, index) => ({ ...record, id: String(index), referenceId: String(index) })));
    t.mock.timers.tick(30_001);
    assert.equal(images[7].src, record.assetRef); assert.equal(images[0].src, '');
    assert.equal(refs.records.length, 8); refs.dispose();
  } finally { globalThis.Image = oldImage; }
});

test('capture takes the loaded guide actual world transform and encoded wall face', () => {
  const oldImage = globalThis.Image;
  const images: any[] = [];
  globalThis.Image = class { naturalWidth = 800; naturalHeight = 400; src = ''; onload?: () => void; constructor() { images.push(this); } } as any;
  try {
    const world: any = { scene: new THREE.Scene(), paintWorkspace: { selection: { wall: { surfaceId: 'ss1:0:0:wall' }, face: 4, center: new THREE.Vector3(2, 3, 4), up: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0, 0, 1), width: 4, height: 4 } } };
    const guide = new ReferenceGuide(world);
    assert.equal(typeof guide.capture, 'function');
    assert.equal(guide.capture(), null);
    guide.set({ url: 'blob:local', name: 'guide', visible: true, moving: false, opacity: .35, x: .25, y: -.25, scale: 2, rotation: 90 });
    assert.equal(guide.capture(), null, 'do not save an unloaded image');
    images[0].onload();
    const capture = guide.capture()!;
    assert.deepEqual(capture.position, [3, 2, 4.04]);
    assert.equal(capture.surfaceId, 'ss1:0:0:wall/f4/l0');
    assert.equal(capture.width, 8); assert.equal(capture.height, 4);
    assert.ok(new THREE.Quaternion(...capture.quaternion).angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)) < 1e-7);
    assert.equal(capture.url, 'blob:local'); assert.equal(capture.aboveArt, true);
    world.scene.position.x = 10;
    assert.deepEqual(guide.capture()!.position, [13, 2, 4.04], 'capture includes actual ancestor transforms');
    guide.dispose();
  } finally { globalThis.Image = oldImage; }
});
