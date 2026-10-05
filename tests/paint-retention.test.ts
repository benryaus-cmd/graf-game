import assert from 'node:assert/strict';
import test from 'node:test';
import { PaintSync, type PaintSample } from '../src/multiplayer/paintSync';
import type { SharedStroke } from '../src/multiplayer/protocol';

const sample = (x: number): PaintSample => ({
  surfaceId: 'wall/0/0/0', colour: '#ff0000', tool: 'spray', brushSize: 5,
  point: { x, y: 0, z: 0, pressure: 1 },
});
const makeSync = (send: (message: Record<string, unknown>) => boolean = () => true) =>
  new PaintSync({ send, draw: () => {}, reset: () => {} });
const serverCopy = (stroke: SharedStroke, points = stroke.points): SharedStroke => ({
  ...stroke, points: points.map((point) => ({ ...point })), sequence: 42, playerId: 'self',
});

test('confirmed ended local strokes stay removed after a later authoritative snapshot omits them', () => {
  const sync = makeSync();
  const local = sync.sample(sample(1), true).stroke;
  sync.sample(sample(2), true);
  sync.end();
  const complete = serverCopy(local);
  sync.snapshot([complete]);
  assert.equal(sync.strokes.get(local.strokeId)?.points.length, 2);

  sync.snapshot([]);
  assert.equal(sync.strokes.has(local.strokeId), false);
  sync.snapshot([]);
  assert.equal(sync.strokes.has(local.strokeId), false);
});

test('an accepted sequence echo confirms the local ID for later authoritative removal', () => {
  const sync = makeSync();
  const local = sync.sample(sample(1), true).stroke;
  sync.accept({ type: 'stroke_begin', sequence: 43, stroke: serverCopy(local) });
  sync.end();

  sync.snapshot([]);
  assert.equal(sync.strokes.has(local.strokeId), false);
});

test('genuinely unsent offline drafts survive authoritative snapshots', () => {
  const sync = makeSync(() => false);
  const local = sync.sample(sample(1), true).stroke;
  sync.sample(sample(2), true);
  sync.end();

  sync.snapshot([]);
  assert.equal(sync.strokes.get(local.strokeId)?.points.length, 2);
  assert.equal(sync.strokes.has(local.strokeId), true);
});

test('an active partially acknowledged stroke keeps its unsent local tail', () => {
  const sync = makeSync();
  const local = sync.sample(sample(1), true).stroke;
  sync.sample(sample(2), true);
  sync.sample(sample(3), true);
  const partial = serverCopy(local, local.points.slice(0, 1));

  sync.snapshot([partial], true);
  assert.equal(sync.drawing, true);
  assert.equal(sync.strokes.get(local.strokeId)?.points.length, 3);
  assert.equal(sync.strokes.get(local.strokeId)?.points[2].x, 3);

  sync.snapshot([], true);
  assert.equal(sync.strokes.get(local.strokeId)?.points.length, 3);
});
