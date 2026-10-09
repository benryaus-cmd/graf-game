import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { advanceWorld, jumpWorld } from '../src/game/worldMovement';
import { attachKeyboardControls } from '../src/game/worldKeyboard';
import { attachWorldControls } from '../src/game/worldControls';
import { createPlayerAvatar } from '../src/game/playerAvatar';
import type { LiveSettings, WorldEngine } from '../src/game/worldTypes';

function setup() {
 const scene = new THREE.Scene(), bunnyGroup = new THREE.Group();
 bunnyGroup.userData.legs = []; bunnyGroup.userData.arms = [];
 const world = { scene, playerPosition: new THREE.Vector3(0, 1.72, 0), playerYaw: 0, playerPitch: 0,
  playerAvatar: createPlayerAvatar(scene), groundLevel: 0, walkSurfaces: [], staircases: [], colliders: [],
  updateChunks: () => {}, velocityY: 0, equippedOutfit: 'street', abilityActive: false,
  bunnyGroup, bots: [], botsEnabled: false, cameraMode: 'third', camera: new THREE.PerspectiveCamera(),
  mapCamera: new THREE.OrthographicCamera(), skyDome: new THREE.Group(), walls: [], paintRevision: 0,
 } as unknown as WorldEngine;
 const settings = { paused: true, movement: { x: 1, y: 1 }, moveSpeed: 5, jumpPower: 6,
  lookSensitivity: .01, lookInput: { x: 1, y: 1 }, paintMode: false,
 } as LiveSettings;
 return { world, settings };
}

test('paused modal freezes held keyboard and joystick movement while gravity and third person preview continue', () => {
 const {world, settings} = setup(); world.playerPosition.y = 3; world.velocityY = -2;
 const keys = new Set(['KeyW', 'KeyD']); advanceWorld(world, .05, settings, keys);
 assert.equal(world.playerPosition.x, 0); assert.equal(world.playerPosition.z, 0);
 assert.ok(world.playerPosition.y < 3); assert.equal(world.playerAvatar.visible, true);
 assert.equal(world.camera.position.z, 5.6); assert.ok(world.playerAvatar.userData.elapsed > 0);
 assert.equal(keys.size, 0, 'held keys must not resume when the sheet closes');
 settings.paused = false; settings.movement = {x:0,y:0}; advanceWorld(world,.05,settings,keys);
 assert.equal(world.playerPosition.z,0);
});

test('normal local jump and falling animate airborne legs until grounded', () => {
 const {world,settings}=setup(); settings.paused=false; settings.movement={x:0,y:0};
 jumpWorld(world,6); advanceWorld(world,.05,settings,new Set());
 assert.equal(world.playerAvatar.userData.parts.legs[0].rotation.x,-.3);
 world.velocityY=-1; advanceWorld(world,.05,settings,new Set());
 assert.equal(world.playerAvatar.userData.parts.legs[0].rotation.x,-.3);
 world.playerPosition.y=1.72;world.velocityY=0; advanceWorld(world,.05,settings,new Set());
 assert.equal(Math.abs(world.playerAvatar.userData.parts.legs[0].rotation.x),0);
});

function browser<T>(run: (windowTarget: EventTarget) => T): T {
 const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),oldElement=Object.getOwnPropertyDescriptor(globalThis,'HTMLElement');
 const target=new EventTarget();Object.defineProperty(globalThis,'window',{value:target,configurable:true});
 Object.defineProperty(globalThis,'HTMLElement',{value:class {},configurable:true});
 try{return run(target);}finally{if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');if(oldElement)Object.defineProperty(globalThis,'HTMLElement',oldElement);else Reflect.deleteProperty(globalThis,'HTMLElement');}
}
function event(type:string, fields:Record<string,unknown>){const e=new Event(type);Object.assign(e,fields);return e;}

test('paused keyboard rejects movement and jump and clears previously held keys', () => browser(target=>{
 const {world,settings}=setup(); const keys=new Set(['KeyW']);const stop=attachKeyboardControls(world,{current:settings},keys);
 try {target.dispatchEvent(event('keydown',{code:'Space'}));assert.equal(world.velocityY,0);assert.equal(keys.size,0);
 target.dispatchEvent(event('keydown',{code:'KeyD'}));assert.equal(keys.size,0);
 settings.paused=false;target.dispatchEvent(event('keydown',{code:'KeyD'}));assert.equal(keys.has('KeyD'),true);
 }finally{stop();}
}));

test('paused world pointer rejects picking and dragging an existing camera gesture', () => browser(()=>{
 const {world,settings}=setup();const canvas=new EventTarget();let picks=0;
 Object.assign(canvas,{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),hasPointerCapture:()=>false,setPointerCapture:()=>{},releasePointerCapture:()=>{}});
 world.renderer={domElement:canvas,setAnimationLoop:()=>{}} as unknown as THREE.WebGLRenderer;
 world.onPlayerPick=()=>{picks++;return false;};world.onPaintEnd=()=>{};
 const stop=attachWorldControls(world,{current:settings},()=>{},()=>{},{current:null},()=>{},()=>{});
 const pointer={pointerId:1,pointerType:'mouse',isPrimary:true,button:0,clientX:50,clientY:50};
 try{canvas.dispatchEvent(event('pointerdown',pointer));assert.equal(picks,0);
 settings.paused=false;canvas.dispatchEvent(event('pointerdown',pointer));assert.equal(picks,1);
 settings.paused=true;canvas.dispatchEvent(event('pointermove',{...pointer,clientX:150}));assert.equal(world.playerYaw,0);
 }finally{stop();}
}));
