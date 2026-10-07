import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {SoloPaintHistory} from '../src/game/soloPaintHistory';
import {EraserGuide} from '../src/game/eraserGuide';
import {EmoteViewReturn} from '../src/game/emoteViewReturn';
import {drawPaintHead} from '../src/game/sprayHeads';
import {paintRadius} from '../src/game/worldPainting';
function fixture(){
 let pixels=new Uint8ClampedArray(8*8*4);const context={canvas:{width:8,height:8},getImageData:()=>({width:8,height:8,data:pixels.slice()}),putImageData:(image:ImageData)=>{pixels=image.data.slice();}};
 const layer={ensureFace:()=>context,textures:[{needsUpdate:false}]};const wall:any={mesh:new THREE.Mesh(),layers:[layer],createLayer(){throw Error('unused');},faceDimensions:[{width:4,height:4}]};
 const selection={wall,face:0,bounds:{minU:0,minV:0,maxU:1,maxV:1},started:true};const world:any={paintWorkspace:{selection},paintRevision:0,multiplayerActive:false};const views:any[]=[];const history=new SoloPaintHistory(world,v=>views.push(v));history.syncSelection();
 const hit:any={face:{materialIndex:0}};const settings:any={layerIndex:0,brushSize:2};
 return{history,world,wall,hit,settings,views,set:(n:number)=>{pixels[0]=n;},value:()=>pixels[0],stroke(n:number){history.begin(wall,hit,settings);pixels[0]=n;history.changed();history.end();}};
}
test('solo undo and redo restore exact before/after pixels and invalidate redo after a new gesture',()=>{const f=fixture();f.stroke(40);f.stroke(80);assert.equal(f.history.undo(),true);assert.equal(f.value(),40);assert.equal(f.history.redo(),true);assert.equal(f.value(),80);f.history.undo();f.stroke(120);assert.equal(f.history.redo(),false);f.history.undo();assert.equal(f.value(),40);});
test('solo history is bounded to two gestures and never crosses a session or canvas change',()=>{const f=fixture();f.stroke(40);f.stroke(80);f.stroke(120);f.history.undo();f.history.undo();assert.equal(f.value(),40);assert.equal(f.history.undo(),false);f.world.multiplayerActive=true;assert.equal(f.history.redo(),false);f.world.multiplayerActive=false;f.world.paintWorkspace.selection={...f.world.paintWorkspace.selection};f.history.syncSelection();assert.equal(f.history.redo(),false);});
test('history disables actions while a gesture is active and re-enables at release',()=>{const f=fixture();f.stroke(40);f.history.begin(f.wall,f.hit,f.settings);assert.equal(f.views.at(-1).canUndo,false);f.history.changed();f.history.end();assert.equal(f.views.at(-1).canUndo,true);});
test('eraser guide is only a white outline, follows world size and hides on release/disable',()=>{const scene=new THREE.Scene(),target=new EventTarget();const guide=new EraserGuide(scene,target);guide.setEnabled(true);guide.show({face:{normal:new THREE.Vector3(0,0,1)},point:new THREE.Vector3(1,2,3),object:new THREE.Mesh()} as unknown as THREE.Intersection,.12);const circle=scene.getObjectByName('eraser-outline') as THREE.LineLoop;assert.ok(circle instanceof THREE.LineLoop);assert.equal((circle.material as THREE.LineBasicMaterial).color.getHex(),0xffffff);assert.equal(circle.scale.x,.12);assert.ok(circle.layers.isEnabled(31));assert.equal(circle.visible,true);target.dispatchEvent(new Event('pointerup'));assert.equal(circle.visible,false);guide.setEnabled(false);guide.show({} as THREE.Intersection,.2);assert.equal(circle.visible,false);guide.dispose();assert.equal(scene.getObjectByName('eraser-outline'),undefined);});
test('first-person emote view returns two seconds after the most recent choice only',()=>{let now=0;let nextId=0;const timers=new Map<number,{at:number;callback:()=>void}>();const camera:string[]=[];const timer=new EmoteViewReturn((cb,ms)=>{const id=++nextId;timers.set(id,{at:now+ms,callback:cb});return id;},id=>{timers.delete(id);});timer.choose('first',v=>camera.push(v));assert.deepEqual(camera,['third']);now=1500;timer.choose('third',v=>camera.push(v));assert.equal(timers.size,1);assert.equal([...timers.values()][0].at,3500);const [id,entry]=[...timers.entries()][0];timers.delete(id);entry.callback();assert.equal(camera.at(-1),'first');timer.choose('third',v=>camera.push(v));assert.equal(timers.size,0,'third-person emotes do not schedule a first-person return');timer.cancel();assert.equal(timers.size,0);});
test('changing the selected canvas immediately before undo cannot restore the old canvas',()=>{const f=fixture();f.stroke(80);f.world.paintWorkspace.selection={...f.world.paintWorkspace.selection};assert.equal(f.history.undo(),false);assert.equal(f.value(),80);});

test('solo crop includes the maximum FAT dwell tail beyond the selected area', () => {
  const size = 256, pixels = new Uint8ClampedArray(size * size * 4);
  const context = {
    canvas: { width: size, height: size },
    getImageData(x: number, y: number, width: number, height: number) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < height; row++) data.set(pixels.subarray(((y + row) * size + x) * 4, ((y + row) * size + x + width) * 4), row * width * 4);
      return { width, height, data };
    },
    putImageData(image: ImageData, x: number, y: number) {
      for (let row = 0; row < image.height; row++) pixels.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), ((y + row) * size + x) * 4);
    },
  };
  const wall: any = { layers: [{ ensureFace: () => context, textures: [{}] }], faceDimensions: [{ width: 4, height: 4 }] };
  const world: any = { paintWorkspace: { selection: { wall, started: true, bounds: { minU: .45, maxU: .55, minV: .45, maxV: .55 } } }, paintRevision: 0, multiplayerActive: false };
  const history = new SoloPaintHistory(world, () => {}), settings: any = { layerIndex: 0, brushSize: .5 };
  history.begin(wall, { face: { materialIndex: 0 } } as any, settings);
  let tailY = 0;
  const recipe = { beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo(_x: number, y: number) { tailY = y; }, stroke() {} };
  drawPaintHead(recipe as unknown as CanvasRenderingContext2D, 0, 2.2, paintRadius(settings.brushSize), 'fat', 60);
  const index = (Math.floor(tailY * size / 4) * size + size / 2) * 4 + 3;
  pixels[index] = 255; history.changed(); history.end();
  assert.equal(history.undo(), true); assert.equal(pixels[index], 0, 'Undo restores the actual FAT tail endpoint');
  assert.equal(history.redo(), true); assert.equal(pixels[index], 255);
});
