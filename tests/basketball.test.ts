import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BASKETBALL_COURT } from '../src/game/basketballCourt';
import { basketballFlickSpeed, createBall, launchFromFlick, stepBall, type ShotLaunch } from '../src/game/basketballPhysics';
import { QUARTER_BUILDINGS, QUARTER_LAMPS, quarterFootprint } from '../src/game/morningQuarterLayout';
import { MorningQuarterAssets } from '../src/game/morningQuarterAssets';
import { prepareQuarterChunk } from '../src/game/morningQuarterContent';
import { flick, flickDy } from './basketball-calibration';

const releaseOrigin:[number,number,number]=[-52.725,2.6,-34.837];

const falling = (x = -53, y = 3.5, velocity: [number, number, number] = [0,-2,0]): ShotLaunch => ({courtId:'map2-basketball',shotId:'test-shot',spotId:2,version:1,origin:[x,y,BASKETBALL_COURT.rim.center[2]],velocity});
// These tests catch scoring by proximity, missing radius clearance, and reversed crossings.
test('only a downward ball clearing the actual opening scores', () => {
 const ball=createBall(falling()); const result=stepBall(ball,.2);
 assert.equal(result?.outcome,'make'); assert.equal(result?.swish,true);
 assert.equal(result?.shotId,'test-shot'); assert.equal(result?.spotId,2); assert.equal(result?.version,1);
 const edge=createBall(falling(-52.75)); assert.equal(stepBall(edge,.2)?.outcome,undefined);
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
 const rim=createBall(falling(-53+BASKETBALL_COURT.rim.radius,3.3)); stepBall(rim,.2); assert.equal(rim.contacted,true); assert.equal(rim.scored,false);
});
test('valid flicks control aim and strength without random or autoaim outcomes', () => {
 assert.ok(launchFromFlick(2,{dx:0,dy:.01,durationMs:200}));
 for(const g of [{dx:0,dy:-.5,durationMs:450},{dx:NaN,dy:.5,durationMs:450},{dx:0,dy:.5,durationMs:0},{dx:0,dy:.5,durationMs:NaN}])assert.equal(launchFromFlick(2,g),null);
 assert.equal(launchFromFlick(99,{dx:0,dy:.2884,durationMs:140}),null);
 const good=launchFromFlick(2,flick(7.7),releaseOrigin)!;
 assert.ok(good); assert.equal(stepBall(createBall(good),3)?.outcome,'make');
 const weak=launchFromFlick(2,flick(4),releaseOrigin)!; assert.equal(stepBall(createBall(weak),3)?.outcome,'miss');
 const sideways=launchFromFlick(2,{...flick(7.7),dx:.25},releaseOrigin)!; assert.equal(stepBall(createBall(sideways),3)?.outcome,'miss');
 const fast=launchFromFlick(2,{dx:.7,dy:.54,durationMs:100},releaseOrigin)!; assert.notDeepEqual(good.velocity,fast.velocity); assert.equal(stepBall(createBall(fast),3)?.outcome,'miss');
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
 assert.deepEqual(rim.position.toArray(),[-53,3.05,-39.9855]); assert.ok(Math.abs(rim.geometry.parameters.radius/.28-1.3)<1e-12); assert.ok(Math.abs(rim.geometry.parameters.tube/.035-1.3)<1e-12);
 const opening=BASKETBALL_COURT.rim.radius-BASKETBALL_COURT.rim.tubeRadius; assert.ok(Math.abs(opening/(.28-.035)-1.3)<1e-12);
 assert.ok(Math.abs((BASKETBALL_COURT.rim.center[2]-BASKETBALL_COURT.rim.radius-BASKETBALL_COURT.rim.tubeRadius)-(-40.08-.28-.035))<1e-12);
 assert.equal(BASKETBALL_COURT.backboard.paintZ,-40.408);
 assert.equal(new Set(BASKETBALL_COURT.spots.map(s=>s.id)).size,5);
 for(const spot of BASKETBALL_COURT.spots){const [x,,z]=spot.position;
 assert.ok(x>BASKETBALL_COURT.bounds.minX+.4&&x<BASKETBALL_COURT.bounds.maxX-.4&&z>BASKETBALL_COURT.bounds.minZ+.4&&z<BASKETBALL_COURT.bounds.maxZ-.4);
 for(const c of step.value.colliders)assert.ok(x<c.minX-.4||x>c.maxX+.4||z<c.minZ-.4||z>c.maxZ+.4,`spot ${spot.id} collider ${JSON.stringify(c)}`);
 for(const b of QUARTER_BUILDINGS){const f=quarterFootprint(b);assert.ok(Math.abs(x-b.x)>f.width/2+.4||Math.abs(z-b.z)>f.depth/2+.4);}
 for(const [lx,lz]of QUARTER_LAMPS)assert.ok(Math.hypot(x-lx,z-lz)>.6);
 const distance=Math.hypot(BASKETBALL_COURT.rim.center[0]-x,BASKETBALL_COURT.rim.center[2]-z);
 const origin:[number,number,number]=[x+(BASKETBALL_COURT.rim.center[0]-x)/distance*.25,2.6,z+(BASKETBALL_COURT.rim.center[2]-z)/distance*.25];
 const shot=launchFromFlick(spot.id,flick(7.7),origin)!; assert.equal(stepBall(createBall(shot),3)?.outcome,'make',`spot ${spot.id}`);
 }
 }finally{assets.dispose();material.dispose();globalThis.document=priorDocument;}
});

test('backboard rebounds include its back face, thin sides and rounded corners', () => {
 const board=BASKETBALL_COURT.backboard;
 const ball=(origin:[number,number,number],velocity:[number,number,number])=>createBall({...falling(),origin,velocity});
 const back=ball([-53,3.7,-40.8],[0,0,10]); stepBall(back,.04); assert.equal(back.contacted,true); assert.ok(back.velocity[2]<0);
 const side=ball([board.bounds.maxX+.16,3.7,board.center[2]],[-10,0,0]); stepBall(side,.04); assert.equal(side.contacted,true); assert.ok(side.velocity[0]>0);
 const corner=ball([board.bounds.maxX+.15,board.bounds.maxY+.15,board.center[2]],[ -6,-6,0]); stepBall(corner,.04); assert.equal(corner.contacted,true); assert.ok(corner.velocity[0]>0&&corner.velocity[1]>0);
 // This path clears the sphere-rounded board corner; an expanded box would falsely bounce it.
 const nearMiss=ball([board.bounds.maxX+.105,board.bounds.maxY+.105,board.center[2]+.2],[0,0,-10]); stepBall(nearMiss,.04); assert.equal(nearMiss.contacted,false);
});
test('fast and glancing rim impacts bounce instead of tunnelling or scoring early', () => {
 const [x,y,z]=BASKETBALL_COURT.rim.center, r=BASKETBALL_COURT.rim.radius;
 const direct=createBall({...falling(),origin:[x+r,y+.18,z],velocity:[0,-13,0]}); stepBall(direct,1/120);
 assert.equal(direct.contacted,true); assert.equal(direct.scored,false); assert.ok(direct.velocity[1]>0);
 const glancing=createBall({...falling(),origin:[x+r-.09,y+.18,z],velocity:[0,-13,0]}); stepBall(glancing,1/120);
 assert.equal(glancing.contacted,true); assert.equal(glancing.scored,false); assert.ok(glancing.velocity[0]<0,'rim contact changes lateral velocity');
 assert.ok(glancing.velocity[1]>0,'glancing rim sheds downward speed');
});

test('ordinary flicks can bank off the board or bounce off the rim into a basket', () => {
 for (const [speed, prop] of [[7.49,'rim'],[8.05,'board']] as const) {
  const ball=createBall(launchFromFlick(2,{dx:0,dy:flickDy(speed),durationMs:140},releaseOrigin)!);
  let contactedAt:[number,number,number]|null=null, firstVelocity:[number,number,number]|null=null, made;
  for(let i=0;i<360;i++) {
   const wasContacted=ball.contacted;
   const event=stepBall(ball,1/120); if(event)made=event;
   if(!wasContacted&&ball.contacted){ contactedAt=[...ball.position]; firstVelocity=[...ball.velocity]; }
  }
  assert.ok(contactedAt&&firstVelocity);
  assert.equal(made?.outcome,'make'); assert.equal(made?.swish,false); assert.equal(ball.expired,true);
  if(prop==='board'){assert.ok(firstVelocity[2]>0);assert.ok(Math.abs(contactedAt[2]-(BASKETBALL_COURT.backboard.bounds.maxZ+BASKETBALL_COURT.ballRadius))<.03);}
  else {assert.ok(firstVelocity[1]>0);assert.ok(contactedAt[2]>BASKETBALL_COURT.rim.center[2]);}
 }
});


test('release velocity controls strength with a softer ceiling and broad low power', () => {
 assert.equal(basketballFlickSpeed({dy:1,durationMs:40}),8.1);
 assert.ok(Math.abs(basketballFlickSpeed(flick(8))-8)<1e-12);
 assert.ok(Math.abs(basketballFlickSpeed(flick(4))-4)<1e-12);
 assert.equal(basketballFlickSpeed({dy:.28,durationMs:140}),basketballFlickSpeed({dy:.56,durationMs:280}));
 const a=launchFromFlick(2,{dx:.03,dy:.3,durationMs:150})!;
 const b=launchFromFlick(2,{dx:.06,dy:.6,durationMs:300})!;
 assert.deepEqual(a.velocity,b.velocity,'same final direction and speed gives same launch');
 const slower=launchFromFlick(2,{dx:.015,dy:.15,durationMs:150})!;
 assert.ok(Math.abs(Math.atan2(a.velocity[0],a.velocity[2])-Math.atan2(slower.velocity[0],slower.velocity[2]))<1e-12,'final flick direction stays the same at lower speed');
 const weak=launchFromFlick(2,{dx:0,dy:.08,durationMs:140})!;
 assert.ok(Math.hypot(...weak.velocity)<3,'no automatic five metre per second base');
 const origin:[number,number,number]=[-53.1,2,-36];
 assert.deepEqual(launchFromFlick(2,{dx:0,dy:.3,durationMs:150},origin)!.origin,origin);
 assert.equal(launchFromFlick(2,{dx:0,dy:.3,durationMs:150},[NaN,2,-36]),null);
});


test('grabbed ball normal releases support drops and approachable low power with a lower maximum',()=>{
 const origin:[number,number,number]=[-53,2.4,-35];
 const drop=launchFromFlick(2,{dx:0,dy:0,durationMs:140},origin)!;
 assert.ok(drop);assert.deepEqual(drop.velocity,[0,0,0]);
 const ball=createBall(drop);stepBall(ball,.1);assert.ok(ball.position[1]<origin[1]);
 assert.equal(basketballFlickSpeed({dy:1,durationMs:40}),8.1);
 const speeds=[0,50,100,200,350,500,750,1000].map(px=>basketballFlickSpeed({dy:px*.14/(384*.65),durationMs:140}));
 assert.equal(speeds[0],0);assert.ok(speeds[2]<1.5);assert.ok(speeds[4]>4&&speeds[4]<5);
 assert.ok(speeds[6]>7.5&&speeds[6]<7.8);assert.ok(speeds[7]<8.1);
 assert.ok(speeds.every((v,i)=>i===0||v>speeds[i-1]));
});
