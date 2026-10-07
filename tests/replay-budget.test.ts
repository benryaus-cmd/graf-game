import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPaintWall } from '../src/game/architectureWalls';
import { PaintReplay, renderNetworkPoint } from '../src/multiplayer/paintReplay';
import type { PaintWall } from '../src/game/worldTypes';
import type { SharedStroke, StrokePoint } from '../src/multiplayer/protocol';

function replayHarness() {
  const previousDocument = globalThis.document;
  const previousPerformance = globalThis.performance;
  const canvases: any[] = [];
  let clock = 0;
  let pointCost = 0;
  globalThis.performance = { now: () => clock } as Performance;
  globalThis.document = { createElement() {
    const canvas: any = { width: 64, height: 64 };
    const context: any = {
      canvas, marks: [] as string[], clearCount: 0, globalAlpha: 1,
      save() {}, restore() {}, setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
      fill() { this.marks.push(this.fillStyle); clock += pointCost; },
      stroke() { this.marks.push(this.strokeStyle); clock += pointCost; },
      fillRect() { this.marks.push(this.fillStyle); clock += pointCost; },
      clearRect() { this.marks = []; this.clearCount++; },
      drawImage(source: any) { this.marks.push(...source.getContext('2d').marks); },
    };
    canvas.getContext = () => context;
    canvases.push(canvas);
    return canvas;
  } } as unknown as Document;
  const group = new THREE.Group();
  const wall = createPaintWall(group, 0, 0, 2, 2, .1, new THREE.MeshStandardMaterial(), 0, 64).wall;
  wall.surfaceId = 'ss1:0:0:replay-budget'; group.updateMatrixWorld(true);
  const context = wall.layers[0].ensureFace(4)! as any;
  return {
    wall, context, canvases,
    set pointCost(value: number) { pointCost = value; },
    get marks() { return canvases.reduce((total, canvas) => total + canvas.getContext('2d').marks.length, 0); },
    reset() { globalThis.document = previousDocument; globalThis.performance = previousPerformance; },
  };
}

const point = (): StrokePoint => ({ x: 0, y: 1, z: .05, pressure: 1 });
const stroke = (id: string, count: number, colour = '#ff0000'): SharedStroke => ({ strokeId: id, surfaceId: 'ss1:0:0:replay-budget/f4/l0', colour, tool: 'spray', brushSize: 1, points: Array.from({ length: count }, point) });
const finish = (replay: PaintReplay, wall: PaintWall) => {
  for (let frame = 0; frame < 500 && replay.isRebuilding(wall); frame++) replay.update();
  assert.equal(replay.isRebuilding(wall), false, 'wall reconstruction eventually commits');
};

test('enqueue defers every sample until a budgeted frame instead of preprocessing a large stroke', () => {
  const h = replayHarness();
  try {
    const saved = stroke('large', 1200);
    let pointReads = 0;
    const points = new Proxy(saved.points, { get(target, property, receiver) { if (/^\d+$/.test(String(property))) pointReads++; return Reflect.get(target, property, receiver); } });
    const replay = new PaintReplay(() => [true]); replay.rebuild(h.wall);
    replay.enqueue(h.wall, saved, points, null);
    assert.equal(pointReads, 0, 'queueing must not scan point coordinates or compute dwell');
    replay.update();
    assert.ok(pointReads > 0); assert.ok(h.marks <= 256);
    assert.equal(h.context.clearCount, 0, 'visible local pixels remain until staging is ready');
    finish(replay, h.wall);
    assert.equal(h.context.marks.length, 1200);
  } finally { h.reset(); }
});

test('whole-wall rebuild lazily visits history and respects the global point budget across many strokes', () => {
  const h = replayHarness();
  try {
    const saved = Array.from({ length: 1000 }, (_, index) => stroke(`history-${index}`, 3));
    let strokeReads = 0;
    const sources = new Proxy(saved, { get(target, property, receiver) { if (/^\d+$/.test(String(property))) strokeReads++; return Reflect.get(target, property, receiver); } });
    const replay = new PaintReplay(() => [true]);
    replay.rebuildFrom(h.wall, sources);
    assert.equal(strokeReads, 0, 'wall rebuild submission must not traverse canonical strokes');
    replay.update();
    assert.ok(strokeReads > 0 && strokeReads <= 256);
    assert.ok(h.marks > 0 && h.marks <= 256);
    assert.equal(h.context.marks.length, 0);
    finish(replay, h.wall);
    assert.equal(h.context.marks.length, 3000);
  } finally { h.reset(); }
});

test('rebuild sample preparation and rendering stop at the three-millisecond deadline', () => {
  const h = replayHarness(); h.pointCost = 1;
  try {
    const replay = new PaintReplay(() => [true]);
    replay.rebuildFrom(h.wall, [stroke('slow', 30)]);
    replay.update();
    assert.equal(h.marks, 3);
    assert.equal(replay.isRebuilding(h.wall), true);
    finish(replay, h.wall);
    assert.equal(h.context.marks.length, 30);
  } finally { h.reset(); }
});

test('live local overlays remain visible and are replayed after canonical history before commit', () => {
  const h = replayHarness();
  try {
    const replay = new PaintReplay(() => [true]);
    replay.rebuildFrom(h.wall, [stroke('history', 600)]);
    const live = stroke('live', 1, '#00ff00');
    renderNetworkPoint(h.wall, 4, 0, live, live.points[0], null, [true]);
    replay.enqueue(h.wall, live, live.points, null);
    assert.deepEqual(h.context.marks, ['#00ff00'], 'immediate local paint is visible during reconstruction');
    replay.update();
    assert.deepEqual(h.context.marks, ['#00ff00']);
    finish(replay, h.wall);
    assert.equal(h.context.marks.length, 601);
    assert.equal(h.context.marks.at(-1), '#00ff00');
  } finally { h.reset(); }
});

test('a point appended to a not-yet-materialized active stroke is applied exactly once', () => {
  const h = replayHarness();
  try {
    const active = stroke('active', 600);
    const replay = new PaintReplay(() => [true]); replay.rebuildFrom(h.wall, [active]);
    const previous = active.points.at(-1)!; const latest = point();
    active.points.push(latest);
    renderNetworkPoint(h.wall, 4, 0, active, latest, previous, [true]);
    replay.enqueue(h.wall, active, [latest], previous);
    finish(replay, h.wall);
    assert.equal(h.context.marks.length, 601, 'lazy history must not double-count points also in the live overlay queue');
  } finally { h.reset(); }
});

test('replacement rebuild cancels stale staging and cancellation never clears current pixels', () => {
  const h = replayHarness();
  try {
    h.context.marks = ['visible-local'];
    const replay = new PaintReplay(() => [true]);
    replay.rebuildFrom(h.wall, [stroke('obsolete', 1000)]); replay.update();
    replay.rebuildFrom(h.wall, [stroke('replacement', 4, '#0000ff')]);
    finish(replay, h.wall);
    assert.deepEqual(h.context.marks, ['#0000ff', '#0000ff', '#0000ff', '#0000ff']);
    replay.rebuildFrom(h.wall, [stroke('cancelled', 1000)]); replay.update(); replay.cancel(); replay.update();
    assert.deepEqual(h.context.marks, ['#0000ff', '#0000ff', '#0000ff', '#0000ff']);
    assert.equal(replay.rebuilding, false);
  } finally { h.reset(); }
});

test('live enqueue during a multi-face staging commit restarts commit without dropping local pixels', () => {
  const h = replayHarness();
  try {
    h.wall.layers[0].ensureFace(0); h.wall.layers[0].ensureFace(1);
    const replay = new PaintReplay(() => [true]); replay.rebuildFrom(h.wall, [stroke('history', 1)]);
    replay.update();
    assert.equal(replay.isRebuilding(h.wall), true, 'three existing faces commit over more than one frame');
    const live = { ...stroke('live', 1, '#00ff00'), surfaceId: 'ss1:0:0:replay-budget/f0/l0', points: [{ x: 1, y: 1, z: 0, pressure: 1 }] };
    renderNetworkPoint(h.wall, 0, 0, live, live.points[0], null, [true]);
    replay.enqueue(h.wall, live, live.points, null);
    finish(replay, h.wall);
    assert.deepEqual((h.wall.layers[0].contexts[0] as any).marks, ['#00ff00']);
    assert.deepEqual(h.context.marks, ['#ff0000']);
  } finally { h.reset(); }
});
