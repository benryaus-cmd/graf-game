import assert from 'node:assert/strict';
import test from 'node:test';
import { PaintSync } from '../src/multiplayer/paintSync';
import { choosePieceAtWorldPoint, PieceSync } from '../src/multiplayer/pieceSync';

const bounds = { min: [1, 2, 3], max: [4, 5, 6] };
const metadata = (pieceId: string, overrides: Record<string, unknown> = {}) => ({
  pieceId, anchor: [2, 3, 4], chunkX: 0, chunkZ: 1, owner: 'owner-a',
  createdAt: '2026-10-05T10:00:00Z', completedAt: '2026-10-05T10:01:00Z',
  currentWindowStartedAt: 1_791_187_200_000, currentWindowEndsAt: '2026-10-06T10:00:00Z',
  currentWindowLikes: 4, lifetimeLikes: 12, survivalGeneration: 2,
  strokeIds: ['stroke-a'], bounds, status: 'completed', revision: 9, sequence: 10,
  ...overrides,
});

test('piece create keeps a stable local id and sends the supported wire shape', () => {
  const sent: Record<string, unknown>[] = [];
  const sync = new PieceSync(message => { sent.push(message); return true; });
  const pieceId = sync.create([2, 3, 4], bounds);
  assert.ok(pieceId);
  assert.deepEqual(sent[0], { type: 'piece_create', pieceId, anchor: [2, 3, 4], bounds });
  assert.equal(sync.pieces.get(pieceId!)?.status, 'active');
  sync.snapshot([]); sync.snapshot([]);
  assert.equal(sync.pieces.has(pieceId!), true, 'unconfirmed optimistic piece IDs remain stable until echo/removal');
});

test('a failed piece create is not retained as an optimistic phantom', () => {
  const sync = new PieceSync(() => false);
  assert.equal(sync.create([2, 3, 4], bounds), null);
  assert.equal(sync.pieces.size, 0);
});

test('unconfirmed local pieces expire when a complete snapshot continues to omit them', () => {
  let now = 1000;
  const sync = new PieceSync(() => true, () => {}, () => now);
  const pieceId = sync.create([2, 3, 4], bounds)!;
  sync.snapshot([]);
  assert.equal(sync.pieces.has(pieceId), true);
  now += 30_001;
  sync.snapshot([]);
  assert.equal(sync.pieces.has(pieceId), false);
});

test('piece snapshots parse bounded metadata and ISO timestamps; known updates merge', () => {
  const sync = new PieceSync(() => true);
  sync.snapshot([metadata('piece-a')]);
  const piece = sync.pieces.get('piece-a')!;
  assert.equal(piece.createdAt, Date.parse('2026-10-05T10:00:00Z'));
  assert.equal(piece.currentWindowEndsAt, Date.parse('2026-10-06T10:00:00Z'));
  assert.equal(piece.currentWindowLikes, 4);
  sync.accept({ type: 'piece_liked', piece: { pieceId: 'piece-a', currentWindowLikes: 5, sequence: 11 } });
  assert.equal(sync.pieces.get('piece-a')?.currentWindowLikes, 5);
  assert.equal(sync.pieces.get('piece-a')?.bounds.max[2], 6);
  sync.accept({ type: 'piece_like_result', piece: metadata('piece-a', { currentWindowLikes: 99 }) });
  assert.equal(sync.pieces.get('piece-a')?.currentWindowLikes, 5, 'unknown event names are ignored');
});

test('world-space piece picking uses bounds tolerance and picks the newest overlap', () => {
  const sync = new PieceSync(() => true);
  sync.snapshot([
    metadata('older', { createdAt: 100, sequence: 10 }),
    metadata('newer', { createdAt: 200, sequence: 11 }),
  ]);
  assert.equal(choosePieceAtWorldPoint(sync.pieces.values(), [4.05, 5, 6])?.pieceId, 'newer');
  assert.equal(choosePieceAtWorldPoint(sync.pieces.values(), [4.11, 5, 6]), null, 'points farther than the 0.1m tolerance do not select');
  assert.equal(choosePieceAtWorldPoint(sync.pieces.values(), [4, 5, 6], 0)?.pieceId, 'newer');
});

test('piece metadata rejects invalid bounds, timestamps and unreasonable counts', () => {
  const sync = new PieceSync(() => true);
  sync.snapshot([
    metadata('inverted', { bounds: { min: [4, 2, 3], max: [1, 5, 6] } }),
    metadata('huge', { currentWindowLikes: Number.MAX_SAFE_INTEGER }),
    metadata('bad-window', { currentWindowStartedAt: 100, currentWindowEndsAt: 99 }),
  ]);
  assert.equal(sync.pieces.size, 1);
  assert.equal(sync.pieces.get('huge')?.currentWindowLikes, undefined);
});

test('piece removal reports all known stroke IDs and drops the piece', () => {
  let removed: string[] | undefined;
  const sync = new PieceSync(() => true, (_pieces, ids) => { removed = ids; });
  sync.snapshot([metadata('piece-a')]);
  sync.accept({ type: 'piece_removed', pieceId: 'piece-a', strokeIds: ['stroke-b'], reason: 'expired' });
  assert.equal(sync.pieces.has('piece-a'), false);
  assert.deepEqual(removed, ['stroke-b', 'stroke-a']);
});

test('piece IDs travel with stroke begins and removal drops only listed local strokes', () => {
  const sent: Record<string, unknown>[] = [];
  const paint = new PaintSync({ send: message => { sent.push(message); return true; }, draw: () => {}, reset: () => {} });
  const first = paint.sample({ surfaceId: 'wall/0/0/0', colour: '#ff0000', tool: 'spray', brushSize: 5, point: { x: 1, y: 0, z: 0, pressure: 1 }, pieceId: 'piece-a' }, true).stroke;
  assert.equal(first.pieceId, 'piece-a');
  assert.equal(sent[0].pieceId, 'piece-a');
  paint.end();
  const second = paint.sample({ surfaceId: 'wall/0/0/0', colour: '#00ff00', tool: 'spray', brushSize: 5, point: { x: 2, y: 0, z: 0, pressure: 1 } }, true).stroke;
  const affected = paint.removeStrokeIds([first.strokeId]);
  assert.deepEqual(affected, ['wall/0/0/0']);
  assert.equal(paint.strokes.has(first.strokeId), false);
  assert.equal(paint.strokes.has(second.strokeId), true);
});

test('piece removal tombstones known strokes and rejects delayed begins, points and snapshots', () => {
  const drawn: string[] = [];
  const paint = new PaintSync({ send: () => true, draw: stroke => drawn.push(stroke.strokeId), reset: () => {} });
  const stroke = (strokeId: string) => ({
    strokeId, pieceId: 'removed-piece', surfaceId: 'wall/0/0/0', colour: '#ff0000',
    tool: 'spray', brushSize: 5, points: [{ x: 1, y: 0, z: 0, pressure: 1 }],
  });
  paint.accept({ type: 'stroke_begin', stroke: stroke('known-stroke') });
  assert.equal(paint.strokes.has('known-stroke'), true);
  paint.rejectPiece('removed-piece');
  assert.equal(paint.strokes.has('known-stroke'), false);
  paint.accept({ type: 'stroke_begin', stroke: stroke('late-stroke') });
  paint.accept({ type: 'stroke_points', strokeId: 'known-stroke', points: [{ x: 2, y: 0, z: 0, pressure: 1 }] });
  paint.snapshot([stroke('known-stroke'), stroke('late-stroke')]);
  assert.equal(paint.strokes.size, 0);
  assert.deepEqual(drawn, ['known-stroke']);
});
