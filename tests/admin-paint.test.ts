import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { adminPaintSamples } from '../src/multiplayer/adminPaint';
import { pointToHit } from '../src/multiplayer/surfaces';
import { WorldMultiplayerSession } from '../src/multiplayer/worldSession';

test('admin paint scanlines cover an eight-metre wall patch with a bounded endpoint count', () => {
  const geometry = new THREE.PlaneGeometry(10, 10);
  const mesh = new THREE.Mesh(geometry);
  const wall: any = { mesh, faceDimensions: [{ width: 10, height: 10 }], uvScales: [{ u: 1, v: 1 }] };
  const samples = adminPaintSamples(wall, { min: [-4, -4, -0.1], max: [4, 4, 0.1] }, 0.025);
  assert.ok(samples.length > 200 && samples.length <= 250, `expected two endpoints per roller scanline, got ${samples.length}`);
  assert.ok(samples.every(sample => sample.point.x >= -4 && sample.point.x <= 4));
  assert.ok(samples.every(sample => sample.point.y >= -4 && sample.point.y <= 4));
  assert.ok(samples.every(sample => Math.abs(sample.point.z) < 1e-6));
  const rows = new Map<number, number[]>();
  for (const sample of samples) {
    const row = Math.round(sample.point.x * 1000);
    rows.set(row, [...(rows.get(row) ?? []), sample.point.y]);
  }
  const rowXs = [...rows.keys()].sort((a, b) => a - b);
  assert.ok(rowXs.length >= 110, `expected at least 110 scanlines, got ${rowXs.length}`);
  assert.ok(rowXs.every((row, index) => index === 0 || row - rowXs[index - 1] <= 71));
  assert.ok([...rows.values()].some(points => Math.min(...points) < -3.9 && Math.max(...points) > 3.9));
  assert.deepEqual(adminPaintSamples(wall, { min: [-4, -4, -0.1], max: [4, 4, 0.1] }, 0.025, 100), []);
});

test('scanline endpoints on a rotated wall remain clipped to the piece AABB and loaded face', () => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8));
  mesh.rotation.z = Math.PI / 4;
  mesh.updateMatrixWorld(true);
  const wall: any = { mesh, faceDimensions: [{ width: 8, height: 8 }], uvScales: [{ u: 1, v: 1 }] };
  const bounds = { min: [-3, -3, -0.1] as [number, number, number], max: [3, 3, 0.1] as [number, number, number] };
  const samples = adminPaintSamples(wall, bounds);
  assert.ok(samples.length > 50 && samples.length < 400);
  for (const sample of samples) {
    assert.ok(Math.abs(sample.point.x) <= 3 + 1e-4 && Math.abs(sample.point.y) <= 3 + 1e-4);
    assert.ok(Math.abs(sample.point.z) <= 0.1);
    assert.ok(Number.isFinite(sample.point.x));
    assert.ok(pointToHit(wall, sample.face, { x: sample.point.x, y: sample.point.y, z: sample.point.z, pressure: 1 }));
  }
});

test('admin paint returns no points for bounds outside the loaded wall face', () => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const wall: any = { mesh, faceDimensions: [{ width: 2, height: 2 }], uvScales: [{ u: 1, v: 1 }] };
  assert.deepEqual(adminPaintSamples(wall, { min: [3, 3, -0.1], max: [4, 4, 0.1] }, 0.04), []);
});

test('server-authorized paint-over uses existing strokes and does not delete the source piece', () => {
  const previousSocket = globalThis.WebSocket;
  class Socket {
    readyState = 0; bufferedAmount = 0; onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null; onclose: (() => void) | null = null;
    sent: any[] = [];
    send(data: string) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; this.onclose?.(); }
    receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
  }
  const sockets: Socket[] = [];
  (globalThis as any).WebSocket = class extends Socket { constructor() { super(); sockets.push(this); } };
  const scene = new THREE.Scene();
  const playerPosition = new THREE.Vector3();
  const world: any = { scene, walls: [], colliders: [], playerPosition, playerYaw: 0, playerPitch: 0, paintRevision: 0, setPaintSession() {} };
  const session = new WorldMultiplayerSession(world, () => {});
  try {
    session.join('Admin');
    const socket = sockets[0]; socket.readyState = 1;
    socket.receive({ type: 'hello', protocol: 2, playerId: 'admin-id' });
    socket.receive({ type: 'world_snapshot', playerId: 'admin-id', roomId: 'public', strokes: [], players: [],
      graffitiPieces: [{ pieceId: 'source', anchor: [0, 0, 0], bounds: { min: [-0.5, -0.5, -0.1], max: [0.5, 0.5, 0.1] }, strokeIds: [] }] });
    assert.equal(session.adminPaintOver('source', '#ffffff'), false, 'players cannot paint over without server authority');
    socket.receive({ type: 'permissions', role: 'admin', permissions: ['bypass_graffiti_protection'] });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const canvas = { width: 256, height: 256 };
    const context: any = { canvas, save() {}, restore() {}, setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, fillRect() {} };
    const layer: any = { mesh, textures: [{ needsUpdate: false }], ensureFace: () => context };
    const wall: any = { surfaceId: 'ss1:0:0:plane', mesh, uvScales: [{ u: 1, v: 1 }], faceDimensions: [{ width: 2, height: 2 }], layers: [layer], createLayer: () => { wall.layers.push(layer); return layer; } };
    world.walls = [wall];
    assert.equal(session.adminPaintOver('source', '#ffffff'), true);
    assert.ok(socket.sent.some(message => message.type === 'piece_create'));
    assert.ok(socket.sent.some(message => message.type === 'stroke_begin' && message.tool === 'roller' && message.colour === '#ffffff' && message.layerIndex === 4));
    assert.ok(socket.sent.some(message => message.type === 'stroke_points'));
    assert.ok(socket.sent.some(message => message.type === 'stroke_end'));
    assert.ok(socket.sent.some(message => message.type === 'piece_complete'));
    assert.ok(!socket.sent.some(message => message.type === 'admin_delete_piece'));
  } finally { session.dispose(); globalThis.WebSocket = previousSocket; }
});
