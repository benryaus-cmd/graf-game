import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectPaintWorkspaceFace} from '../src/game/paintWorkspace';
import {setWorkspaceInvalid} from '../src/game/paintWorkspaceFeedback';
import {ReferenceGuide} from '../src/game/referenceGuide';
import type {PaintWall, WorldEngine} from '../src/game/worldTypes';

function selectedWall() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4,4,.1));
  const wall = {mesh,uvScales:Array(6).fill({u:1,v:1}),faceDimensions:Array(6).fill({width:4,height:4})} as PaintWall;
  const world = {scene:new THREE.Scene()} as WorldEngine;
  world.scene.add(mesh);
  const workspace=selectPaintWorkspaceFace(world,wall,4,{minU:.25,minV:.25,maxU:.75,maxV:.75});
  return {world, selection:workspace.selection!};
}

test('yellow selection edges and invalid fill stay above saved artwork with large server sequences', () => {
  const {selection}=selectedWall();
  const savedArtworkOrder=90+1_000_000_000;
  assert.ok(selection.preview.renderOrder>savedArtworkOrder);
  const ribbon=selection.preview.children[0] as THREE.Mesh;
  assert.ok(ribbon.renderOrder>selection.preview.renderOrder);
  setWorkspaceInvalid(selection,true);
  const fill=selection.preview.userData.invalidFill as THREE.Mesh;
  assert.ok(fill.renderOrder>savedArtworkOrder);
  assert.ok(fill.renderOrder<selection.preview.renderOrder);
  assert.equal((selection.preview.material as THREE.Material).depthTest,false);
});

test('reference front/back switch crosses both paint and saved artwork orders without changing either', () => {
  const {world,selection}=selectedWall();
  const old=globalThis.Image;
  globalThis.Image=class { src=''; } as unknown as typeof Image;
  try {
    const guide=new ReferenceGuide(world);
    const settings={url:'blob:test',name:'test',visible:true,moving:false,opacity:.4,scale:1,x:0,y:0,rotation:0,aboveArt:true};
    guide.set(settings);
    const mesh=world.scene.children.at(-1) as THREE.Mesh;
    assert.ok(mesh.renderOrder>90+1_000_000_000);
    assert.ok(mesh.renderOrder<selection.preview.renderOrder);
    assert.equal(mesh.material.depthWrite,false);
    assert.equal(mesh.material.depthTest,true);
    guide.set({...settings,aboveArt:false});
    assert.ok(mesh.renderOrder<3,'below the first active paint layer');
    assert.equal(mesh.material.depthTest,true);
    guide.dispose();
  } finally {globalThis.Image=old;}
});

test('hue selection can create purple from neutral colours and keep saturation for existing colours', async () => {
  const module=await import('../src/game/colorPicker');
  assert.equal(typeof module.colorAtHue,'function');
  for(const neutral of ['#000000','#ffffff','#888888']) {
    const color=module.colorAtHue(neutral,270);
    const hsv=module.hexToHsv(color);
    assert.ok(hsv.s>0 && hsv.v>0);
    assert.ok(Math.abs(hsv.h-270)<2);
  }
  assert.equal(module.colorAtHue('#ff0000',120),'#00ff00');
  assert.equal(module.colorAtHue('#ff0000',240),'#0000ff');
});

test('reference dragging starts only inside the visible image, accounting for rotation and offset', () => {
  const {world}=selectedWall(); const old=globalThis.Image;
  let image: {naturalWidth:number;naturalHeight:number;onload:()=>void};
  globalThis.Image=class { src=''; naturalWidth=1000; naturalHeight=500; onload=()=>{}; constructor(){image=this;} } as unknown as typeof Image;
  try {
    const guide=new ReferenceGuide(world);
    const settings={url:'blob:test',name:'test',visible:true,moving:true,opacity:.4,scale:1,x:.2,y:.1,rotation:90};
    guide.set(settings); image!.onload();
    assert.equal(guide.contains(new THREE.Vector2(.2,.1)),true);
    assert.equal(guide.contains(new THREE.Vector2(.2,.5)),true);
    assert.equal(guide.contains(new THREE.Vector2(.6,.1)),false);
    guide.set({...settings,visible:false});
    assert.equal(guide.contains(new THREE.Vector2(.2,.1)),false);
    guide.dispose();
  } finally {globalThis.Image=old;}
});
