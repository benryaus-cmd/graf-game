import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseRenderSettings, DEFAULT_RENDER_SETTINGS } from '../src/game/renderSettings';
import { PerformanceLog, copyRunReport } from '../src/game/performanceLog';

test('render settings reject corrupt storage values and keep sensible finite controls', () => {
  const result = normaliseRenderSettings({ renderScale: NaN, fogDensity: .8, horizonDistance: -20, liveStrokeDistance: 30, scenery: false });
  assert.equal(result.renderScale, DEFAULT_RENDER_SETTINGS.renderScale);
  assert.equal(result.fogDensity, .025);
  assert.equal(result.horizonDistance, 120);
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
test('copy reports contain the latest three completed runs and settings without fabricating missing runs', () => {
  const log = new PerformanceLog();
  for (let i=1;i<=4;i++){ log.start(`run-${i}`, DEFAULT_RENDER_SETTINGS, 0); log.stop(50); }
  const report = copyRunReport(log.runs);
  assert.ok(!report.includes('run-1'));
  assert.ok(report.includes('run-2')&&report.includes('run-4'));
  assert.ok(report.includes('liveStrokeDistance'));
  assert.ok(copyRunReport([]).includes('No completed'));
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
