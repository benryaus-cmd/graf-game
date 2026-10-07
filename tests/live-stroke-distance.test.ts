import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { withinLiveStrokeDistance } from '../src/game/liveStrokeDistance';
import type { PaintWall } from '../src/game/worldTypes';

test('live-stroke range uses the nearest wall bounds, honours selected canvases, and tolerates large/rotated walls',()=>{
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(10,8,.5));mesh.position.set(50,4,0);
 const wall={mesh} as PaintWall;const position=new THREE.Vector3(0,1.7,0);
 assert.equal(withinLiveStrokeDistance(wall,position,30),false);
 assert.equal(withinLiveStrokeDistance(wall,position,60),true);
 assert.equal(withinLiveStrokeDistance(wall,position,30,wall),true);
 mesh.position.x=20;mesh.rotation.y=Math.PI/4;
 assert.equal(withinLiveStrokeDistance(wall,position,30),true);
});
