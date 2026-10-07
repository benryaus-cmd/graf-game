import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPaintWall } from '../src/game/architectureWalls';
import { assignSurfaceIds, pointToHit } from '../src/multiplayer/surfaces';

test('batched wall background is one material while canonical face groups and IDs remain unchanged',()=>{
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial();
 const {wall}=createPaintWall(group,4,8,8,6,.5,material);
 const original=new THREE.Mesh(new THREE.BoxGeometry(8,6,.5));original.position.copy(wall.mesh.position);
 const legacy={...wall,mesh:original};assignSurfaceIds(1,0,[legacy]);assignSurfaceIds(1,0,[wall]);assert.equal(wall.surfaceId,legacy.surfaceId);
 const visual=wall.mesh.userData.baseVisual as THREE.Mesh;
 assert.ok(visual,'one visual background exists');assert.equal(visual.material,material);assert.equal(visual.geometry.groups.length,0);
 assert.equal(wall.mesh.geometry.groups.length,6);assert.ok((wall.mesh.material as THREE.Material[]).every(m=>!m.visible));
 for(const face of [0,1,4,5]){const positions=[[8,3,8],[0,3,8],[4,3,8.25],[4,3,7.75]];const p=positions[[0,1,4,5].indexOf(face)];assert.ok(pointToHit(wall,face,{x:p[0],y:p[1],z:p[2],pressure:1}));}
 wall.mesh.updateMatrixWorld(true);
 for(const [origin,direction,face] of [[new THREE.Vector3(4,3,12),new THREE.Vector3(0,0,-1),4],[new THREE.Vector3(4,3,4),new THREE.Vector3(0,0,1),5]] as const){
   const hit=new THREE.Raycaster(origin,direction).intersectObject(wall.mesh,false)[0];
   assert.ok(hit);assert.equal(hit.face?.materialIndex,face);
 }
});
