// Opt-in only: one tiny real floor stroke in public verifies persistence on the existing server.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MultiplayerConnection } from '../src/multiplayer/connection';
import { MULTIPLAYER_URL } from '../src/multiplayer/config';
import { PaintSync } from '../src/multiplayer/paintSync';
import { createCityChunk } from '../src/game/cityChunkContent';
import { encodeSurface } from '../src/multiplayer/surfaces';
import { readPlayer, readStroke } from '../src/multiplayer/protocol';

(globalThis as any).document = { createElement: () => ({ width: 1, height: 1 }) };
async function until(check: () => boolean, label: string) {
  const end = Date.now() + 12_000;
  while (Date.now() < end) { if (check()) return; await new Promise(r => setTimeout(r, 30)); }
  throw new Error('Timed out: ' + label);
}
function peer(name: string) {
  const messages: any[] = [];
  const status: any[] = [];
  const connection = new MultiplayerConnection(MULTIPLAYER_URL, s => status.push(s), m => messages.push(m));
  connection.connect(name, 'public');
  return { connection, messages, status };
}
test('existing live server: two players, state, shared stroke, late join and clean departure', { timeout: 45_000 }, async () => {
  const a = peer('Integration check A');
  let b: ReturnType<typeof peer> | null = null;
  let later: ReturnType<typeof peer> | null = null;
  try {
    await until(() => a.connection.connected, 'first join');
    b = peer('Integration check B');
    await until(() => b!.connection.connected, 'second join');
    await until(() => a.messages.some(m => m.type === 'player_joined'), 'remote join');
    const joined = a.messages.find(m => m.type === 'player_joined');
    assert.equal(readPlayer(joined.player)?.playerId, b.connection.playerId);
    a.connection.send({ type: 'player_state', state: { position: [0, 1.72, 0], rotation: [0, 0.2, 0], movement: 'idle', tool: 'spray', jumping: false } });
    await until(() => b!.messages.some(m => m.type === 'player_state' && m.playerId === a.connection.playerId), 'remote transform');
    const remoteState = b.messages.find(m => m.type === 'player_state' && m.playerId === a.connection.playerId);
    assert.deepEqual(remoteState?.state?.position, [0, 1.72, 0], 'server preserves actual position, not just the event type');
    const material = new THREE.MeshStandardMaterial();
    const chunk = createCityChunk(0, 0, { wallMaterial: material, groundMaterial: material, railMaterial: material, glassMaterial: material });
    chunk.group.updateMatrixWorld(true);
    const wall = chunk.walls[0];
    const one = wall.mesh.localToWorld(new THREE.Vector3(0.85, 0.85, 0));
    const two = wall.mesh.localToWorld(new THREE.Vector3(0.88, 0.85, 0));
    const sync = new PaintSync({ send: m => a.connection.send(m), draw: () => {}, reset: () => {} });
    const sample = (v: THREE.Vector3) => ({
      surfaceId: encodeSurface(wall.surfaceId!, 0, 0), colour: '#8b8982', tool: 'spray', brushSize: 1,
      point: { x: v.x, y: v.y, z: v.z, pressure: 0.05 },
    });
    const local = sync.sample(sample(one), false); sync.sample(sample(two), true); sync.end();
    await until(() => b!.messages.some(m => m.type === 'stroke_end' && m.strokeId === local.stroke.strokeId), 'remote stroke end');
    const begin = b.messages.find(m => m.type === 'stroke_begin' && (m.stroke?.strokeId ?? m.stroke?.id) === local.stroke.strokeId);
    assert.ok(readStroke(begin?.stroke), 'saved stroke shape is understood by the actual client');
    const points = b.messages.find(m => m.type === 'stroke_points' && m.strokeId === local.stroke.strokeId);
    assert.equal(points?.points.length, 2);
    later = peer('Integration check late join');
    await until(() => later!.connection.connected, 'late join');
    const snapshot = later.messages.find(m => m.type === 'world_snapshot');
    const persisted = snapshot.strokes.map(readStroke).find(s => s?.strokeId === local.stroke.strokeId);
    assert.deepEqual(persisted?.points, local.stroke.points);
    assert.equal(persisted?.surfaceId, local.stroke.surfaceId);
    assert.equal(persisted?.brushSize, local.stroke.brushSize);
    const leavingId = b.connection.playerId; b.connection.disconnect();
    await until(() => a.messages.some(m => m.type === 'player_left' && m.playerId === leavingId), 'departure');
    console.log('Live protocol shapes:', JSON.stringify({ joined, begin, points, persisted }));
  } finally {
    a.connection.disconnect(); b?.connection.disconnect(); later?.connection.disconnect();
  }
});
