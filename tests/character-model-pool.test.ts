import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CharacterModelPool } from '../src/game/characterModelPool';
import { release, type Model } from '../src/game/assetPreview';

function template(): Model {
 const root = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'root-bone';
 const geometry = new THREE.BoxGeometry(1, 2, 1), mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
 geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(geometry.attributes.position.count * 4), 4));
 const weights = new Float32Array(geometry.attributes.position.count * 4);
 for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
 geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
 root.add(mesh); mesh.add(bone); mesh.bind(new THREE.Skeleton([bone]));
 return { scene: root, animations: [new THREE.AnimationClip('Idle', 1, [new THREE.NumberKeyframeTrack('root-bone.position[x]', [0, 1], [0, 1])])] };
}

test('same URL shares one parsed template while cloned skeletons, bones and mixers remain independent', async () => {
 let loads = 0; const source = template();
 const pool = new CharacterModelPool(async () => { loads++; return source; }, release);
 const [first, second] = await Promise.all([pool.acquire('same.glb', new AbortController().signal), pool.acquire('same.glb', new AbortController().signal)]);
 assert.equal(loads, 1);
 const a = first.model.scene.children[0] as THREE.SkinnedMesh, b = second.model.scene.children[0] as THREE.SkinnedMesh;
 assert.equal(a.geometry, b.geometry); assert.equal(a.material, b.material);
 assert.notEqual(a.skeleton, b.skeleton); assert.notEqual(a.skeleton.bones[0], b.skeleton.bones[0]);
 assert.notEqual(a.skeleton.bones[0], (source.scene.children[0] as THREE.SkinnedMesh).skeleton.bones[0]);
 const mixerA = new THREE.AnimationMixer(first.model.scene), mixerB = new THREE.AnimationMixer(second.model.scene);
 mixerA.clipAction(first.model.animations[0]).play(); mixerB.clipAction(second.model.animations[0]).play();
 mixerA.update(.25); mixerB.update(.75);
 assert.equal(a.skeleton.bones[0].position.x, .25); assert.equal(b.skeleton.bones[0].position.x, .75);
 a.skeleton.computeBoneTexture(); b.skeleton.computeBoneTexture();
 let boneTextures = 0, geometryDisposals = 0;
 a.skeleton.boneTexture!.addEventListener('dispose', () => { boneTextures++; });
 b.skeleton.boneTexture!.addEventListener('dispose', () => { boneTextures++; });
 a.geometry.addEventListener('dispose', () => { geometryDisposals++; });
 first.release(); first.release();
 assert.equal(boneTextures, 1); assert.equal(geometryDisposals, 0);
 pool.dispose(); assert.equal(geometryDisposals, 0);
 second.release(); assert.equal(boneTextures, 2); assert.equal(geometryDisposals, 1);
});

test('template cache retains at most four idle URLs and never disposes a live instance template', async () => {
 const disposed: string[] = [];
 const pool = new CharacterModelPool(async url => {
  const model = template(); (model.scene.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => disposed.push(url)); return model;
 }, release);
 const live = await pool.acquire('live.glb', new AbortController().signal);
 for (let i = 0; i < 6; i++) (await pool.acquire(`idle-${i}.glb`, new AbortController().signal)).release();
 assert.deepEqual(disposed, ['idle-0.glb', 'idle-1.glb']);
 assert.equal(disposed.includes('live.glb'), false);
 live.release(); assert.equal(disposed.length, 3);
 pool.dispose(); assert.equal(disposed.length, 7);
});

test('one cancelled subscriber cannot abort another user of the shared model load', async () => {
 let resolve!: (model: Model) => void, loads = 0;
 const pool = new CharacterModelPool(async () => { loads++; return new Promise<Model>(r => { resolve = r; }); }, release);
 const cancelled = new AbortController();
 const first = pool.acquire('pending.glb', cancelled.signal);
 const rejected = assert.rejects(first, error => (error as Error).name === 'AbortError');
 const second = pool.acquire('pending.glb', new AbortController().signal);
 cancelled.abort(); await rejected;
 resolve(template()); const lease = await second;
 assert.equal(loads, 1); assert.ok(lease.model.scene.children[0]);
 lease.release(); pool.dispose();
});

test('failed shared templates are discarded so a later choice can retry', async () => {
 let loads = 0;
 const pool = new CharacterModelPool(async () => { if (++loads === 1) throw Error('offline'); return template(); }, release);
 await assert.rejects(pool.acquire('retry.glb', new AbortController().signal), /offline/);
 const lease = await pool.acquire('retry.glb', new AbortController().signal);
 assert.equal(loads, 2); lease.release(); pool.dispose();
});
