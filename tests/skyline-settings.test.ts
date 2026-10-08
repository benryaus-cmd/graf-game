import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normaliseRenderSettings, setRenderSettings, DEFAULT_RENDER_SETTINGS } from '../src/game/renderSettings';
import { CityHorizon } from '../src/game/cityHorizon';

test('visual experiments support extended ranges and migrate missing skyline preferences',()=>{
 const settings=normaliseRenderSettings({fogDensity:.15,horizonDistance:720,skylineDistance:960,exposure:2.2});
 assert.equal(settings.fogDensity,.15);assert.equal(settings.horizonDistance,720);assert.equal(settings.skylineDistance,960);assert.equal(settings.exposure,2.2);
 assert.equal(settings.detailDistance,DEFAULT_RENDER_SETTINGS.detailDistance);
});

test('tall distant buildings have flat instances and become plain boxes nearby',()=>{
 const scene=new THREE.Scene(),horizon=new CityHorizon(scene);setRenderSettings({...DEFAULT_RENDER_SETTINGS,horizonDistance:96,skylineDistance:240});
 try{
  for(let i=0;i<100;i++)horizon.update(0,0,new Set());
  const planes:THREE.InstancedMesh[]=[];scene.traverse(o=>{if(o instanceof THREE.InstancedMesh)planes.push(o);});
  assert.ok(planes.length>0);assert.ok(planes.every(o=>o.geometry instanceof THREE.PlaneGeometry));
  assert.ok(scene.userData.cityHorizonStats.flat>0);assert.ok(scene.userData.cityHorizonStats.plain>0);
  setRenderSettings({skyline:false});horizon.update(0,0,new Set());assert.ok(planes.every(o=>!o.visible));
 }finally{horizon.dispose();setRenderSettings({...DEFAULT_RENDER_SETTINGS});}
});

test('a visible detailed tower masks its flat silhouette even beyond the plain-box range',()=>{
 const scene=new THREE.Scene(),horizon=new CityHorizon(scene);setRenderSettings({...DEFAULT_RENDER_SETTINGS,horizonDistance:48,detailDistance:96,skylineDistance:480});
 try{
  for(let i=0;i<50;i++)horizon.update(-200,-156,new Set(['-3:-2']));
  const flat=scene.getObjectByName('city-flat-landmarks') as THREE.InstancedMesh;
  assert.ok(flat);const masks=flat.geometry.getAttribute('cityHidden'),matrix=new THREE.Matrix4();let found=false;
  for(let i=0;i<flat.count;i++){flat.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);if(Math.floor(p.x/48+.5)===-3&&Math.floor(p.z/48+.5)===-2){found=true;assert.equal(masks.getX(i),1);}}
  assert.ok(found);
 }finally{horizon.dispose();setRenderSettings({...DEFAULT_RENDER_SETTINGS});}
});
