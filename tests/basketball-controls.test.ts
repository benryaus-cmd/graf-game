import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { attachWorldControls } from '../src/game/worldControls';
import { attachKeyboardControls } from '../src/game/worldKeyboard';
import { advanceWorld, jumpWorld } from '../src/game/worldMovement';

function fixture() {
  const canvas = new EventTarget() as HTMLCanvasElement;
  let captured: number | null = null;
  canvas.getBoundingClientRect = () => ({left:0,top:0,width:400,height:200}) as DOMRect;
  canvas.setPointerCapture = id => { captured = id; };
  canvas.hasPointerCapture = id => captured === id;
  canvas.releasePointerCapture = () => { captured = null; };
  const world = {
    renderer: { domElement: canvas, setAnimationLoop: () => {} },
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), mapCamera: new THREE.OrthographicCamera(),
    cameraMode: 'first', playerPosition: new THREE.Vector3(0,1.72,0), playerYaw: 0, playerPitch: 0,
    walls: [], paintRevision:0, velocityY:0,groundLevel:0, walkSurfaces:[],staircases:[],colliders:[],
    equippedOutfit:'',activityLocked:true,updateChunks:()=>{},playerAvatar:new THREE.Group(),skyDome:new THREE.Group(),bots:[],bunnyGroup:new THREE.Group(),
  } as any;
  world.playerAvatar.userData.parts={legs:[],arms:[],headGroup:new THREE.Group(),questionMarks:new THREE.Group(),sleepyZs:new THREE.Group(),tears:[]};
  world.bunnyGroup.userData={legs:[],arms:[]};
  return {world,canvas,get captured(){return captured;}};
}
function pointer(type:string,id=1,x=100,y=100) {
  const event = new Event(type);
  Object.assign(event,{pointerId:id,pointerType:'mouse',isPrimary:true,button:0,clientX:x,clientY:y});
  return event;
}
const settings = { current: {paintMode:false,movement:{x:1,y:1},lookSensitivity:0.01,jumpPower:7,moveSpeed:4} } as any;

test('basketball ownership blocks canvas picking and drag-look without clearing a paint draft', () => {
  const old = globalThis.window; globalThis.window = new EventTarget() as any;
  const f=fixture(); let picks=0;
  const draft={active:false,selection:{started:true,hasPaint:true}};
  f.world.paintWorkspace=draft; f.world.onPlayerPick=()=>{picks++;return false;};
  const stop=attachWorldControls(f.world,settings,()=>{},()=>{}, {current:null},()=>{},()=>{});
  try {
    f.canvas.dispatchEvent(pointer('pointerdown'));
    f.canvas.dispatchEvent(pointer('pointermove',1,200,150));
    assert.equal(picks,0);
    assert.equal(f.captured,null);
    assert.equal(f.world.playerYaw,0);
    assert.equal(f.world.paintWorkspace,draft);
    f.world.activityLocked=false;
    f.canvas.dispatchEvent(pointer('pointerdown'));
    f.canvas.dispatchEvent(pointer('pointermove',1,200,150));
    assert.notEqual(f.world.playerYaw,0,'Leave restores ordinary drag look');
    f.canvas.dispatchEvent(pointer('pointerup'));
  } finally { f.world.paintWorkspace=undefined;stop();globalThis.window=old; }
});

test('basketball ownership blocks keyboard movement keys and space jump', () => {
  const oldWindow=globalThis.window,oldElement=globalThis.HTMLElement;
  globalThis.window=new EventTarget() as any;globalThis.HTMLElement=class {} as any;
  const f=fixture(),keys=new Set<string>();const stop=attachKeyboardControls(f.world,settings,keys);
  try {
    const event=new Event('keydown');Object.assign(event,{code:'Space'});window.dispatchEvent(event);
    assert.equal(keys.size,0);assert.equal(f.world.velocityY,0);
    f.world.activityLocked=false;window.dispatchEvent(event);
    assert.equal(f.world.velocityY,7);
  } finally {stop();globalThis.window=oldWindow;globalThis.HTMLElement=oldElement;}
});

test('basketball ownership blocks direct joystick movement and touch jump', () => {
  const f=fixture(),before=f.world.playerPosition.clone();
  advanceWorld(f.world,0.04,settings.current,new Set(['KeyW']));
  jumpWorld(f.world,7);
  assert.deepEqual(f.world.playerPosition,before);assert.equal(f.world.velocityY,0);
});

import { attachBasketballFlickPad } from '../src/components/BasketballControls';
import type { BasketballScreenPoint } from '../src/game/basketballGesture';

function padFixture(rotated=false) {
  const f=fixture();
  f.canvas.getBoundingClientRect=()=>({left:0,top:0,width:rotated?606:384,height:rotated?384:606}) as DOMRect;
  (f.canvas as any).closest=(selector:string)=>selector==='.game-portrait' && rotated ? {} : null;
  (f.canvas as any).style={setProperty:()=>{}};
  (f.canvas as any).classList={add:()=>{},remove:()=>{}};
  (f.canvas as any).querySelector=()=>null;
  return f;
}
function logicalPointer(type:string,x:number,y:number,rotated=false,id=1) {
  return pointer(type,id,rotated?y*606:x*384,rotated?(1-x)*384:y*606);
}
function globals() {
  const old=globalThis.window,oldDocument=globalThis.document;
  globalThis.window=new EventTarget() as any;globalThis.document=new EventTarget() as any;
  return ()=>{globalThis.window=old;globalThis.document=oldDocument;};
}
const target={x:.4,y:.75,radius:.09};
test('only the visible ball starts a grab; it follows finger with original grab offset',t=>{
  const restore=globals(),f=padFixture(),shots:any[]=[],positions:(BasketballScreenPoint|null)[]=[];
  let now=1000;t.mock.method(performance,'now',()=>now);
  const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g),{target:()=>target,move:p=>positions.push(p)});
  try {
    f.canvas.dispatchEvent(logicalPointer('pointerdown',.8,.3));assert.equal(f.captured,null);
    f.canvas.dispatchEvent(logicalPointer('pointerdown',.42,.75));assert.equal(f.captured,1);
    now+=500;f.canvas.dispatchEvent(logicalPointer('pointermove',.6,.9));
    assert.ok(Math.abs(positions.at(-1)!.x-.58)<1e-10);assert.ok(Math.abs(positions.at(-1)!.y-.9)<1e-10);
    assert.equal(shots.length,0);now+=100;
    f.canvas.dispatchEvent(logicalPointer('pointerup',.6,.9));assert.equal(shots.length,1);assert.equal(positions.at(-1),null);
  } finally {stop();restore();}
});
test('native and rotated ball grabs produce identical final flicks after a long preparation',t=>{
  const restore=globals(),shots:any[]=[],releases:any[]=[];let now=0;t.mock.method(performance,'now',()=>now);
  try {
    for(const rotated of [false,true]) {
      const f=padFixture(rotated);let position:BasketballScreenPoint|null=null;
      const stop=attachBasketballFlickPad(f.canvas,g=>{shots.push(g);releases.push(position);},{target:()=>target,move:p=>{position=p;}});
      f.canvas.dispatchEvent(logicalPointer('pointerdown',.4,.75,rotated));
      now+=500;f.canvas.dispatchEvent(logicalPointer('pointermove',.6,.85,rotated));
      now+=2500;f.canvas.dispatchEvent(logicalPointer('pointermove',.6,.85,rotated));
      for(let i=1;i<=6;i++) {now+=50;f.canvas.dispatchEvent(logicalPointer('pointermove',.6,.85-i*25/606,rotated));}
      f.canvas.dispatchEvent(logicalPointer('pointerup',.6,.85-150/606,rotated));
      assert.equal(position,null,'return home follows the release');stop();now+=1000;
    }
    assert.equal(shots.length,2);assert.ok(Math.abs(shots[0].dy-shots[1].dy)<1e-10);assert.ok(Math.abs(shots[0].dx-shots[1].dx)<1e-10);
    assert.equal(shots[0].durationMs,140);assert.ok(Math.abs(releases[0].y-(.85-150/606))<1e-10);
  } finally {restore();}
});
test('every normal release after grabbing throws exactly once, including weak and static lifts',t=>{
  const restore=globals(),f=padFixture(),shots:any[]=[];let now=0;t.mock.method(performance,'now',()=>now);
  const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g),{target:()=>target,move:()=>{}});
  try {
    for(const [x,y,delay] of [[.4,.75,0],[.4,.72,0],[.8,.7,0],[.4,.9,0],[.4,.3,100]]) {
      f.canvas.dispatchEvent(logicalPointer('pointerdown',.4,.75));now+=100;
      f.canvas.dispatchEvent(logicalPointer('pointermove',x,y));now+=delay;
      f.canvas.dispatchEvent(logicalPointer('pointerup',x,y));now+=1000;
    }
    assert.equal(shots.length,5);
    assert.equal(shots[0].dy,0);assert.equal(shots[4].dy,0);
    f.canvas.dispatchEvent(logicalPointer('pointerup',.4,.3));assert.equal(shots.length,5);
  } finally {stop();restore();}
});
test('UI targets, secondary pointers and nonexistent balls cannot start grabs',()=>{
  const restore=globals(),f=padFixture(),shots:any[]=[];let visible=true;
  const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g),{target:()=>visible?target:null,move:()=>{}});
  try {
    const ui=logicalPointer('pointerdown',.4,.75);Object.defineProperty(ui,'target',{value:{closest:()=>({})}});
    f.canvas.dispatchEvent(ui);assert.equal(f.captured,null);
    const secondary=logicalPointer('pointerdown',.4,.75);Object.assign(secondary,{pointerType:'touch',isPrimary:false});
    f.canvas.dispatchEvent(secondary);assert.equal(f.captured,null);
    visible=false;f.canvas.dispatchEvent(logicalPointer('pointerdown',.4,.75));assert.equal(f.captured,null);assert.equal(shots.length,0);
  } finally {stop();restore();}
});
test('pointer cancellation, capture loss, blur, page hiding and teardown return ball home without shooting',()=>{
  const restore=globals(),f=padFixture(),shots:any[]=[],positions:(BasketballScreenPoint|null)[]=[];
  const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g),{target:()=>target,move:p=>positions.push(p)});
  try {
    for(const type of ['pointercancel','lostpointercapture','blur','visibilitychange']) {
      Object.assign(document,{visibilityState:'visible'});
      f.canvas.dispatchEvent(logicalPointer('pointerdown',.4,.75));assert.equal(f.captured,1);
      if(type==='visibilitychange') {Object.assign(document,{visibilityState:'hidden'});document.dispatchEvent(new Event(type));}
      else (type==='blur'?window:f.canvas).dispatchEvent(pointer(type));
      assert.equal(f.captured,null);assert.equal(positions.at(-1),null);
      f.canvas.dispatchEvent(logicalPointer('pointerup',.4,.3));
    }
    f.canvas.dispatchEvent(logicalPointer('pointerdown',.4,.75));stop();assert.equal(f.captured,null);assert.equal(positions.at(-1),null);assert.equal(shots.length,0);
  } finally {stop();restore();}
});
test('second pointer cannot move or release the owned ball; preview shows velocity without shooting',t=>{
  const restore=globals(),f=padFixture(),shots:any[]=[],positions:any[]=[],values=new Map<string,string>();
  let now=0;t.mock.method(performance,'now',()=>now);
  (f.canvas as any).style={setProperty:(k:string,v:string)=>values.set(k,v)};
  const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g),{target:()=>target,move:p=>positions.push(p)});
  try {
    f.canvas.dispatchEvent(logicalPointer('pointerdown',.4,.75));now+=50;
    f.canvas.dispatchEvent(logicalPointer('pointermove',.4,.7));
    assert.ok(Number.parseFloat(values.get('--basketball-power')!)>0);const count=positions.length;
    f.canvas.dispatchEvent(logicalPointer('pointermove',.4,.5,false,2));
    f.canvas.dispatchEvent(logicalPointer('pointerup',.4,.3,false,2));assert.equal(positions.length,count);assert.equal(f.captured,1);assert.equal(shots.length,0);
    f.canvas.dispatchEvent(pointer('pointercancel'));assert.equal(values.get('--basketball-power'),'0%');
  } finally {stop();restore();}
});

test('holding the grabbed ball clears recent velocity feedback without storing a charged shot',t=>{
  const restore=globals(),f=padFixture(),values=new Map<string,string>(),label={textContent:''};
  let now=0;t.mock.method(performance,'now',()=>now);t.mock.timers.enable({apis:['setTimeout']});
  (f.canvas as any).style={setProperty:(k:string,v:string)=>values.set(k,v)};(f.canvas as any).querySelector=()=>label;
  const shots:any[]=[];const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g),{target:()=>target,move:()=>{}});
  try {
    f.canvas.dispatchEvent(logicalPointer('pointerdown',.4,.75));now=100;
    f.canvas.dispatchEvent(logicalPointer('pointermove',.4,.5));assert.ok(Number.parseFloat(values.get('--basketball-power')!)>0);
    now+=81;t.mock.timers.tick(81);assert.equal(values.get('--basketball-power'),'0%');assert.match(label.textContent,/prepare/);
    f.canvas.dispatchEvent(logicalPointer('pointerup',.4,.5));assert.equal(shots.length,1);assert.equal(shots[0].dy,0);
  } finally {stop();restore();}
});


import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BasketballControls } from '../src/components/BasketballControls';
import type { BasketballSyncView } from '../src/multiplayer/basketballSync';
import { CourtSession } from '../src/game/basketballSession';
const controlView = { nearby: true, active: false, spotId: null, attempts: 0, makes: 0, streak: 0, recentResult: null };
function renderControls(shared?: BasketballSyncView, active = false) {
  return renderToStaticMarkup(createElement(BasketballControls, {
    view: { ...controlView, active, spotId: active ? 3 : null }, shared, exploring: true, paused: false,
    onEnter: () => {}, onLeave: () => {}, onSpot: () => {}, onShoot: () => {}, onBallTarget: () => null, onBallMove: () => {},
  }));
}
test('HORSE controls require server support, a peer and an unused mark', () => {
  const server = new CourtSession({ roomId: 'morning-quarter-v1', mapId: 'map2', courtId: 'map2-basketball' });
  server.join('me', 0, 0); server.join('peer', 1, 0);
  const court = server.snapshot();
  const shared = { ...sharedView, entered: true, ownSeat: court.seats[0], court };
  assert.doesNotMatch(renderControls(shared, true), /CHALLENGE TO HORSE|ACCEPT HORSE/);
  const enabled = { ...shared, horseAvailable: true };
  assert.match(renderControls(enabled, true), /CHALLENGE TO HORSE/);
  assert.match(renderControls(enabled, true), /value="peer"/);
  for (let i = 2; i < 5; i++) server.join('p' + i, server.snapshot().revision, 0);
  assert.match(renderControls({ ...enabled, court: server.snapshot() }, true), /Need an unused shooting mark/);
});
test('invited player sees accept and authoritative match letters turn and winner are displayed', () => {
  const server = new CourtSession({ roomId: 'morning-quarter-v1', mapId: 'map2', courtId: 'map2-basketball' });
  server.join('me', 0, 0); server.join('peer', 1, 0); server.inviteHorse('me', 'peer', 4, 2, 0);
  let court = server.snapshot();
  const shared = { ...sharedView, entered: true, horseAvailable: true, ownSeat: court.seats[1], court };
  assert.match(renderControls(shared, true), /ACCEPT HORSE/);
  server.acceptHorse('peer', court.revision, 0); court = server.snapshot();
  const active = { ...shared, court: { ...court, horse: { ...court.horse!, phase: 'match' as const, occupantId: 'peer', letters: { me: 'HO', peer: 'H' } } } };
  assert.match(renderControls(active, true), /MATCH/); assert.match(renderControls(active, true), /Your turn/);
  assert.match(renderControls(active, true), /HO/);
  assert.match(renderControls({ ...active, court: { ...active.court, horse: { ...active.court.horse, phase: 'ended', winnerId: 'peer', occupantId: null } } }, true), /Winner: You/);
});
const sharedView: BasketballSyncView = { connected: true, available: true, entered: false, ownSeat: null, pendingShotId: null, court: null, notice: null, horseAvailable: false, horsePending: false, shootingSpotId: null };
test('shared controls require admitted capability while unsupported town retains solo practice', () => {
  assert.match(renderControls(), /PLAY BASKETBALL/);
  const unavailable = renderControls({ ...sharedView, available: false });
  assert.match(unavailable, /SOLO PRACTICE/);
  assert.doesNotMatch(unavailable, /JOIN SHARED COURT|basketball-screen/);
  const activePractice = renderControls({ ...sharedView, available: false }, true);
  assert.equal((activePractice.match(/aria-label="Spot/g) ?? []).length, 5);
  assert.doesNotMatch(activePractice, /disabled=""|Shared court/);
  assert.match(activePractice, /basketball-screen/);
  assert.match(renderControls(sharedView), /JOIN SHARED COURT/);
  const waiting = renderControls({ ...sharedView, entered: true });
  assert.match(waiting, /Waiting for court spot/);
  assert.match(waiting, /Cancel/);
  assert.doesNotMatch(waiting, /basketball-screen/);
  assert.match(renderControls({ ...sharedView, notice: 'full' }), /Court: full/);
});
test('shared assigned spots stay disabled and pending authority status leaves solo five spots usable', () => {
  const shared = renderControls({ ...sharedView, entered: true, pendingShotId: 's4-1', ownSeat: { playerId: 'me', spotId: 3, epoch: 4, sequence: 0, attempts: 0, makes: 0, readyAt: 0 } }, true);
  assert.equal((shared.match(/disabled=""/g) ?? []).length, 5);
  assert.match(shared, /Server assigned shooting spot/);
  assert.match(shared, /Waiting for court/);
  const solo = renderControls(undefined, true);
  assert.equal((solo.match(/aria-label="Spot/g) ?? []).length, 5);
  assert.doesNotMatch(solo, /disabled=""/);
});
