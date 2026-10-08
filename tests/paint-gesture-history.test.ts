import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {SoloPaintHistory} from '../src/game/soloPaintHistory';
import {EraserGuide} from '../src/game/eraserGuide';
import {EmoteViewReturn} from '../src/game/emoteViewReturn';
test('solo gesture history never reads or allocates the live paint canvas, including after solo status changes', () => {
  let reads = 0, allocations = 0;
  const context = { canvas: { width: 2048, height: 2048 }, getImageData() { reads++; return { data: new Uint8ClampedArray(16 * 1024 * 1024) }; } };
  const wall: any = { layers: [{ ensureFace() { allocations++; return context; } }], faceDimensions: [{ width: 4, height: 4 }] };
  const world: any = { paintWorkspace: { selection: { wall, started: true, bounds: { minU: 0, maxU: 1, minV: 0, maxV: 1 } } }, paintRevision: 0, multiplayerActive: false };
  const views: any[] = [], history = new SoloPaintHistory(world, view => views.push(view));
  history.syncSelection(); history.setAllowed(true);
  for (let gesture = 0; gesture < 4; gesture++) {
    history.begin(wall, { face: { materialIndex: 0 } } as any, { brushSize: 2, layerIndex: 0 } as any);
    history.changed(); history.end();
  }
  assert.equal(reads, 0, 'drawing must not synchronously read the live canvas for Undo');
  assert.equal(allocations, 0, 'disabled history must not allocate a face or layer');
  assert.equal(history.undo(), false); assert.equal(history.redo(), false);
  assert.deepEqual(views.at(-1), { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, limit: 0 });
});
test('solo history remains unavailable across multiplayer, selection and reset changes', () => {
  const world: any = { multiplayerActive: true }, views: any[] = [];
  const history = new SoloPaintHistory(world, view => views.push(view));
  history.setAllowed(false); world.multiplayerActive = false; history.setAllowed(true);
  world.paintWorkspace = { selection: {} }; history.syncSelection(); history.reset();
  assert.equal(history.undo(), false); assert.equal(history.redo(), false);
  assert.equal(views.at(-1).canUndo, false); assert.equal(views.at(-1).canRedo, false);
});
test('eraser guide is only a white outline, follows world size and hides on release/disable',()=>{const scene=new THREE.Scene(),target=new EventTarget();const guide=new EraserGuide(scene,target);guide.setEnabled(true);guide.show({face:{normal:new THREE.Vector3(0,0,1)},point:new THREE.Vector3(1,2,3),object:new THREE.Mesh()} as unknown as THREE.Intersection,.12);const circle=scene.getObjectByName('eraser-outline') as THREE.LineLoop;assert.ok(circle instanceof THREE.LineLoop);assert.equal((circle.material as THREE.LineBasicMaterial).color.getHex(),0xffffff);assert.equal(circle.scale.x,.12);assert.ok(circle.layers.isEnabled(31));assert.equal(circle.visible,true);target.dispatchEvent(new Event('pointerup'));assert.equal(circle.visible,false);guide.setEnabled(false);guide.show({} as THREE.Intersection,.2);assert.equal(circle.visible,false);guide.dispose();assert.equal(scene.getObjectByName('eraser-outline'),undefined);});
test('first-person emote view returns two seconds after the most recent choice only',()=>{let now=0;let nextId=0;const timers=new Map<number,{at:number;callback:()=>void}>();const camera:string[]=[];const timer=new EmoteViewReturn((cb,ms)=>{const id=++nextId;timers.set(id,{at:now+ms,callback:cb});return id;},id=>{timers.delete(id);});timer.choose('first',v=>camera.push(v));assert.deepEqual(camera,['third']);now=1500;timer.choose('third',v=>camera.push(v));assert.equal(timers.size,1);assert.equal([...timers.values()][0].at,3500);const [id,entry]=[...timers.entries()][0];timers.delete(id);entry.callback();assert.equal(camera.at(-1),'first');timer.choose('third',v=>camera.push(v));assert.equal(timers.size,0,'third-person emotes do not schedule a first-person return');timer.cancel();assert.equal(timers.size,0);});
