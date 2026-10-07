import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AssetPreview } from '../src/game/assetPreview';
import { normalizeAssetPreviewPreference } from '../src/game/assetPreviewPreference';
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
test('disposing during a building load cancels attachment and frees the late result',async()=>{
 const scene=new THREE.Scene(),avatar=new THREE.Group();let resolve!: (value:ReturnType<typeof model>)=>void;
 const preview=new AssetPreview(scene,avatar,()=>new Promise(r=>resolve=r));const pending=preview.configure({model:'original',building:true});preview.dispose();
 const asset=model();let disposed=0;asset.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.addEventListener('dispose',()=>disposed++);});resolve(asset);await pending;
 assert.equal(disposed,1);assert.equal(scene.getObjectByName('quaternius-building'),undefined);
});
test('turning the building off releases its decoded image as well as its GPU texture',async()=>{
 const scene=new THREE.Scene(),avatar=new THREE.Group();let closed=0,disposed=0;
 const asset=model();const texture=new THREE.Texture({close:()=>closed++} as unknown as HTMLImageElement);texture.addEventListener('dispose',()=>disposed++);
 (asset.scene.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>).material.map=texture;
 const preview=new AssetPreview(scene,avatar,async()=>asset);await preview.configure({model:'original',building:true});await preview.configure({model:'original',building:false});
 assert.equal(closed,1);assert.equal(disposed,1);preview.dispose();
});
