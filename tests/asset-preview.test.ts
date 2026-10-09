import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AssetPreview } from '../src/game/assetPreview';
import { normalizeAssetPreviewPreference } from '../src/game/assetPreviewPreference';
import { getCharacterModel } from '../src/game/characterCatalog';
const model = () => ({scene:new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial())),animations:[]});
test('preview preferences accept only the explicit free model and preserve an off switch',()=>{
 assert.deepEqual(normalizeAssetPreviewPreference({model:'owner',building:false}),{model:'original',building:false});
 assert.deepEqual(normalizeAssetPreviewPreference({model:'hoodie',building:true}),{model:'hoodie',building:true});
});
test('late character download cannot replace a newer choice or leak resources',async()=>{
 const scene=new THREE.Scene(),avatar=new THREE.Group();const original=new THREE.Group();avatar.add(original);scene.add(avatar);
 let resolve!: (value:ReturnType<typeof model>)=>void;
 const preview=new AssetPreview(scene,avatar,()=>new Promise(r=>resolve=r));
 const pending=preview.configure({model:'hoodie',building:false});
 await preview.configure({model:'original',building:false});
 const asset=model();let disposed=0;asset.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.addEventListener('dispose',()=>disposed++);});
 resolve(asset);await pending;
 assert.equal(original.parent?.visible,true);assert.equal(disposed,1);assert.equal(avatar.getObjectByName('quaternius-hoodie'),undefined);
 preview.dispose();assert.equal(original.parent,avatar);
});
test('failed model loads leave the existing character visible and remain retryable',async()=>{
 const scene=new THREE.Scene(),avatar=new THREE.Group().add(new THREE.Group());const original=avatar.children[0];let attempts=0;
 const preview=new AssetPreview(scene,avatar,async()=>{attempts++;if(attempts===1)throw new Error('offline');return model();});
 await preview.configure({model:'hoodie',building:false});assert.equal(original.parent?.visible,true);
 await preview.configure({model:'hoodie',building:false});assert.equal(attempts,2);assert.equal(original.parent?.visible,false);
 await preview.configure({model:'original',building:false});assert.equal(original.parent?.visible,true);preview.dispose();
});
test('legacy optional building preference cannot create a second fixture',async()=>{
 const scene=new THREE.Scene(),avatar=new THREE.Group();let loads=0;const preview=new AssetPreview(scene,avatar,async()=>{loads++;return model();});
 await preview.configure({model:'original',building:true});assert.equal(loads,0);assert.equal(scene.getObjectByName('quaternius-building'),undefined);preview.dispose();
});

test('catalog selection swaps models and keeps base children and label siblings intact', async () => {
 const scene = new THREE.Scene(), avatar = new THREE.Group(), original = new THREE.Group();
 avatar.add(original);
 const urls: string[] = [];
 const preview = new AssetPreview(scene, avatar, async url => { urls.push(url); return model(); });
 const label = new THREE.Group(); label.name = 'player-name-label'; avatar.add(label);
 await preview.configure({ model: 'casual-female', building: false });
 const first = avatar.getObjectByName('quaternius-casual-female') as THREE.Group;
 assert.ok(first);
 assert.ok(Math.abs(new THREE.Box3().setFromObject(first).getSize(new THREE.Vector3()).y - 1.9) < 1e-8);
 let disposed = 0;
 first.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.addEventListener('dispose', () => { disposed++; }); });
 await preview.configure({ model: 'worker-male', building: false });
 assert.deepEqual(urls, [getCharacterModel('casual-female').url, getCharacterModel('worker-male').url]);
 assert.equal(first.parent, null); assert.equal(disposed, 1);
 assert.ok(avatar.getObjectByName('quaternius-worker-male'));
 assert.equal(original.parent?.visible, false); assert.equal(label.visible, true); assert.equal(label.parent, avatar);
 preview.dispose();
 assert.equal(original.parent, avatar); assert.equal(label.parent, avatar);
});

test('newer imported character wins a slow older model request and cancelled model resources are released', async () => {
 const avatar = new THREE.Group().add(new THREE.Group());
 const requests = new Map<string, (value: ReturnType<typeof model>) => void>();
 const preview = new AssetPreview(new THREE.Scene(), avatar, url => new Promise(resolve => { requests.set(url, resolve); }));
 const older = preview.configure({ model: 'casual-male', building: false });
 const newer = preview.configure({ model: 'suit-female', building: false });
 requests.get(getCharacterModel('suit-female').url!)!(model()); await newer;
 const stale = model(); let disposed = 0;
 stale.scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.addEventListener('dispose', () => { disposed++; }); });
 requests.get(getCharacterModel('casual-male').url!)!(stale); await older;
 assert.ok(avatar.getObjectByName('quaternius-suit-female'));
 assert.equal(avatar.getObjectByName('quaternius-casual-male'), undefined); assert.equal(disposed, 1);
 preview.dispose();
});

test('failed replacement restores original, reports failure, and retries the chosen model', async () => {
 const avatar = new THREE.Group().add(new THREE.Group()), original = avatar.children[0];
 let attempts = 0;
 const preview = new AssetPreview(new THREE.Scene(), avatar, async () => { if (++attempts === 2) throw Error('offline'); return model(); });
 const states: { model: string; phase: string }[] = []; preview.onModelState = state => states.push(state);
 await preview.configure({ model: 'hoodie', building: false });
 await preview.configure({ model: 'casual3-male', building: false });
 assert.equal(original.parent?.visible, true);
 assert.equal(avatar.getObjectByName('quaternius-hoodie'), undefined);
 assert.deepEqual(states.at(-1), { model: 'casual3-male', phase: 'error' });
 await preview.configure({ model: 'casual3-male', building: false });
 assert.equal(attempts, 3); assert.equal(original.parent?.visible, false);
 assert.deepEqual(states.at(-1), { model: 'casual3-male', phase: 'ready' });
 preview.dispose();
});

test('catalog animation names drive independent walking and jumping poses', async () => {
 const avatar = new THREE.Group().add(new THREE.Group());
 const animations = getCharacterModel('casual3-female').animations!;
 const preview = new AssetPreview(new THREE.Scene(), avatar, async () => {
  const result = model(); const joint = new THREE.Object3D(); joint.name = 'test-joint'; result.scene.add(joint);
  result.animations = [
   new THREE.AnimationClip(animations.idle, 1, [new THREE.NumberKeyframeTrack('test-joint.position[x]', [0, 1], [0, 0])]),
   new THREE.AnimationClip(animations.walk, 1, [new THREE.NumberKeyframeTrack('test-joint.position[x]', [0, 1], [2, 2])]),
   new THREE.AnimationClip(animations.jump!, 1, [new THREE.NumberKeyframeTrack('test-joint.position[x]', [0, 1], [4, 4])]),
  ]; return result;
 });
 await preview.configure({ model: 'casual3-female', building: false });
 for (let i = 0; i < 5; i++) preview.animate(.05, true, false);
 assert.equal(avatar.getObjectByName('test-joint')!.position.x, 2);
 for (let i = 0; i < 5; i++) preview.animate(.05, false, true);
 assert.equal(avatar.getObjectByName('test-joint')!.position.x, 4);
 preview.dispose();
});
