import assert from 'node:assert/strict';
import test from 'node:test';
import { headForTool, paintHeads, paintHeadFootprint, nextHoldSamples, drawPaintHead } from '../src/game/sprayHeads';
import * as THREE from 'three';
import { createPaintWall } from '../src/game/architectureWalls';
import { stampPaintHit } from '../src/game/worldPainting';
import { PaintReplay } from '../src/multiplayer/paintReplay';
import { pointToHit } from '../src/multiplayer/surfaces';
import type { PaintWall } from '../src/game/worldTypes';
import type { StrokePoint } from '../src/multiplayer/protocol';

function recordingCanvas() {
  const canvas: any = { width: 1, height: 1 };
  let path: unknown[] = [];
  const context: any = {
    canvas, draws: [], globalAlpha: 1, globalCompositeOperation: 'source-over',
    save() {}, restore() {}, setTransform() {}, fillRect() {},
    beginPath() { path = []; },
    moveTo(...args: number[]) { path.push(['move', ...args]); },
    lineTo(...args: number[]) { path.push(['line', ...args]); },
    arc(...args: number[]) { path.push(['arc', ...args]); },
    stroke() { this.draws.push({ path: [...path], width: this.lineWidth, alpha: this.globalAlpha }); },
    fill() { this.draws.push({ path: [...path], width: this.lineWidth, alpha: this.globalAlpha }); },
    clearRect() { this.draws = []; },
    drawImage(source: any) { this.draws.push(...source.getContext('2d').draws); },
  };
  canvas.getContext = () => context;
  return canvas;
}

test('every head has a distinct deterministic footprint recipe', () => {
  const footprints = paintHeads.map(paintHeadFootprint);
  assert.equal(new Set(footprints.map(value => JSON.stringify(value))).size, 6);
});

test('drip has no moving-stamp tail, then grows progressively after a short stationary hold', () => {
  let dwell = 1;
  for (let i = 0; i < 59; i++) dwell = nextHoldSamples({ worldPoint: [10, 20, 0], holdSamples: dwell }, [10, 20, 0]);
  const tail = (samples: number): number | null => {
    const ys: number[] = [];
    const context = {
      beginPath() {}, arc() {}, fill() {}, save() {}, restore() {}, moveTo(_x: number, y: number) { ys.push(y); },
      lineTo(_x: number, y: number) { ys.push(y); }, stroke() {},
    } as unknown as CanvasRenderingContext2D;
    drawPaintHead(context, 0, 0, 1, 'drip', samples);
    return ys.length ? Math.max(...ys) - Math.min(...ys) : null;
  };
  assert.equal(tail(1), null, 'a moving stamp is only a head mark');
  assert.equal(tail(10), null, 'drips wait for a brief stationary hold');
  assert.ok((tail(12) ?? 0) > 0);
  assert.ok((tail(30) ?? 0) > (tail(12) ?? 0));
  assert.equal(tail(dwell), tail(dwell + 100));
  assert.equal(nextHoldSamples({ worldPoint: [10, 20, 0], holdSamples: dwell }, [10.006, 20, 0]), 1);
});

test('drip keeps a soft aerosol edge with a tighter blur and firmer opacity', () => {
  const marks: Array<{ filter: string; alpha: number }> = [];
  const saved: Array<{ filter: string; alpha: number }> = [];
  const context: any = {
    globalAlpha: 1, filter: 'none', save() { saved.push({ filter: this.filter, alpha: this.globalAlpha }); },
    restore() { const state = saved.pop()!; this.filter = state.filter; this.globalAlpha = state.alpha; }, beginPath() {},
    arc() { marks.push({ filter: this.filter, alpha: this.globalAlpha }); }, fill() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  drawPaintHead(context, 0, 0, .02, 'soft', 1);
  drawPaintHead(context, 0, 0, .02, 'drip', 1);
  assert.equal(marks[0].filter, 'blur(1px)');
  assert.equal(marks[0].alpha, 0.7);
  assert.equal(marks[1].filter, 'blur(0.4px)');
  assert.equal(marks[1].alpha, 0.88);
});

test('local stamping and replay produce matching dwell geometry at different canvas resolutions', () => {
  const previousDocument = (globalThis as any).document;
  (globalThis as any).document = { createElement: recordingCanvas };
  const makeWall = (resolution: number): PaintWall => {
    const group = new THREE.Group();
    const created = createPaintWall(group, 0, 0, 2, 2, 0.1, new THREE.MeshStandardMaterial(), 0, resolution).wall;
    created.surfaceId = 'ss1:0:0:dwell';
    group.updateMatrixWorld(true);
    return created;
  };
  try {
    const localWall = makeWall(256);
    const replayWall = makeWall(1024);
    const face = 4;
    const first = localWall.mesh.localToWorld(new THREE.Vector3(0, 0, 0.05));
    const moved = localWall.mesh.localToWorld(new THREE.Vector3(0.02, 0, 0.05));
    const asPoint = (point: THREE.Vector3): StrokePoint => ({ x: point.x, y: point.y, z: point.z, pressure: 1 });
    const points = [asPoint(first), ...Array.from({ length: 29 }, () => asPoint(first)), asPoint(moved), ...Array.from({ length: 29 }, () => asPoint(moved))];
    let prior: ReturnType<typeof stampPaintHit> = null;
    const localDwell: number[] = [];
    for (const point of points) {
      const hit = pointToHit(localWall, face, point)!;
      prior = stampPaintHit(localWall, hit, '#ff0000', 1, .01, 0, prior, true, false, 'drip');
      localDwell.push(prior!.holdSamples!);
    }
    const replay = new PaintReplay(() => [true]);
    replay.rebuild(replayWall);
    const stroke = { strokeId: 'dwell-stroke', surfaceId: 'ss1:0:0:dwell/f4/l0', colour: '#ff0000', tool: 'drip', brushSize: .5, points };
    replay.enqueue(replayWall, stroke, points, null);
    for (let i = 0; i < 20 && replay.isRebuilding(replayWall); i++) replay.update();
    const tailLengths = (wall: PaintWall) => wall.layers[0].ensureFace(face)!.draws
      .filter((draw: any) => draw.path.some((entry: any) => entry[0] === 'line'))
      .map((draw: any) => {
        const start = draw.path.find((entry: any) => entry[0] === 'move')[2];
        const end = draw.path.find((entry: any) => entry[0] === 'line')[2];
        return end - start;
      });
    assert.deepEqual(localDwell.slice(0, 4), [1, 2, 3, 4]);
    assert.deepEqual(localDwell.slice(29, 33), [30, 1, 2, 3]);
    assert.deepEqual(tailLengths(localWall), tailLengths(replayWall));
    replay.cancel();
  } finally {
    (globalThis as any).document = previousDocument;
  }
});

test('tool decoding preserves legacy spray and eraser records', () => {
  assert.equal(headForTool('spray'), undefined);
  assert.equal(headForTool('eraser'), undefined);
  assert.equal(headForTool('roller'), 'roller');
  assert.equal(headForTool('unknown-tool'), 'soft');
});
