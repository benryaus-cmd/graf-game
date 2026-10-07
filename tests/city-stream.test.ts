import test from 'node:test';
import assert from 'node:assert/strict';
import { createCityBlockLayout } from '../src/game/cityBlockLayout';
import { wantedChunkKeys, distanceToChunk, keepChunk } from '../src/game/cityStreamPolicy';

test('layout retains the old seeded positions and dimensions rather than inventing a different skyline',()=>{
 const layout=createCityBlockLayout(0,0);let seed=0;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const tower=rnd()>.72?Math.floor(rnd()*4):-1;let i=0;
 for(const x of [-15.5,15.5])for(const z of [-15.5,15.5]){const expected=[x+(rnd()-.5)*1.1,z+(rnd()-.5)*1.1,10.8+rnd()*2.1,10.8+rnd()*2.1];const h=i===tower?32+rnd()*23:4.65;const b=layout.buildings[i++];assert.deepEqual([b.x,b.z,b.width,b.depth],expected);assert.equal(b.height,h);}
});
test('chunk policy uses bounds and retains a selected wall and boundary hysteresis',()=>{
 assert.equal(wantedChunkKeys(0,0).size,9);
 assert.equal(distanceToChunk(24,0,1,0),0);
 assert.ok(keepChunk({wanted:false,pinned:true,lastWanted:0,now:10000,retentionMs:0}));
 assert.ok(keepChunk({wanted:false,pinned:false,lastWanted:0,now:4900,retentionMs:5000}));
 assert.equal(keepChunk({wanted:false,pinned:false,lastWanted:0,now:5100,retentionMs:5000}),false);
});
