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

test('plain proxies cover the player-side edge of the planned ring',()=>{
 const scene=new THREE.Scene(),horizon=new CityHorizon(scene);setRenderSettings({...DEFAULT_RENDER_SETTINGS,horizonDistance:68,skylineDistance:240,fogCull:false});
 try{
  for(let i=0;i<100;i++)horizon.update(23.5,0,new Set());
  const block=horizon.root.children.find(root=>root instanceof THREE.Group&&root.children.some(mesh=>{
   if(!(mesh instanceof THREE.Mesh))return false;mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox!;return box.min.x===72&&box.max.x===120&&box.min.z===-24&&box.max.z===24;
  }));
  assert.ok(block,'chunk 2:0 is only 48.5m from the player and needs its plain replacement');assert.equal(block.visible,true);
 }finally{horizon.dispose();setRenderSettings({...DEFAULT_RENDER_SETTINGS});}
});

test('flat replacements start two metres before the actual 3D end, including wider detail range',()=>{
 const scene=new THREE.Scene(),horizon=new CityHorizon(scene);setRenderSettings({...DEFAULT_RENDER_SETTINGS,horizonDistance:68,detailDistance:80,skylineDistance:240,skylineMinHeight:5,fogCull:false});
 try{
  for(let i=0;i<100;i++)horizon.update(0,0,new Set());
  const flat=scene.getObjectByName('city-flat-landmarks') as THREE.InstancedMesh,matrix=new THREE.Matrix4();
  let targetX=0,targetZ=0;let index=-1,key='',cx=0,cz=0;
  for(let i=0;i<flat.count;i++){flat.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);if(p.x>30&&Math.abs(p.z)<23){index=i;targetX=p.x;targetZ=p.z;cx=Math.floor(p.x/48+.5);cz=0;key=`${cx}:${cz}`;break;}}
  assert.ok(index>=0,'handed-over tower fixture exists east of origin');
  const mask=()=>{const current=scene.getObjectByName('city-flat-landmarks') as THREE.InstancedMesh;for(let i=0;i<current.count;i++){current.getMatrixAt(i,matrix);const p=new THREE.Vector3().setFromMatrixPosition(matrix);if(Math.abs(p.x-targetX)<.001&&Math.abs(p.z-targetZ)<.001)return current.geometry.getAttribute('cityHidden').getX(i);}throw Error('Replacement tower missing');};
  const at=(distance:number,active=false)=>{for(let i=0;i<100;i++)horizon.update(cx*48-24-distance,0,new Set(active?[key]:[]));};
  at(65.9);assert.equal(mask(),1,'flat stays hidden before the overlap');
  at(66);assert.equal(mask(),0,'flat is visible two metres before plain end at 68');
  at(68.1);assert.equal(mask(),0,'flat stays available after plain end');
  at(77.9,true);assert.equal(mask(),1,'visible detailed chunk continues beyond plain range');
  at(78,true);assert.equal(mask(),0,'flat overlaps detailed end at 80 by two metres');
  at(80.1);assert.equal(mask(),0,'flat stays available after detailed end');
 }finally{horizon.dispose();setRenderSettings({...DEFAULT_RENDER_SETTINGS});}
});
