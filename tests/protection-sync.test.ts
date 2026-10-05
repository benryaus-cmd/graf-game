import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { PROTECTION_REQUEST_TIMEOUT_MS, ProtectionSync } from '../src/multiplayer/protectionSync';
import { WorldMultiplayerSession } from '../src/multiplayer/worldSession';

class FakeSocket {
  readyState = 0; bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

const bounds = { min: [1, 2, 3], max: [4, 5, 6] };
const resized = { min: [1, 2, 3], max: [4, 5, 7] };

test('quote request validates and sends the exact bounded wire; only a matching server reply becomes a quote', () => {
  const sent: Record<string, unknown>[] = [];
  const sync = new ProtectionSync(message => { sent.push(message); return true; });
  assert.equal(sync.requestQuote('piece-a', bounds), true);
  assert.deepEqual(sent[0], { type: 'protection_quote', pieceId: 'piece-a', bounds });
  assert.equal(sync.quote, null, 'a request is not an authoritative quote');
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-b', cost: 7, durationSeconds: 14_400 }), false);
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 7, durationSeconds: 14_400 }), true);
  assert.deepEqual(sync.quote, { pieceId: 'piece-a', bounds, cost: 7, durationSeconds: 14_400 });
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: -1, durationSeconds: 14_400 }), false);
  assert.equal(sync.requestQuote('piece-a', { min: [0, 0, Number.NaN], max: [1, 1, 1] }), false);
});

test('bounds changes clear displayed quotes and serialize/coalesce in-flight quote requests', () => {
  const sent: Record<string, unknown>[] = [];
  const sync = new ProtectionSync(message => { sent.push(message); return true; });
  sync.requestQuote('piece-a', bounds);
  assert.equal(sync.requestQuote('piece-a', resized), true);
  assert.equal(sent.length, 1, 'only one quote request is in flight');
  assert.equal(sync.quote, null);
  sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 5, durationSeconds: 14_400 });
  assert.equal(sync.quote, null, 'a quote for the previous bounds is discarded');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], { type: 'protection_quote', pieceId: 'piece-a', bounds: resized });
  sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 8, durationSeconds: 14_400 });
  assert.deepEqual(sync.quote, { pieceId: 'piece-a', bounds: resized, cost: 8, durationSeconds: 14_400 });
});

test('purchase waits for server confirmation and never charges local balance optimistically', () => {
  const sent: Record<string, unknown>[] = [];
  const sync = new ProtectionSync(message => { sent.push(message); return true; });
  sync.accept({ type: 'credit_balance', balance: 100 });
  sync.requestQuote('piece-a', bounds);
  sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 40, durationSeconds: 14_400 });
  assert.equal(sync.purchase('piece-a', bounds), true);
  assert.deepEqual(sent.at(-1), { type: 'protection_purchase', pieceId: 'piece-a', bounds });
  assert.equal(sync.creditBalance, 100);
  assert.equal(sync.protections.has('piece-a'), false);
  sync.setCurrentBounds('piece-a', resized);
  assert.deepEqual(sync.purchaseBoundsFor('piece-a'), bounds, 'purchase keeps the exact bounds even if the editor changes');
  assert.equal(sync.accept({ type: 'protection_purchased', pieceId: 'piece-b', cost: 40, balance: 60, protectedUntil: 1_800_000_000_000 }), false);
  assert.equal(sync.accept({ type: 'protection_purchased', pieceId: 'piece-a', cost: 40, balance: 60, protectedUntil: 1_800_000_000_000 }), true);
  assert.equal(sync.creditBalance, 60);
  assert.deepEqual(sync.protections.get('piece-a'), { pieceId: 'piece-a', protectedUntil: 1_800_000_000_000 });
  assert.equal(sync.quote, null);
});

test('balance and protection updates are server-authoritative; only relevant protection errors are consumed', () => {
  const sync = new ProtectionSync(() => true);
  assert.equal(sync.creditBalance, null);
  assert.equal(sync.accept({ type: 'credit_balance', balance: 12 }), true);
  assert.equal(sync.creditBalance, 12);
  assert.equal(sync.accept({ type: 'piece_protection_updated', pieceId: 'piece-a', protectedUntil: 1_800_000_000_000, addedSeconds: 3600 }), true);
  assert.deepEqual(sync.protections.get('piece-a'), { pieceId: 'piece-a', protectedUntil: 1_800_000_000_000, addedSeconds: 3600 });
  assert.equal(sync.accept({ type: 'error', code: 'insufficient_credits' }), false, 'unrelated global errors remain available to other handlers');
  sync.requestQuote('piece-a', bounds);
  assert.equal(sync.accept({ type: 'error', code: 'insufficient_credits', pieceId: 'piece-a' }), true);
  assert.match(sync.notice ?? '', /not have enough credits/i);
  assert.equal(sync.pendingQuotePieceId, null);
});

test('account_state is the authoritative credit snapshot and rejects invalid balances without role inference', () => {
  const sync = new ProtectionSync(() => true);
  assert.equal(sync.accept({ type: 'account_state', username: 'artist', nickName: 'Artist', role: 'owner', credits: 25, serverTime: 1_800_000_000_000 }), true);
  assert.equal(sync.creditBalance, 25);
  assert.equal('role' in sync, false, 'account role fields are not used as permission grants');
  assert.equal(sync.accept({ type: 'account_state', credits: -1 }), false);
  assert.equal(sync.accept({ type: 'account_state', credits: Number.NaN }), false);
  assert.equal(sync.creditBalance, 25);
});

test('reset clears nullable balance, quote, pending operations, and piece protection', () => {
  const sync = new ProtectionSync(() => true);
  sync.accept({ type: 'credit_balance', balance: 9 });
  sync.requestQuote('piece-a', bounds);
  sync.accept({ type: 'piece_protection_updated', pieceId: 'piece-a', protectedUntil: 1_800_000_000_000, addedSeconds: 3600 });
  sync.reset();
  assert.equal(sync.creditBalance, null);
  assert.equal(sync.quote, null);
  assert.equal(sync.pendingQuotePieceId, null);
  assert.equal(sync.pendingPurchasePieceId, null);
  assert.equal(sync.protections.size, 0);
});

test('quote and purchase requests time out without pretending a purchase failed or refunding credits', () => {
  let now = 1_000;
  const sync = new ProtectionSync(() => true, () => {}, () => now);
  sync.requestQuote('piece-a', bounds);
  now += PROTECTION_REQUEST_TIMEOUT_MS;
  assert.equal(sync.tick(), true);
  assert.equal(sync.pendingQuotePieceId, null);
  assert.match(sync.notice ?? '', /quote request timed out/i);
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 20, durationSeconds: 14_400 }), false);
  assert.equal(sync.requestQuote('piece-a', bounds), false, 'timed out quote channel cannot safely retry without a request ID');
  assert.equal(sync.requestQuote('piece-b', bounds), false, 'a different piece cannot disambiguate the shared reply channel');
  sync.reset();
  sync.requestQuote('piece-a', bounds);
  sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 20, durationSeconds: 14_400 });
  sync.accept({ type: 'credit_balance', balance: 50 });
  assert.equal(sync.purchase('piece-a', bounds), true);
  now += PROTECTION_REQUEST_TIMEOUT_MS;
  assert.equal(sync.tick(), true);
  assert.equal(sync.pendingPurchasePieceId, null);
  assert.equal(sync.creditBalance, 50);
  assert.match(sync.notice ?? '', /check the server balance/i);
  sync.setCurrentBounds('piece-a', resized);
  assert.deepEqual(sync.purchaseBoundsFor('piece-a'), bounds, 'timeout retains the exact in-flight purchase bounds');
  assert.equal(sync.accept({ type: 'protection_purchased', pieceId: 'piece-a', cost: 20, balance: 30, protectedUntil: 1_800_000_000_000 }), true, 'a late server acknowledgement remains authoritative');
  assert.equal(sync.creditBalance, 30);
  assert.equal(sync.purchaseBoundsFor('piece-a'), null);
});

test('world session associates purchase acknowledgement with submitted bounds after editor resize', () => {
  const sockets: FakeSocket[] = [], previousSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = class extends FakeSocket { constructor() { super(); sockets.push(this); } };
  const original = { min: [1, 2, 3], max: [4, 5, 6] };
  const resized = { min: [10, 20, 30], max: [40, 50, 60] };
  const scene = new THREE.Scene();
  const world: any = { scene, walls: [], colliders: [], setPaintSession() {}, playerPosition: new THREE.Vector3(), playerYaw: 0, playerPitch: 0, paintRevision: 0 };
  const session = new WorldMultiplayerSession(world, () => {});
  try {
    session.join('Artist'); const socket = sockets[0]; socket.readyState = 1;
    socket.receive({ type: 'hello', protocol: 2, playerId: 'self' });
    socket.receive({ type: 'world_snapshot', protocol: 2, roomId: 'public', playerId: 'self', sequence: 0, revision: 0, strokes: [], players: [], graffitiPieces: [{ pieceId: 'piece-a', anchor: [2, 3, 4], bounds: original, strokeIds: [] }] });
    const protection = (session as any).protection as ProtectionSync;
    assert.equal(protection.requestQuote('piece-a', original), true);
    (session as any).message({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 10, durationSeconds: 14_400 });
    assert.equal(protection.purchase('piece-a', original), true);
    protection.setCurrentBounds('piece-a', resized);
    (session as any).message({ type: 'protection_purchased', pieceId: 'piece-a', cost: 10, balance: 90, protectedUntil: 1_800_000_000_000 });
    assert.deepEqual((session as any).pieces.pieces.get('piece-a').protectionBounds, original);
  } finally { session.dispose(); globalThis.WebSocket = previousSocket; }
});
