import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseRenderSettings, DEFAULT_RENDER_SETTINGS } from '../src/game/renderSettings';
import { PerformanceLog, copyRunReport } from '../src/game/performanceLog';

test('render settings reject corrupt storage values and keep sensible finite controls', () => {
  const result = normaliseRenderSettings({ renderScale: NaN, fogDensity: .8, horizonDistance: -20, liveStrokeDistance: 30, scenery: false });
  assert.equal(result.renderScale, DEFAULT_RENDER_SETTINGS.renderScale);
  assert.equal(result.fogDensity, .2);
  assert.equal(result.horizonDistance, 48);
  assert.equal(result.liveStrokeDistance, 30);
  assert.equal(result.scenery, false);
});
test('recorded frame times exclude hidden intervals and retain real percentile and render counts', () => {
  const log = new PerformanceLog();
  log.start('walk', DEFAULT_RENDER_SETTINGS, 0);
  for (let i=1;i<=120;i++) log.frame(i*20, { calls: 200, triangles: 6000, textures: 4, geometries: 12, chunks: 9, queued: 0, cpuMs: 3 }, false);
  log.frame(10000, { calls: 200, triangles: 6000, textures: 4, geometries: 12, chunks: 9, queued: 0, cpuMs: 3 }, true);
  const run = log.stop(10000)!;
  assert.equal(run.frameMs.p95, 20);
  assert.equal(run.fps, 50);
  assert.equal(run.render.calls.max, 200);
  assert.equal(run.frames, 119);
  assert.ok(run.events.some(e=>e.message.includes('Background')));
});
test('copy reports contain only the latest run', () => {
  const log = new PerformanceLog();
  for (let i=1;i<=4;i++){ log.start(`run-${i}`, DEFAULT_RENDER_SETTINGS, 0); log.stop(50); }
  const report = copyRunReport(log.runs);
  assert.ok(!report.includes('run-1'));
  assert.ok(!report.includes('run-2')&&report.includes('run-4'));
  assert.ok(report.includes('liveStrokeDistance'));
  assert.ok(copyRunReport([]).includes('No completed'));
});

test('a checkpoint recovers an unfinished run without a stop or crash callback',()=>{
 const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
 const log=new PerformanceLog(storage);log.start('before crash',DEFAULT_RENDER_SETTINGS,0);
 for(let i=1;i<=25;i++)log.frame(i*20,{calls:10,triangles:100,textures:2,geometries:4,chunks:9,queued:0,cpuMs:1},false);
 log.settingsChanged({...DEFAULT_RENDER_SETTINGS,renderScale:.8},510);
 log.sample(550,{position:[48,1.7,16],view:'first-person',painting:false});
 assert.equal(log.checkpoint(600),true);
 const recovered=new PerformanceLog(storage);assert.equal(recovered.active,false);
 assert.equal(recovered.runs.length,1);assert.equal(recovered.runs[0].status,'interrupted');
 assert.equal(recovered.runs[0].currentSettings.renderScale,.8);assert.equal(recovered.runs[0].frames,24);
 assert.deepEqual(recovered.runs[0].samples[0].context.position,[48,1.7,16]);
 recovered.start('replacement',DEFAULT_RENDER_SETTINGS,700);assert.equal(new PerformanceLog(storage).runs[0].label,'replacement');
});

test('blank-scene baseline statistics are separated and stop restores the world phase',()=>{
 const log=new PerformanceLog();log.start('baseline',DEFAULT_RENDER_SETTINGS,0,{baselineSeconds:5});
 for(let i=1;i<=20;i++)log.frame(i*10,{calls:0,triangles:0,textures:2,geometries:4,chunks:9,queued:0,cpuMs:.1},false);
 log.advancePhase(5000);assert.equal(log.phase,'world');
 for(let i=1;i<=20;i++)log.frame(5000+i*20,{calls:100,triangles:300,textures:2,geometries:4,chunks:9,queued:0,cpuMs:2},false);
 const run=log.stop(5500)!;assert.equal(run.fps,50);assert.equal(run.phases.baseline.fps,100);assert.equal(run.render.calls.average,100);
 log.start('stop baseline',DEFAULT_RENDER_SETTINGS,6000,{baselineSeconds:5});log.stop(6100);assert.equal(log.phase,'world');
});

test('a blank render crossing the baseline deadline stays in baseline statistics',()=>{
 const log=new PerformanceLog();log.start('boundary',DEFAULT_RENDER_SETTINGS,0,{baselineSeconds:5});
 log.frame(4990,{calls:0,triangles:0,textures:2,geometries:4,chunks:9,queued:0,cpuMs:1},false);
 log.frame(5010,{calls:0,triangles:0,textures:2,geometries:4,chunks:9,queued:0,cpuMs:20},false);
 assert.equal(log.phase,'baseline');log.advancePhase(5011);
 log.frame(5020,{calls:100,triangles:300,textures:2,geometries:4,chunks:9,queued:0,cpuMs:2},false);
 assert.equal(log.stop(5030)!.render.calls.average,100);
});

test('long recordings compact time samples without losing their frame totals',()=>{
 const log=new PerformanceLog();log.start('long',DEFAULT_RENDER_SETTINGS,0);
 for(let i=1;i<=1500;i++){log.frame(i*500,{calls:10,triangles:100,textures:2,geometries:4,chunks:9,queued:0,cpuMs:1},false);log.sample(i*500,{position:[0,0,0],view:'first-person',painting:false});}
 const run=log.stop(750001)!;assert.ok(run.samples.length<=600);assert.equal(run.samples.reduce((sum,s)=>sum+s.frames,0),1499);
 assert.equal(run.samples[0].from,0);assert.equal(run.samples[run.samples.length-1].to,750000);
});

test('unavailable storage keeps the log usable and measured work preserves errors',()=>{
 const log=new PerformanceLog({getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem:()=>{}});
 log.start('quota',DEFAULT_RENDER_SETTINGS,0);assert.equal(log.checkpoint(20),false);
 assert.throws(()=>log.measure('chunk.dispose',()=>{throw Error('original failure');},'1:0'),/original failure/);
 assert.equal(log.stop(50)!.operations['chunk.dispose'].count,1);assert.ok(copyRunReport(log.runs).includes('quota'));
});

test('legacy run history is replaced with only its latest log on migration',()=>{
 const source=new PerformanceLog();source.start('oldest',DEFAULT_RENDER_SETTINGS,0);const old=source.stop(10)!;source.start('latest',DEFAULT_RENDER_SETTINGS,20);const latest=source.stop(30)!;
 const values=new Map([['graffciti.performance-runs.v1',JSON.stringify([old,latest])]]);
 const log=new PerformanceLog({getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}});
 assert.equal(log.runs[0].label,'latest');assert.equal(values.has('graffciti.performance-runs.v1'),false);
 assert.equal(JSON.parse(values.get('graffciti.performance-log.v2')!).label,'latest');
});

test('malformed persisted test reports cannot crash the developer panel', async()=>{
 const {readPerformanceRuns}=await import('../src/game/performanceLog');
 assert.deepEqual(readPerformanceRuns([{label:'bad',frameMs:{},render:{},settings:{}}]),[]);
 const log=new PerformanceLog();log.start('valid',DEFAULT_RENDER_SETTINGS,0);const run=log.stop(100)!;
 assert.equal(readPerformanceRuns([run]).length,1);
 assert.equal(readPerformanceRuns([{...run,fps:Infinity}]).length,0);
});

test('test environment is captured when a run starts',()=>{
 const log=new PerformanceLog();log.describeEnvironment=()=> '390x640 at ratio 1';
 log.start('phone',DEFAULT_RENDER_SETTINGS,0);
 log.describeEnvironment=()=> 'changed after start';
 const run=log.stop(500)!;
 assert.equal(run.environment,'390x640 at ratio 1');assert.ok(!Number.isNaN(Date.parse(run.startedAt)));
});
