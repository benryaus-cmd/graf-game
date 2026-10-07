import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addUrbanCourtyard } from '../src/game/urbanCourtyard';
import { createCityChunkStream } from '../src/game/cityChunks';
import { setRenderSettings, DEFAULT_RENDER_SETTINGS } from '../src/game/renderSettings';
const materials=()=>({wallMaterial:new THREE.MeshStandardMaterial(),groundMaterial:new THREE.MeshStandardMaterial(),railMaterial:new THREE.MeshStandardMaterial(),glassMaterial:new THREE.MeshStandardMaterial()});

test('courtyard ownership disposes instance buffers exactly once, including pending model cancellation',()=>{
 const root=addUrbanCourtyard(new THREE.Group(),[],[]);let count=0;
 root.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.addEventListener('dispose',()=>count++);});
 root.userData.disposeFixture();root.userData.disposeFixture();assert.equal(count,2);
});
test('incremental chunks retain the selected owner, cancel stale work and settle without leaking active chunks',()=>{
 const scene=new THREE.Scene(),stream=createCityChunkStream(scene,materials());setRenderSettings({retentionSeconds:0,streamBudgetMs:.5});
 try {stream.updateAt(0,0);const selected=stream.walls[0];stream.setPaintPin(()=>selected);
  for(let i=0;i<60;i++)stream.updateAt(150,0);assert.ok(stream.walls.includes(selected));
  stream.setPaintPin(()=>undefined);for(let i=0;i<80;i++)stream.updateAt(-150,0);assert.ok(!stream.walls.includes(selected));
  for(let i=0;i<100;i++)stream.updateAt(0,0);assert.equal(scene.userData.cityStreamStats.queued,0);assert.equal(scene.userData.cityStreamStats.active,9);
 }finally{scene.userData.disposeCity();setRenderSettings({...DEFAULT_RENDER_SETTINGS});}
});
