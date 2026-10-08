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

function padFixture(rotated=false) {
  const f=fixture();
  (f.canvas as any).closest=()=>rotated ? {} : null;
  (f.canvas as any).style={setProperty:()=>{}};
  (f.canvas as any).querySelector=()=>null;
  return f;
}
test('flick pad completes one owned upward gesture in normalized portrait coordinates',()=>{
  const old=globalThis.window,oldDocument=globalThis.document;globalThis.window=new EventTarget() as any;globalThis.document=new EventTarget() as any;
  const f=padFixture(true),shots:any[]=[];
  const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g));
  try {
    // Portrait local up is screen left: local (0.5,0.75) -> (0.5,0.25).
    f.canvas.dispatchEvent(pointer('pointerdown',1,300,100));
    f.canvas.dispatchEvent(pointer('pointerdown',2,200,80));
    f.canvas.dispatchEvent(pointer('pointerup',2,100,80));
    assert.equal(shots.length,0);
    f.canvas.dispatchEvent(pointer('pointerup',1,100,100));
    assert.equal(shots.length,1);assert.equal(shots[0].dx,0);assert.equal(shots[0].dy,1);
    assert.equal(f.captured,null);
  } finally {stop();globalThis.window=old;globalThis.document=oldDocument;}
});
test('flick pad cancellation lost capture blur and teardown never shoot',()=>{
  const old=globalThis.window,oldDocument=globalThis.document;globalThis.window=new EventTarget() as any;globalThis.document=new EventTarget() as any;
  const f=padFixture(),shots:any[]=[];const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g));
  try {
    for (const type of ['pointercancel','lostpointercapture','blur']) {
      f.canvas.dispatchEvent(pointer('pointerdown',1,200,180));
      assert.equal(f.captured,1,'gesture owns capture until cancellation');
      (type==='blur' ? window : f.canvas).dispatchEvent(pointer(type,1,200,20));
      f.canvas.dispatchEvent(pointer('pointerup',1,200,20));
    }
    f.canvas.dispatchEvent(pointer('pointerdown',1,200,180));stop();
    f.canvas.dispatchEvent(pointer('pointerup',1,200,20));
    assert.equal(shots.length,0);assert.equal(f.captured,null);
  } finally {stop();globalThis.window=old;globalThis.document=oldDocument;}
});
test('flick pad rejects taps sideways and downward gestures',()=>{
  const old=globalThis.window,oldDocument=globalThis.document;globalThis.window=new EventTarget() as any;globalThis.document=new EventTarget() as any;
  const f=padFixture(),shots:any[]=[];const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g));
  try {
    for (const [x,y] of [[200,180],[350,170],[200,195]]) {
      f.canvas.dispatchEvent(pointer('pointerdown',1,200,180));
      assert.equal(f.captured,1);
      f.canvas.dispatchEvent(pointer('pointerup',1,x,y));
    }
    assert.equal(shots.length,0);
  } finally {stop();globalThis.window=old;globalThis.document=oldDocument;}
});

test('flick pad shows live release power and sideways aim before release and resets on cancel',t=>{
  const old=globalThis.window,oldDocument=globalThis.document;globalThis.window=new EventTarget() as any;globalThis.document=new EventTarget() as any;
  const f=padFixture(),values=new Map<string,string>(),label={textContent:''};
  (f.canvas as any).style={setProperty:(key:string,value:string)=>values.set(key,value)};
  (f.canvas as any).querySelector=()=>label;
  let now=1000;t.mock.method(performance,'now',()=>now);
  const shots:any[]=[];const stop=attachBasketballFlickPad(f.canvas,g=>shots.push(g));
  try {
    assert.equal(values.get('--basketball-power'),'0%');
    f.canvas.dispatchEvent(pointer('pointerdown',1,200,180));now+=450;
    f.canvas.dispatchEvent(pointer('pointermove',1,220,72));
    assert.equal(shots.length,0,'feedback does not shoot');
    assert.ok(Number.parseFloat(values.get('--basketball-power')!)>35);
    assert.ok(Math.abs(Number.parseFloat(values.get('--basketball-aim')!)-55)<1e-8);
    assert.match(label.textContent,/Power/);
    const value=values.get('--basketball-power');
    f.canvas.dispatchEvent(pointer('pointermove',2,300,20));assert.equal(values.get('--basketball-power'),value);
    f.canvas.dispatchEvent(pointer('pointercancel',1));
    assert.equal(values.get('--basketball-power'),'0%');assert.equal(values.get('--basketball-aim'),'50%');
    assert.match(label.textContent,/half-pad/);assert.equal(shots.length,0);
  } finally {stop();globalThis.window=old;globalThis.document=oldDocument;}
});

import * as basketballPhysics from '../src/game/basketballPhysics';
test('live flick power uses the identical launch speed without changing physics',()=>{
  assert.equal(typeof basketballPhysics.basketballFlickSpeed,'function');
  for(const gesture of [{dx:0,dy:.54,durationMs:450},{dx:.1,dy:.8,durationMs:120},{dx:-.2,dy:.2,durationMs:900}]) {
    const launch=basketballPhysics.launchFromFlick(2,gesture)!;
    assert.ok(Math.abs(Math.hypot(...launch.velocity)-basketballPhysics.basketballFlickSpeed(gesture))<1e-10);
  }
});

import { BASKETBALL_COURT } from '../src/game/basketballCourt';
test('horizontal flick aims toward the camera right or left from all five marks',()=>{
  for(const spot of BASKETBALL_COURT.spots) {
    const yaw=Math.atan2(spot.position[0]-BASKETBALL_COURT.rim.center[0],spot.position[2]-BASKETBALL_COURT.rim.center[2]);
    const cameraRight=[Math.cos(yaw),-Math.sin(yaw)];
    for(const dx of [-.1,.1]) {
      const launch=basketballPhysics.launchFromFlick(spot.id,{dx,dy:.54,durationMs:450})!;
      const lateral=launch.velocity[0]*cameraRight[0]+launch.velocity[2]*cameraRight[1];
      assert.ok(lateral*dx>0,`spot ${spot.id} dx ${dx} must aim in the flick direction`);
    }
  }
});
