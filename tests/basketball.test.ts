import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASKETBALL_COURT } from '../src/game/basketballCourt';
import { createBall, launchFromFlick, stepBall, type ShotLaunch } from '../src/game/basketballPhysics';
import { QUARTER_BUILDINGS, QUARTER_LAMPS, quarterFootprint } from '../src/game/morningQuarterLayout';
import { MorningQuarterAssets } from '../src/game/morningQuarterAssets';
import { prepareQuarterChunk } from '../src/game/morningQuarterContent';

const falling = (x = -53, y = 3.5, velocity: [number, number, number] = [0,-2,0]): ShotLaunch => ({courtId:'map2-basketball',shotId:'test-shot',spotId:2,version:1,origin:[x,y,-40.08],velocity});
// These tests catch scoring by proximity, missing radius clearance, and reversed crossings.
test('only a downward ball clearing the actual opening scores', () => {
 const ball=createBall(falling()); const result=stepBall(ball,.2);
 assert.equal(result?.outcome,'make'); assert.equal(result?.swish,true);
 assert.equal(result?.shotId,'test-shot'); assert.equal(result?.spotId,2); assert.equal(result?.version,1);
 const edge=createBall(falling(-52.82)); assert.equal(stepBall(edge,.2)?.outcome,undefined);
 const outside=createBall(falling(-52.4)); assert.equal(stepBall(outside,3)?.outcome,'miss');
 const upward=createBall(falling(-53,2.85,[0,4,0])); assert.equal(stepBall(upward,.1),null); assert.equal(upward.scored,false);
});
test('one result per shot even after scoring, bouncing and expiry', () => {
 const ball=createBall(falling()); assert.equal(stepBall(ball,.2)?.outcome,'make');
 assert.equal(stepBall(ball,2.8),null); assert.equal(ball.expired,true); assert.equal(stepBall(ball,4),null);
});
test('three second wallclock lifetime survives giant frames and late arrival', () => {
 const ball=createBall(falling(-52.4)); assert.equal(stepBall(ball,2.99),null); assert.equal(ball.expired,false);
 assert.equal(stepBall(ball,.01)?.outcome,'miss'); assert.equal(ball.expired,true);
 const giant=createBall(falling()); assert.equal(stepBall(giant,100)?.outcome,'make'); assert.equal(giant.expired,true);
 const late=createBall(falling(),3.2); assert.equal(late.expired,true); assert.ok(late.ageSeconds>=3);
});
test('fixed stepping preserves physical outcomes independent of frame grouping', () => {
 const a=createBall(falling()); const b=createBall(falling());
 const result=stepBall(a,.4); let outcome;
 for(let i=0;i<40;i++){const r=stepBall(b,.01); if(r)outcome=r.outcome;}
 assert.equal(result?.outcome,outcome); assert.ok(Math.abs(a.position[1]-1.9152)<1e-9,'gravity applies over real elapsed time');
 for(let i=0;i<3;i++)assert.ok(Math.abs(a.position[i]-b.position[i])<1e-9);
});
test('ground, backboard and rim contacts change real velocities', () => {
 const ground=createBall({...falling(-53,.2),origin:[-53,.2,-35]}); stepBall(ground,.1); assert.ok(ground.velocity[1]>0); assert.equal(ground.contacted,true);
 const board=createBall({...falling(),origin:[-53,3.5,-40.1],velocity:[0,0,-4]}); stepBall(board,.1); assert.ok(board.velocity[2]>0); assert.equal(board.contacted,true);
 const rim=createBall(falling(-52.74,3.3)); stepBall(rim,.2); assert.equal(rim.contacted,true); assert.equal(rim.scored,false);
});
test('valid flicks control aim and strength without random or autoaim outcomes', () => {
 assert.equal(launchFromFlick(2,{dx:0,dy:.01,durationMs:200}),null);
 for(const g of [{dx:0,dy:-.5,durationMs:450},{dx:NaN,dy:.5,durationMs:450},{dx:0,dy:.5,durationMs:0},{dx:0,dy:.5,durationMs:NaN}])assert.equal(launchFromFlick(2,g),null);
 assert.equal(launchFromFlick(99,{dx:0,dy:.54,durationMs:450}),null);
 const good=launchFromFlick(2,{dx:0,dy:.54,durationMs:450})!;
 assert.ok(good); assert.equal(stepBall(createBall(good),3)?.outcome,'make');
 const weak=launchFromFlick(2,{dx:0,dy:.2,durationMs:450})!; assert.equal(stepBall(createBall(weak),3)?.outcome,'miss');
 const sideways=launchFromFlick(2,{dx:.25,dy:.54,durationMs:450})!; assert.equal(stepBall(createBall(sideways),3)?.outcome,'miss');
 const fast=launchFromFlick(2,{dx:0,dy:.54,durationMs:100})!; assert.notDeepEqual(good.velocity,fast.velocity); assert.equal(stepBall(createBall(fast),3)?.outcome,'miss');
 // Same gesture normalized against the short viewport dimension in portrait and landscape.
 const portrait=launchFromFlick(2,{dx:19.5/390,dy:210.6/390,durationMs:450})!;
 const landscape=launchFromFlick(2,{dx:18/360,dy:194.4/360,durationMs:450})!;
 for(let i=0;i<3;i++){assert.ok(Math.abs(portrait.velocity[i]-landscape.velocity[i])<1e-12);assert.ok(Math.abs(portrait.origin[i]-landscape.origin[i])<1e-12);}
});
test('all five playable arc marks clear real building, table, lamp and support colliders', () => {
 const priorDocument=globalThis.document;
 globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>null})} as unknown as Document;
 const assets=new MorningQuarterAssets(()=>new Promise(()=>{}));
 const material=new THREE.MeshStandardMaterial();
 const iterator=prepareQuarterChunk(-1,-1,{wallMaterial:material,groundMaterial:material,railMaterial:material,glassMaterial:material},assets);
 let step=iterator.next(); while(!step.done)step=iterator.next();
 try{
 const rim=step.value.group.getObjectByName('quarter-basketball-rim') as THREE.Mesh<THREE.TorusGeometry>;
 assert.deepEqual(rim.position.toArray(),[-53,3.05,-40.08]); assert.equal(rim.geometry.parameters.radius,.28);
 assert.equal(new Set(BASKETBALL_COURT.spots.map(s=>s.id)).size,5);
 for(const spot of BASKETBALL_COURT.spots){const [x,,z]=spot.position;
 assert.ok(x>BASKETBALL_COURT.bounds.minX+.4&&x<BASKETBALL_COURT.bounds.maxX-.4&&z>BASKETBALL_COURT.bounds.minZ+.4&&z<BASKETBALL_COURT.bounds.maxZ-.4);
 for(const c of step.value.colliders)assert.ok(x<c.minX-.4||x>c.maxX+.4||z<c.minZ-.4||z>c.maxZ+.4,`spot ${spot.id} collider ${JSON.stringify(c)}`);
 for(const b of QUARTER_BUILDINGS){const f=quarterFootprint(b);assert.ok(Math.abs(x-b.x)>f.width/2+.4||Math.abs(z-b.z)>f.depth/2+.4);}
 for(const [lx,lz]of QUARTER_LAMPS)assert.ok(Math.hypot(x-lx,z-lz)>.6);
 const shot=launchFromFlick(spot.id,{dx:0,dy:.54,durationMs:450})!; assert.equal(stepBall(createBall(shot),3)?.outcome,'make',`spot ${spot.id}`);
 }
 }finally{assets.dispose();material.dispose();globalThis.document=priorDocument;}
});
