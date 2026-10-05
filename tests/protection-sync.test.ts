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
  assert.deepEqual(sent[0], { type: 'protection_quote', pieceId: 'piece-a', bounds, protectionEnabled: false });
  assert.equal(sync.quote, null, 'a request is not an authoritative quote');
  const quote = { cost: 7, durationSeconds: 0, balance: 25, canPurchase: true, overlapPieceId: null, protectionEnabled: false };
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-b', ...quote }), false);
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', ...quote }), true);
  assert.deepEqual(sync.quote, { pieceId: 'piece-a', bounds, protectionEnabled: false, ...quote });
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', ...quote, cost: -1 }), false);
  assert.equal(sync.requestQuote('piece-a', { min: [0, 0, Number.NaN], max: [1, 1, 1] }), false);
});

test('quote replies must match the requested protection mode and both modes cache independently', () => {
  const sent: Record<string, unknown>[] = [];
  const sync = new ProtectionSync(message => { sent.push(message); return true; });
  sync.requestQuote('piece-a', bounds, false);
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 3, durationSeconds: 0, balance: 10, canPurchase: true, overlapPieceId: null, protectionEnabled: true }), false);
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 3, durationSeconds: 0, balance: 10, canPurchase: true, overlapPieceId: null, protectionEnabled: false }), true);
  assert.equal(sync.requestQuote('piece-a', bounds, true), true);
  assert.deepEqual(sent.at(-1), { type: 'protection_quote', pieceId: 'piece-a', bounds, protectionEnabled: true });
  assert.equal(sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 8, durationSeconds: 3600, balance: 10, canPurchase: true, overlapPieceId: null, protectionEnabled: true }), true);
  assert.equal(sync.quotes.unprotected?.cost, 3);
  assert.equal(sync.quotes.protected?.cost, 8);
});

test('bounds changes clear displayed quotes and serialize/coalesce in-flight quote requests', () => {
  const sent: Record<string, unknown>[] = [];
  const sync = new ProtectionSync(message => { sent.push(message); return true; });
  sync.requestQuote('piece-a', bounds);
  assert.equal(sync.requestQuote('piece-a', resized), true);
  assert.equal(sent.length, 1, 'only one quote request is in flight');
  assert.equal(sync.quote, null);
  sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 5, durationSeconds: 0, balance: 10, canPurchase: true, overlapPieceId: null, protectionEnabled: false });
  assert.equal(sync.quote, null, 'a quote for the previous bounds is discarded');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], { type: 'protection_quote', pieceId: 'piece-a', bounds: resized, protectionEnabled: false });
  sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 8, durationSeconds: 0, balance: 10, canPurchase: true, overlapPieceId: null, protectionEnabled: false });
  assert.deepEqual(sync.quote, { pieceId: 'piece-a', bounds: resized, protectionEnabled: false, cost: 8, durationSeconds: 0, balance: 10, canPurchase: true, overlapPieceId: null });
  assert.equal(sent.length, 3, 'the opposite mode is fetched automatically for current bounds');
  assert.equal(sent[2].protectionEnabled, true);
});

test('both-mode quote refresh drains both modes after an in-flight resize', () => {
  const sent: Record<string, unknown>[] = [];
  const sync = new ProtectionSync(message => { sent.push(message); return true; });
  sync.requestQuote('piece-a', bounds, false);
  sync.requestBothQuotes('piece-a', resized);
  const reply = (protectionEnabled: boolean) => ({ type: 'protection_quote_result' as const, pieceId: 'piece-a', cost: 5, durationSeconds: 0, balance: 10, canPurchase: true, overlapPieceId: null, protectionEnabled });
  sync.accept(reply(false));
  assert.deepEqual(sent[1], { type: 'protection_quote', pieceId: 'piece-a', bounds: resized, protectionEnabled: false });
  sync.accept(reply(false));
  assert.deepEqual(sent[2], { type: 'protection_quote', pieceId: 'piece-a', bounds: resized, protectionEnabled: true });
  sync.accept(reply(true));
  assert.deepEqual(sync.quotes.unprotected?.bounds, resized);
  assert.deepEqual(sync.quotes.protected?.bounds, resized);
});

test('purchase waits for server confirmation and never charges local balance optimistically', () => {
  const sent: Record<string, unknown>[] = [];
  const sync = new ProtectionSync(message => { sent.push(message); return true; });
  sync.accept({ type: 'credit_balance', balance: 100 });
  sync.requestQuote('piece-a', bounds);
  sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 40, durationSeconds: 14_400, balance: 100, canPurchase: true, overlapPieceId: null, protectionEnabled: false });
  assert.equal(sync.purchase('piece-a', bounds), true);
  assert.deepEqual(sent.at(-1), { type: 'protection_purchase', pieceId: 'piece-a', bounds, protectionEnabled: false });
  assert.equal(sync.creditBalance, 100);
  assert.equal(sync.protections.has('piece-a'), false);
  sync.setCurrentBounds('piece-a', resized);
  assert.deepEqual(sync.purchaseBoundsFor('piece-a'), bounds, 'purchase keeps the exact bounds even if the editor changes');
  assert.equal(sync.accept({ type: 'canvas_purchase_complete', pieceId: 'piece-b', protectionEnabled: false, cost: 40, balance: 60, protectedUntil: null }), false);
  assert.equal(sync.accept({ type: 'canvas_purchase_complete', pieceId: 'piece-a', protectionEnabled: false, cost: 40, balance: 60, protectedUntil: null }), true);
  assert.equal(sync.creditBalance, 60);
  assert.deepEqual(sync.protections.get('piece-a'), { pieceId: 'piece-a', protectedUntil: null });
  assert.equal(sync.isPurchased('piece-a', bounds, false), true);
  assert.equal(sync.quote, null);
});

test('both purchase ack types accept either mode; duplicate ack does not replace confirmed balance', () => {
  const sync = new ProtectionSync(() => true);
  sync.requestQuote('piece-a', bounds, true);
  sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 8, durationSeconds: 3600, balance: 50, canPurchase: true, overlapPieceId: null, protectionEnabled: true });
  assert.equal(sync.purchase('piece-a', bounds, true), true);
  assert.equal(sync.accept({ type: 'canvas_purchase_complete', pieceId: 'piece-a', protectionEnabled: true, cost: 8, balance: 42 }), true);
  assert.equal(sync.creditBalance, 42);
  assert.equal(sync.accept({ type: 'protection_purchased', pieceId: 'piece-a', protectionEnabled: true, cost: 8, balance: 2, protectedUntil: 1_800_000_000_000 }), true);
  assert.equal(sync.creditBalance, 42);
  assert.equal(sync.protections.get('piece-a')?.protectedUntil, 1_800_000_000_000);
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
  sync.accept({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 20, durationSeconds: 14_400, protectionEnabled: false, balance: 50, canPurchase: true, overlapPieceId: null });
  sync.accept({ type: 'credit_balance', balance: 50 });
  assert.equal(sync.purchase('piece-a', bounds), true);
  now += PROTECTION_REQUEST_TIMEOUT_MS;
  assert.equal(sync.tick(), true);
  assert.equal(sync.pendingPurchasePieceId, null);
  assert.equal(sync.creditBalance, 50);
  assert.match(sync.notice ?? '', /check the server balance/i);
  sync.setCurrentBounds('piece-a', resized);
  assert.deepEqual(sync.purchaseBoundsFor('piece-a'), bounds, 'timeout retains the exact in-flight purchase bounds');
  assert.equal(sync.accept({ type: 'protection_purchased', pieceId: 'piece-a', protectionEnabled: false, cost: 20, balance: 30, protectedUntil: null }), true, 'a late server acknowledgement remains authoritative');
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
    assert.equal(protection.requestQuote('piece-a', original, true), true);
    (session as any).message({ type: 'protection_quote_result', pieceId: 'piece-a', cost: 10, durationSeconds: 14_400, protectionEnabled: true, balance: 100, canPurchase: true, overlapPieceId: null });
    assert.equal(protection.purchase('piece-a', original, true), true);
    protection.setCurrentBounds('piece-a', resized, true);
    (session as any).message({ type: 'protection_purchased', pieceId: 'piece-a', protectionEnabled: true, cost: 10, balance: 90, protectedUntil: 1_800_000_000_000 });
    assert.deepEqual((session as any).pieces.pieces.get('piece-a').protectionBounds, original);
  } finally { session.dispose(); globalThis.WebSocket = previousSocket; }
});

test('a late opposite-mode quote cannot overwrite a confirmed canvas balance', () => {
 const sync = new ProtectionSync(() => true);
 sync.requestBothQuotes('late', bounds);
 sync.accept({ type: 'protection_quote_result', pieceId: 'late', protectionEnabled: false, cost: 15, durationSeconds: 0, balance: 1000, canPurchase: true, overlapPieceId: null });
 assert.equal(sync.purchase('late', bounds, false), true);
 assert.equal(sync.accept({ type: 'protection_purchased', pieceId: 'late', protectionEnabled: false, cost: 15, balance: 985, protectedUntil: null }), true);
 sync.accept({ type: 'protection_quote_result', pieceId: 'late', protectionEnabled: true, cost: 30, durationSeconds: 14400, balance: 1000, canPurchase: true, overlapPieceId: null });
 assert.equal(sync.creditBalance, 985);
 assert.equal(sync.quote, null);
 assert.equal(sync.quotes.protected, null);
});

test('an unprotected server purchase unlocks the current canvas only after confirmation', () => {
  const sockets: FakeSocket[] = [], previousSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = class extends FakeSocket { constructor() { super(); sockets.push(this); } };
  const world: any = { scene: new THREE.Scene(), walls: [], colliders: [], setPaintSession() {}, playerPosition: new THREE.Vector3(), playerYaw: 0, playerPitch: 0, paintRevision: 0 };
  const session = new WorldMultiplayerSession(world, () => {});
  try {
    session.join('Artist'); const socket = sockets[0]; socket.readyState = 1;
    socket.receive({ type: 'hello', protocol: 2, playerId: 'self' });
    socket.receive({ type: 'world_snapshot', protocol: 2, roomId: 'public', playerId: 'self', strokes: [], players: [] });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
    const selection: any = { wall: { mesh }, face: 0, center: new THREE.Vector3(), preview: new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2,-2,0),new THREE.Vector3(2,-2,0),new THREE.Vector3(2,2,0),new THREE.Vector3(-2,2,0)])) };
    world.paintWorkspace = { selection };
    assert.equal(session.quoteProtection(false), true);
    const pieceId = (session as any).selectedPieceId;
    (session as any).message({ type: 'protection_quote_result', pieceId, protectionEnabled: false, cost: 60, durationSeconds: 0, canPurchase: true, overlapPieceId: null, balance: 1000 });
    assert.equal(session.purchaseProtection(false), true);
    assert.notEqual(selection.purchaseApproved, true);
    assert.notEqual(selection.started, true);
    (session as any).message({ type: 'protection_purchased', pieceId, protectionEnabled: false, cost: 60, balance: 940, protectedUntil: null, durationSeconds: 0 });
    assert.equal(selection.purchaseApproved, true);
    assert.equal(selection.started, true);
    assert.equal((session as any).protection.creditBalance, 940);
  } finally { session.dispose(); globalThis.WebSocket = previousSocket; }
});
