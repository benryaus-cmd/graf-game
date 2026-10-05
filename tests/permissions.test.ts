import test from 'node:test';
import assert from 'node:assert/strict';
import { canAssignRole, canDeletePieces, canManageRole, readPermissions } from '../src/multiplayer/permissions';

test('server permissions authorize only wildcard or remove_graffiti', () => {
  assert.deepEqual(readPermissions({ type: 'permissions', role: 'admin', permissions: ['remove_graffiti', 'kick'] }), {
    role: 'admin', permissions: ['remove_graffiti', 'kick'],
  });
  assert.equal(canDeletePieces(readPermissions({ type: 'permissions', role: 'player', permissions: ['kick'] })), false);
  assert.equal(canDeletePieces(readPermissions({ type: 'permissions', role: 'moderator', permissions: ['remove_graffiti'] })), true);
  assert.equal(canDeletePieces(readPermissions({ type: 'permissions', role: 'owner', permissions: ['*'] })), true);
});

test('malformed or absent server permission payload grants nothing', () => {
  assert.equal(readPermissions({ type: 'permissions', role: 'player', permissions: 'remove_graffiti' }), null);
  assert.equal(readPermissions({ type: 'permissions', role: 'superuser', permissions: ['*'] }), null);
  assert.equal(readPermissions(null), null);
});

test('server role gates allow owner all roles and admin all except owner', () => {
  for (const role of ['player', 'moderator', 'admin', 'owner'] as const) assert.equal(canAssignRole('owner', role), true);
  for (const role of ['player', 'moderator', 'admin'] as const) assert.equal(canAssignRole('admin', role), true);
  assert.equal(canAssignRole('admin', 'owner'), false);
  assert.equal(canAssignRole('moderator', 'player'), false);
  assert.equal(canAssignRole(undefined, 'admin'), false);
  assert.equal(canManageRole('admin', 'owner', 'admin'), false);
  assert.equal(canManageRole('owner', 'owner', 'admin'), true);
  assert.equal(canManageRole('admin', undefined, 'admin'), true);
});
