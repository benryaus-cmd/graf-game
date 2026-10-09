import assert from 'node:assert/strict';
import test from 'node:test';
import { MultiplayerConnection } from '../src/multiplayer/connection';
import { readPlayer } from '../src/multiplayer/protocol';

class Socket {
  readyState = 1; bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

test('protocol 2 join carries separate Aippy identity fields and preserves the server UUID', () => {
  const socket = new Socket();
  const connection = new MultiplayerConnection('wss://example.test', () => {}, () => {}, () => socket);
  connection.connect('Pink', 'public', { username: 'pink-user', nickName: 'Pink' });
  socket.receive({ type: 'hello', playerId: 'assigned-server-uuid', protocol: 2 });
  assert.deepEqual(socket.sent[0], {
    type: 'join', protocol: 2, roomId: 'public', displayName: 'Pink',
    username: 'pink-user', nickName: 'Pink',
    networkRevision: 6, capabilities: ['spatial_interest_v1', 'spatial_world_delta_v1', 'player_directory_v1', 'basketball_court_v1'],
  });
  assert.equal(connection.playerId, 'assigned-server-uuid');
  connection.disconnect();
});

test('protocol 1 keeps the legacy join contract and sends no Aippy identity fields', () => {
  const socket = new Socket();
  const connection = new MultiplayerConnection('wss://example.test', () => {}, () => {}, () => socket);
  connection.connect('Pink', 'public', { username: 'pink-user', nickName: 'Pink' });
  socket.receive({ type: 'hello', playerId: 'server-uuid', protocol: 1 });
  assert.deepEqual(socket.sent[0], { type: 'join', roomId: 'public', displayName: 'Pink' });
  connection.disconnect();
});

test('player parsing retains separate identity fields and falls back to legacy displayName', () => {
  assert.deepEqual(readPlayer({
    id: 'server-uuid', username: 'pink-user', nickName: 'Pink', displayName: 'Legacy label',
  }), {
    playerId: 'server-uuid', username: 'pink-user', nickName: 'Pink', displayName: 'Legacy label', state: undefined,
  });
  assert.deepEqual(readPlayer({ playerId: 'old-player', displayName: 'Old Client' }), {
    playerId: 'old-player', displayName: 'Old Client', username: undefined, nickName: undefined, state: undefined,
  });
  assert.equal(readPlayer({ id: 'new-player', username: 'new-user', nickName: 'New Name' })?.displayName, 'New Name');
});

test('player parsing retains only valid server role values', () => {
  assert.equal(readPlayer({ playerId: 'p1', username: 'artist', role: 'moderator' })?.role, 'moderator');
  assert.equal(readPlayer({ playerId: 'p1', username: 'artist', role: 'ownerish' })?.role, undefined);
});
