import test from 'node:test';
import assert from 'node:assert/strict';
import { PieceEditGrace } from '../src/game/pieceEditGrace';

test('finishing allows sixty seconds to resume before completion, and resuming cancels completion', () => {
  let pending: (() => void) | undefined;
  let delay = 0;
  let cancelled = false;
  let completed = 0;
  const grace = new PieceEditGrace(() => 1000, (callback, milliseconds) => { pending = callback; delay = milliseconds; return 1; }, () => { cancelled = true; pending = undefined; });
  assert.equal(grace.start(() => completed++), 61000);
  assert.equal(delay, 60000);
  assert.equal(completed, 0);
  grace.resume();
  assert.equal(cancelled, true);
  assert.equal(pending, undefined);
  grace.start(() => completed++);
  pending!();
  assert.equal(completed, 1);
  assert.equal(grace.expiresAt, 0);
});
