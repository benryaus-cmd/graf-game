import test from 'node:test';
import assert from 'node:assert/strict';
import { PaintSync } from '../src/multiplayer/paintSync';
import { PieceSync } from '../src/multiplayer/pieceSync';
import { ArtworkSync } from '../src/multiplayer/artworkSync';
import { encodeSurface } from '../src/multiplayer/surfaces';
const stroke=(id:string)=>({strokeId:id,pieceId:'piece',surfaceId:encodeSurface('ss1:0:0:wall',0,0),colour:'#123456',tool:'marker',brushSize:1,points:[{x:1,y:1,z:1,pressure:1}],sequence:1});
test('spatial stroke unload reloads the same ID; authoritative rejection stays rejected until explicit redo',()=>{
  const sync=new PaintSync({send:()=>true,draw(){},reset(){}});
  sync.accept({type:'stroke_begin',stroke:stroke('gesture.0')});
  assert.equal(sync.unloadStrokeIds(['gesture.0']).length,1);assert.equal(sync.strokes.size,0);
  assert.equal(sync.upsertStrokes([stroke('gesture.0')]).length,1);assert.equal(sync.strokes.size,1);
  sync.removeStrokeIds(['gesture.0']);sync.upsertStrokes([stroke('gesture.0')]);assert.equal(sync.strokes.size,0);
  sync.restoreStrokes([stroke('gesture.0')]);assert.equal(sync.strokes.size,1);
  sync.rejectPiece('piece');sync.restoreStrokes([stroke('gesture.0')]);assert.equal(sync.strokes.size,0,'redo cannot resurrect deleted pieces');
});
test('spatial unload and upsert cannot erase immediate active or unconfirmed local points',()=>{
  const sync=new PaintSync({send:()=>true,draw(){},reset(){}});
  const local=sync.sample({surfaceId:stroke('x').surfaceId,colour:'#123456',tool:'marker',brushSize:1,pieceId:'piece',point:{x:1,y:1,z:1,pressure:1}},false).stroke;
  sync.sample({surfaceId:local.surfaceId,colour:'#123456',tool:'marker',brushSize:1,pieceId:'piece',point:{x:2,y:1,z:1,pressure:1}},true);
  sync.unloadStrokeIds([local.strokeId]);assert.equal(sync.strokes.get(local.strokeId)?.points.length,2);
  sync.upsertStrokes([{...local,points:[local.points[0]],sequence:2}]);assert.equal(sync.strokes.get(local.strokeId)?.points.length,2);
  sync.end();sync.upsertStrokes([{...local,sequence:3}]);sync.unloadStrokeIds([local.strokeId]);assert.equal(sync.strokes.has(local.strokeId),false,'confirmed ended local paint can unload');
});
test('piece streaming updates membership once without permanent stroke-removal notification',()=>{
  const removed:unknown[]=[];let changes=0;
  const sync=new PieceSync(()=>true,(_pieces,ids)=>{changes++;removed.push(ids);});
  const piece={pieceId:'piece',anchor:[1,1,1],bounds:{min:[0,0,0],max:[2,2,2]},strokeIds:['gesture.0']};
  sync.applySpatial([piece],[]);sync.applySpatial([],['piece']);sync.applySpatial([piece],[]);
  assert.equal(sync.pieces.has('piece'),true);assert.equal(changes,3);assert.ok(removed.every(ids=>ids===undefined));
});
test('image streaming permits re-upsert and never retains unloaded render records',()=>{
  const old=globalThis.document;globalThis.document={getElementById:()=>null} as unknown as Document;
  const sync=new ArtworkSync(()=>true,()=>{});
  const art={id:'art',assetRef:'https://example.test/art.png',surfaceId:stroke('x').surfaceId,position:[1,1,1],quaternion:[0,0,0,1],width:2,height:1};
  try{sync.upsert([art]);assert.equal(sync.entries().length,1);sync.unloadArtwork('art');assert.equal(sync.entries().length,0);sync.upsert([art]);assert.equal(sync.entries().length,1);}finally{sync.clear();globalThis.document=old;}
});
