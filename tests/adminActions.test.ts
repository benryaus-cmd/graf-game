import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminAction, canUseAdminActions } from '../src/multiplayer/adminActions';

test('only owner or admin acting on a known non-owner can use player admin actions', () => {
  assert.equal(canUseAdminActions('owner', undefined), true);
  assert.equal(canUseAdminActions('admin', 'player'), true);
  assert.equal(canUseAdminActions('admin', undefined), false);
  assert.equal(canUseAdminActions('admin', 'owner'), false);
  assert.equal(canUseAdminActions('moderator', 'player'), false);
});

test('admin action builder emits the established wire message shapes', () => {
  assert.deepEqual(buildAdminAction('admin', 'player', 'give-credits', '@sam', { amount: 50, reason: 'thanks' }),
    { type: 'admin_give_credits', targetUsername: 'sam', amount: 50 });
  assert.deepEqual(buildAdminAction('owner', 'owner', 'kick', 'sam', {}),
    { type: 'admin_kick', targetUsername: 'sam' });
  assert.deepEqual(buildAdminAction('owner', 'player', 'ban', 'sam', { durationSeconds: 600, reason: 'spam' }),
    { type: 'admin_ban', targetUsername: 'sam', durationSeconds: 600, reason: 'spam' });
  assert.deepEqual(buildAdminAction('owner', 'player', 'ban', 'sam', { durationSeconds: null }),
    { type: 'admin_ban', targetUsername: 'sam', durationSeconds: null });
  assert.deepEqual(buildAdminAction('owner', 'player', 'ban', 'sam', { durationSeconds: 31_536_000 }),
    { type: 'admin_ban', targetUsername: 'sam', durationSeconds: 31_536_000 });
  assert.deepEqual(buildAdminAction('owner', 'player', 'unban', 'sam', {}),
    { type: 'admin_unban', targetUsername: 'sam' });
});

test('invalid targets, amounts, durations, and reasons never produce a request', () => {
  assert.equal(buildAdminAction('admin', 'owner', 'kick', 'sam', {}), null);
  assert.equal(buildAdminAction('admin', undefined, 'kick', 'sam', {}), null);
  assert.equal(buildAdminAction('owner', 'player', 'give-credits', 'sam', { amount: 0 }), null);
  assert.equal(buildAdminAction('owner', 'player', 'ban', 'sam', { durationSeconds: 59 }), null);
  assert.equal(buildAdminAction('owner', 'player', 'ban', 'sam', { durationSeconds: 31_536_001 }), null);
  assert.equal(buildAdminAction('owner', 'player', 'kick', '   ', {}), null);
  assert.equal(buildAdminAction('owner', 'player', 'kick', 'sam', { reason: 'x'.repeat(501) }), null);
});
