import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MultiplayerConnection } from '../src/multiplayer/connection';
import { PaintSync } from '../src/multiplayer/paintSync';
import { assignSurfaceIds, encodeSurface, decodeSurface, pointToHit } from '../src/multiplayer/surfaces';
import { interpolatePlayer } from '../src/multiplayer/playerSync';
import { createCityChunk } from '../src/game/cityChunkContent';
import { createCityChunkStream } from '../src/game/cityChunks';
import { stampPaintHit } from '../src/game/worldPainting';
import { aippyDisplayName } from '../src/multiplayer/profile';
import { PaintReplay, renderNetworkPoint } from '../src/multiplayer/paintReplay';
import { WorldMultiplayerSession } from '../src/multiplayer/worldSession';
import { sprayOnWall } from '../src/game/worldPainting';
import { restorePersistentChunkPaint } from '../src/game/paintPersistence';

// Minimal browser canvas fixture. Geometry/session tests do not need a GPU.
function canvasFixture() {
  const canvas: any = { width: 1, height: 1 };
  let path: unknown[] = [];
  const context: any = {
    canvas, draws: [], globalAlpha: 1, globalCompositeOperation: 'source-over',
    save() {}, restore() {}, setTransform() {}, fillRect() {}, fillText() {},
    beginPath() { path = []; },
    moveTo(...args: number[]) { path.push(['move', ...args]); },
    lineTo(...args: number[]) { path.push(['line', ...args]); },
    arc(...args: number[]) { path.push(['arc', ...args]); },
    stroke() { this.draws.push({ path: [...path], alpha: this.globalAlpha, width: this.lineWidth, colour: this.strokeStyle, operation: this.globalCompositeOperation }); },
    fill() { this.draws.push({ path: [...path], alpha: this.globalAlpha, width: this.lineWidth, colour: this.fillStyle, operation: this.globalCompositeOperation }); },
    clearRect() { this.draws = []; },
    drawImage(source: any) { this.draws.push(...(source.getContext ? source.getContext('2d').draws : source.draws ?? [])); },
    getImageData() { return { width: 1, height: 1, data: new Uint8ClampedArray([0,0,0,this.draws.length ? 255 : 0]) }; },
    putImageData() {},
  };
  canvas.getContext = () => context; canvas.toDataURL = () => 'data:image/png;base64,fixture';
  return canvas;
}
(globalThis as any).document = { createElement: () => canvasFixture() };
(globalThis as any).window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };

class Socket {
  readyState = 0; bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: any[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  receive(value: any) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

test('solo creates no socket; explicit connect joins after server hello, not before', () => {
  const sockets: Socket[] = [];
  const states: any[] = [];
  const connection = new MultiplayerConnection('wss://example.test', s => states.push(s), () => {}, () => {
    const socket = new Socket(); sockets.push(socket); return socket;
  });
  assert.equal(sockets.length, 0);
  connection.connect('Alice', 'public');
  const socket = sockets[0]; socket.readyState = 1; socket.onopen?.();
  assert.deepEqual(socket.sent, []);
  socket.receive({ type: 'hello', playerId: 'assigned-by-server', protocol: 1 });
  assert.deepEqual(socket.sent[0], { type: 'join', roomId: 'public', displayName: 'Alice' });
  assert.equal(connection.send({ type: 'player_state', state: {} }), false);
  socket.receive({ type: 'world_snapshot', roomId: 'public', playerId: 'assigned-by-server', strokes: [], players: [] });
  assert.equal(connection.playerId, 'assigned-by-server');
  assert.equal(connection.connected, true);
  socket.close();
  assert.equal(connection.connected, false);
  assert.equal(states.at(-1).phase, 'disconnected');
  connection.disconnect();
  assert.equal(states.at(-1).phase, 'solo');
});

test('upgraded protocol 2 joins using the existing messages and accepts its expanded snapshot', () => {
  const socket = new Socket();
  const states: any[] = []; const messages: any[] = [];
  const connection = new MultiplayerConnection('wss://example.test', s => states.push(s), m => messages.push(m), () => socket);
  connection.connect('Aippy nickname', 'public'); socket.readyState = 1;
  socket.receive({ type: 'hello', playerId: 'server-v2-id', protocol: 2, serverTime: 123,
    capabilities: ['presence', 'movement', 'paint', 'eraser', 'chat', 'artwork', 'world_items', 'inventory', 'trading', 'reports', 'resync'] });
  assert.deepEqual(socket.sent[0], { type: 'join', roomId: 'public', displayName: 'Aippy nickname' });
  socket.receive({ type: 'world_snapshot', protocol: 2, roomId: 'public', playerId: 'server-v2-id',
    revision: 5, sequence: 10, serverTime: 124, playerCount: 1, strokes: [], players: [],
    artworks: [], worldItems: [], graffitiPieces: [], chatHistory: [] });
  assert.equal(connection.connected, true);
  assert.equal(connection.playerId, 'server-v2-id');
  assert.equal(states.at(-1).phase, 'connected');
  assert.equal(messages[0].type, 'world_snapshot');
  connection.disconnect();
});

test('unknown protocol versions are rejected before joining', () => {
  const socket = new Socket(); const states: any[] = [];
  const connection = new MultiplayerConnection('wss://example.test', s => states.push(s), () => {}, () => socket);
  connection.connect('Player', 'public'); socket.readyState = 1;
  socket.receive({ type: 'hello', playerId: 'server-id', protocol: 999 });
  assert.equal(socket.sent.length, 0);
  assert.equal(connection.connected, false);
  assert.equal(states.at(-1).phase, 'disconnected');
  assert.match(states.at(-1).notice, /Unsupported multiplayer protocol/);
});

test('old socket messages cannot change a reconnected session; send backpressure disconnects safely', () => {
  const sockets: Socket[] = [];
  const connection = new MultiplayerConnection('wss://example.test', () => {}, () => {}, () => {
    const s = new Socket(); sockets.push(s); return s;
  });
  connection.connect('Alice', 'public');
  const old = sockets[0]; const delayed = old.onmessage!;
  connection.connect('Alice', 'public');
  delayed({ data: JSON.stringify({ type: 'hello', playerId: 'obsolete', protocol: 1 }) });
  assert.notEqual(connection.playerId, 'obsolete');
  const socket = sockets[1]; socket.readyState = 1;
  socket.receive({ type: 'hello', playerId: 'new-id', protocol: 1 });
  socket.receive({ type: 'world_snapshot', roomId: 'public', playerId: 'new-id', strokes: [], players: [] });
  socket.bufferedAmount = 300_000;
  assert.equal(connection.send({ type: 'stroke_end', strokeId: 'x' }), false);
  assert.equal(connection.connected, false);
  connection.disconnect();
});

const point = (x: number) => ({ x, y: 0, z: 0, pressure: 0.88 });
const sample = (x: number) => ({
  surfaceId: 'ss1:0:0:wall/f4/l0', colour: '#ff0000', tool: 'spray',
  brushSize: 0.1, point: point(x),
});

test('painting is recorded immediately without network; echoes never redraw local paint', () => {
  const sent: any[] = []; const rendered: any[] = [];
  let online = false;
  const sync = new PaintSync({
    send: m => { if (!online) return false; sent.push(m); return true; },
    draw: (stroke, points) => rendered.push({ stroke, points }), reset: () => {},
  });
  const local = sync.sample(sample(0), false);
  assert.equal(local.stroke.points.length, 1);
  assert.equal(rendered.length, 0); // existing brush already drew it before this hook
  sync.end();
  online = true;
  const next = sync.sample(sample(1), false); sync.sample(sample(2), true);
  sync.flush(1000); sync.end();
  assert.equal(sent[0].type, 'stroke_begin');
  const batches = sent.filter(m => m.type === 'stroke_points');
  assert.deepEqual(batches[0].points, [point(1), point(2)]);
  sync.accept({ type: 'stroke_begin', stroke: { ...next.stroke, points: [] } });
  sync.accept({ type: 'stroke_points', strokeId: next.stroke.strokeId, playerId: 'server-id', points: [point(1), point(2)] });
  sync.accept({ type: 'stroke_end', strokeId: next.stroke.strokeId });
  assert.equal(rendered.length, 0);
});

test('network batches stay within point limits and long gestures split below server stroke limit', () => {
  const sent: any[] = [];
  const sync = new PaintSync({ send: m => { sent.push(m); return true; }, draw: () => {}, reset: () => {} });
  for (let i = 0; i < 20_500; i++) {
    sync.sample(sample(i), i > 0);
    if (i % 60 === 0) sync.flush(i * 16);
  }
  sync.end();
  assert.ok(sent.filter(m => m.type === 'stroke_begin').length > 1);
  const totals = new Map<string, number>();
  for (const m of sent.filter(m => m.type === 'stroke_points')) {
    assert.ok(m.points.length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(m)) < 64 * 1024);
    totals.set(m.strokeId, (totals.get(m.strokeId) ?? 0) + m.points.length);
  }
  assert.ok([...totals.values()].every(count => count <= 20_000));
  assert.equal([...totals.values()].reduce((a, b) => a + b, 0), 20_500);
});

test('snapshot replays remote paint once and retains local points absent from a partial acknowledgement', () => {
  const drawn: any[] = []; let resets = 0;
  const sync = new PaintSync({ send: () => true, draw: (s, points) => drawn.push({ s, points }), reset: () => { resets++; } });
  const local = sync.sample(sample(1), false); sync.sample(sample(2), true); sync.end();
  const remote = { ...local.stroke, strokeId: 'remote', playerId: 'other', points: [point(3)] };
  sync.snapshot([{ ...local.stroke, points: [point(1)] }, remote]);
  assert.equal(resets, 1);
  assert.equal(drawn.length, 2);
  assert.deepEqual(sync.strokes.get(local.stroke.strokeId)?.points, [point(1), point(2)]);
  assert.deepEqual(sync.strokes.get('remote')?.points, [point(3)]);
  sync.snapshot([{ ...local.stroke, points: [point(1), point(2)] }, remote]);
  assert.equal(sync.strokes.size, 2);
});

test('remote batch rendering connects to previous sample and ignores repeated begins', () => {
  const drawn: any[] = [];
  const sync = new PaintSync({ send: () => true, draw: (s, points, previous) => drawn.push({ s, points, previous }), reset: () => {} });
  const stroke = { ...sample(0), strokeId: 'remote', playerId: 'other', points: [] };
  sync.accept({ type: 'stroke_begin', stroke });
  sync.accept({ type: 'stroke_begin', stroke });
  sync.accept({ type: 'stroke_points', strokeId: 'remote', points: [point(1)] });
  sync.accept({ type: 'stroke_points', strokeId: 'remote', points: [point(2)] });
  assert.equal(drawn.length, 2);
  assert.deepEqual(drawn[1].previous, point(1));
});

test('changing colour during a held brush keeps the same continuous path on other clients', () => {
  const sync = new PaintSync({ send: () => true, draw: () => {}, reset: () => {} });
  sync.sample(sample(1), false);
  const changed = sync.sample({ ...sample(2), colour: '#00ff00' }, true);
  assert.deepEqual(changed.previous, point(1));
  sync.end();
});

test('a synchronous disconnect during flush keeps local paint and cannot throw into brush input', () => {
  let sync: PaintSync;
  sync = new PaintSync({
    send: message => { if (message.type === 'stroke_points') { sync.interrupted(); return false; } return true; },
    draw: () => {}, reset: () => {},
  });
  const local = sync.sample(sample(1), false); sync.sample(sample(2), true);
  assert.doesNotThrow(() => sync.end());
  assert.equal(sync.strokes.get(local.stroke.strokeId)?.points.length, 2);
});

test('mid-gesture disconnect keeps the first offline line segment in reconnect replay', () => {
  const drawn: any[] = [];
  const sync = new PaintSync({ send: () => true, draw: (s, points, previous) => drawn.push({ s, points, previous }), reset: () => {} });
  const first = sync.sample(sample(1), false);
  sync.interrupted();
  const continued = sync.sample(sample(2), true);
  assert.deepEqual(continued.previous, point(1));
  sync.end(); sync.snapshot([{ ...first.stroke, points: [point(1)] }]);
  assert.equal(drawn.length, 1);
  assert.deepEqual(drawn[0].points, [point(1), point(2)]);
});

function materials() {
  return {
    wallMaterial: new THREE.MeshStandardMaterial(), groundMaterial: new THREE.MeshStandardMaterial(),
    railMaterial: new THREE.MeshStandardMaterial(), glassMaterial: new THREE.MeshStandardMaterial(),
  };
}

test('regenerated procedural walls keep identical IDs, independent of load order and Three UUIDs', () => {
  const a = createCityChunk(2, -3, materials());
  const b = createCityChunk(2, -3, materials());
  assert.deepEqual(a.walls.map(w => w.surfaceId), b.walls.map(w => w.surfaceId));
  assert.equal(new Set(a.walls.map(w => w.surfaceId)).size, a.walls.length);
  assert.notEqual(a.walls[0].mesh.uuid, b.walls[0].mesh.uuid);
  const ids = new Map(a.walls.map(w => [w.mesh, w.surfaceId]));
  assignSurfaceIds(2, -3, [...a.walls].reverse());
  for (const wall of a.walls) assert.equal(wall.surfaceId, ids.get(wall.mesh));
  const encoded = encodeSurface(a.walls[0].surfaceId!, 0, 3);
  assert.deepEqual(decodeSurface(encoded), { wallId: a.walls[0].surfaceId, face: 0, layer: 3 });
});

test('world-space samples reconstruct the exact UV on rotated/tiled box faces', () => {
  const chunk = createCityChunk(0, 0, materials());
  chunk.group.updateMatrixWorld(true);
  const wall = chunk.walls.find(w => w.mesh.geometry.type === 'BoxGeometry')!;
  const bounds = wall.mesh.geometry.boundingBox ?? (wall.mesh.geometry.computeBoundingBox(), wall.mesh.geometry.boundingBox!);
  const local = new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, bounds.max.y * 0.25, bounds.max.z);
  wall.mesh.rotation.y = 0.4; chunk.group.updateMatrixWorld(true);
  const worldPoint = wall.mesh.localToWorld(local.clone());
  const hit = pointToHit(wall, 4, { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z, pressure: 1 });
  assert.ok(hit?.uv);
  assert.ok(Math.abs(hit!.uv!.x / wall.uvScales[4].u - 0.5) < 1e-5);
  assert.equal(pointToHit(wall, 0, { x: 999999, y: 0, z: 0, pressure: 1 }), null);
});

test('remote movement is interpolated and yaw takes the short path across wraparound', () => {
  const current = { position: [0, 1, 0], rotation: [0, Math.PI - 0.05, 0] };
  const target = { position: [10, 1, 0], rotation: [0, -Math.PI + 0.05, 0] };
  const next = interpolatePlayer(current, target, 0.016);
  assert.ok(next.position[0] > 0 && next.position[0] < 10);
  assert.ok(Math.abs(next.rotation[1] - current.rotation[1]) < 0.05);
  assert.deepEqual(interpolatePlayer(current, target, 0).position, current.position);
});

test('switching paint sessions never saves multiplayer chunks into solo storage', () => {
  const stream = createCityChunkStream(new THREE.Scene(), materials());
  const stored: string[] = [];
  (globalThis as any).window = {
    localStorage: { getItem: () => null, setItem: (key: string) => stored.push(key), removeItem: () => {} },
  };
  stream.updateAt(0, 0);
  const soloWall = stream.walls[0];
  stream.setPaintSession('multiplayer');
  assert.ok(stream.walls[0] === soloWall, 'joining keeps the existing world geometry');
  stream.walls[0].dirty = true;
  stream.savePaint(); stream.updateAt(100, 100);
  assert.equal(stored.length, 0);
  stream.setPaintSession('solo');
  assert.ok(stream.walls.length > 0);
});

test('Aippy profile defaults prefer nickname, then handle, never a raw UID', () => {
  assert.equal(aippyDisplayName({ nickName: 'Pink', username: 'pink-user' }), 'Pink');
  assert.equal(aippyDisplayName({ nickName: '', username: 'pink-user' }), '@pink-user');
  assert.equal(aippyDisplayName({}), 'PLAYER');
});

test('server brush units reconstruct the same local paint path, width, opacity, layer and eraser', () => {
  const chunk = createCityChunk(0, 0, materials()); chunk.group.updateMatrixWorld(true);
  const wall = chunk.walls.find(w => w.mesh.geometry.type === 'BoxGeometry')!;
  wall.mesh.geometry.computeBoundingBox();
  const bounds = wall.mesh.geometry.boundingBox!;
  const locations = [-0.1, 0.1].map(x => {
    const v = wall.mesh.localToWorld(new THREE.Vector3(x, 0, bounds.max.z));
    return { x: v.x, y: v.y, z: v.z, pressure: 0.88 };
  });
  for (const tool of ['spray', 'eraser']) {
    let previous = null;
    for (const point of locations) {
      previous = stampPaintHit(wall, pointToHit(wall, 4, point)!, '#ff0000', point.pressure, 5 / 50, 1, previous, true, tool === 'eraser');
    }
    const context: any = wall.layers[1].ensureFace(4)!;
    const localDraws = [...context.draws]; context.draws = [];
    const stroke = { strokeId: 'recorded-server-stroke', surfaceId: encodeSurface(wall.surfaceId!, 4, 1), colour: '#ff0000', tool, brushSize: 5, points: locations };
    locations.forEach((point, i) => renderNetworkPoint(wall, 4, 1, stroke, point, locations[i - 1] ?? null, [true,true]));
    assert.deepEqual(context.draws, localDraws);
    context.draws = [];
  }
});

test('offscreen snapshot replay retains paint made during replay without double deposition', () => {
  const chunk = createCityChunk(0, 0, materials()); chunk.group.updateMatrixWorld(true);
  const wall = chunk.walls[0];
  const v = wall.mesh.localToWorld(new THREE.Vector3(1, 1, 0));
  const point = { x: v.x, y: v.y, z: v.z, pressure: 0.88 };
  const stroke = { strokeId: 'remote', surfaceId: encodeSurface(wall.surfaceId!, 0, 0), colour: '#ff0000', tool: 'spray', brushSize: 5, points: [point] };
  const context: any = wall.layers[0].ensureFace(0);
  context.draws.push('visible old paint');
  const replay = new PaintReplay(() => [true]);
  replay.rebuild(wall); replay.enqueue(wall, stroke, [point], null);
  assert.deepEqual(context.draws, ['visible old paint'], 'loading never clears the visible canvas');
  const fresh = { ...point, x: point.x + 0.2 };
  stampPaintHit(wall, pointToHit(wall, 0, fresh)!, '#00ff00', 0.88, 0.1, 0);
  const local = { ...stroke, strokeId: 'local', colour: '#00ff00', points: [fresh] };
  replay.enqueue(wall, local, [fresh], null);
  for (let i = 0; i < 10 && replay.isRebuilding(wall); i++) replay.update();
  assert.equal(replay.isRebuilding(wall), false);
  assert.equal(context.draws.length, 2);
  assert.equal(context.draws[1].colour, '#00ff00');
});

test('delayed solo image decoding cannot contaminate a multiplayer session', () => {
  const chunk = createCityChunk(0, 0, materials());
  new THREE.Scene().add(chunk.group);
  const images: any[] = [];
  (globalThis as any).Image = class { onload: () => void; set src(_s: string) { images.push(this); } };
  (globalThis as any).window = { localStorage: { getItem: () => JSON.stringify({ 0: [['data:image/png;base64,old']] }) } };
  let isSolo = true;
  restorePersistentChunkPaint('0:0', chunk, () => false, () => isSolo);
  assert.equal(images.length, 1);
  isSolo = false;
  images[0].onload();
  assert.equal(chunk.walls[0].layers[0].contexts[0], null);
  (globalThis as any).window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
});

for (const storageFails of [false, true]) test(`partial solo PNG decoding preserves old faces and new overlay through multiplayer join/leave (storage fails: ${storageFails})`, (t) => {
  if (storageFails) t.mock.method(console, 'warn', () => {});
  const images: any[] = [];
  (globalThis as any).Image = class {
    onload: () => void; draws: any[] = [];
    set src(source: string) { this.draws = [{ source }]; images.push(this); }
  };
  const storage = new Map<string, string>();
  const rootKey = 'sidestreet_world_paint_v1:0:0';
  const base = ['data:image/png;base64,original0', 'data:image/png;base64,original1'];
  storage.set(rootKey, JSON.stringify({ 1: [base] }));
  (globalThis as any).window = { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (storageFails) throw new Error('Storage quota exceeded');
      storage.set(key, value);
    },
    removeItem: (key: string) => storage.delete(key),
  } };
  const stream = createCityChunkStream(new THREE.Scene(), materials()); stream.updateAt(0,0);
  images[0].onload(); // face0 ready, face1 still decoding
  const wall = stream.walls.find(w => w.layers[0].contexts[0] !== null)!;
  (wall.layers[0].ensureFace(1) as any).draws.push({ source: 'new local paint before original decoded' });
  wall.dirty = true;
  stream.setPaintSession('multiplayer');
  const persisted = JSON.parse(storage.get(rootKey)!);
  if (!storageFails) {
    assert.ok(Array.isArray(persisted['1'][0][1]), 'pending base plus new overlay is retained');
    assert.equal(persisted['1'][0][1][0], base[1]);
    assert.equal(persisted['1'][0][1].length, 2);
  }
  const beforeRestore = images.length;
  stream.setPaintSession('solo');
  for (const image of images.slice(beforeRestore)) image.onload();
  const restored: any = wall.layers[0].contexts[1];
  assert.ok(restored.draws.some(d => d.source === base[1]), 'old face survived joining');
  assert.ok(restored.draws.length >= 2, 'new local overlay survived too');
  (globalThis as any).window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
});

test('existing brush renders before network send; session integrates remote avatars and preserves offline controls', () => {
  const sockets: Socket[] = [];
  const previousSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = class extends Socket { constructor() { super(); sockets.push(this); } };
  const scene = new THREE.Scene();
  const stream = createCityChunkStream(scene, materials()); stream.updateAt(0, 0);
  const world: any = {
    scene, walls: stream.walls, setPaintSession: stream.setPaintSession,
    playerPosition: new THREE.Vector3(0, 1.72, 0), playerYaw: 0, playerPitch: 0,
    velocityY: 0, abilityActive: false, paintRevision: 0, cameraMode: 'first',
    camera: new THREE.PerspectiveCamera(), renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
  };
  const statuses: any[] = [];
  const session = new WorldMultiplayerSession(world, status => statuses.push(status));
  const settings: any = { paintMode: true, eraseMode: false, color: '#ff0000', opacity: 0.88, brushSize: 5, layerIndex: 0, layerVisibility: [true] };
  try {
    assert.equal(sockets.length, 0);
    session.join('Aippy Nick');
    const socket = sockets[0]; socket.readyState = 1;
    socket.receive({ type: 'hello', playerId: 'server-only-id', protocol: 1 });
    assert.equal(socket.sent[0].displayName, 'Aippy Nick');
    socket.receive({ type: 'world_snapshot', playerId: 'server-only-id', roomId: 'public', strokes: [], players: [] });
    scene.updateMatrixWorld(true);
    const wall = world.walls[0];
    const v = wall.mesh.localToWorld(new THREE.Vector3(1, 1, 0));
    const sample = { x: v.x, y: v.y, z: v.z, pressure: 0.88 };
    const hit = pointToHit(wall, 0, sample)!; hit.distance = 2;
    const context: any = wall.layers[0].ensureFace(0);
    let renderedBeforeSend = false;
    const originalSend = socket.send.bind(socket);
    socket.send = data => { if (JSON.parse(data).type === 'stroke_begin') renderedBeforeSend = context.draws.length > 0; originalSend(data); };
    sprayOnWall(world, { clientX: 50, clientY: 50 } as PointerEvent, settings,
      { setFromCamera() {}, intersectObjects: () => [hit] } as any,
      new THREE.Vector2(), [wall.mesh], new Map([[wall.mesh, wall]]), () => {}, () => {}, { current: 0 }, { current: null });
    assert.equal(renderedBeforeSend, true);
    assert.equal(socket.sent.find(m => m.type === 'stroke_begin').brushSize, 5);
    world.onPaintEnd();
    socket.receive({ type: 'player_joined', player: { id: 'remote', displayName: 'Other Aippy User', state: {} } });
    socket.receive({ type: 'player_state', playerId: 'remote', state: { position: [3,1.72,-4], rotation: [0,0,0], movement: 'walking', jumping: false } });
    world.onMultiplayerFrame(0.016, settings);
    const avatar = scene.children.find(child => child.userData.parts)!;
    assert.ok(avatar.visible); assert.equal(avatar.position.x, 3);
    socket.receive({ type: 'player_state', playerId: 'remote', state: { position: [6,1.72,-4], rotation: [0,1,0], movement: 'walking' } });
    world.onMultiplayerFrame(0.016, settings);
    assert.ok(avatar.position.x > 3 && avatar.position.x < 6);
    assert.equal(world.playerPosition.x, 0);
    socket.receive({ type: 'player_left', playerId: 'remote' });
    assert.equal(avatar.parent, null);
    socket.close();
    assert.equal(statuses[statuses.length - 1].phase, 'disconnected');
    const count = context.draws.length;
    sprayOnWall(world, { clientX: 50, clientY: 50 } as PointerEvent, settings,
      { setFromCamera() {}, intersectObjects: () => [hit] } as any,
      new THREE.Vector2(), [wall.mesh], new Map([[wall.mesh, wall]]), () => {}, () => {}, { current: 0 }, { current: null });
    assert.equal(context.draws.length, count + 1, 'offline brush still renders');
    session.leave();
    assert.equal(statuses[statuses.length - 1].phase, 'solo');
    assert.ok(world.walls[0] === wall, 'same world survives joining and leaving');
  } finally { session.dispose(); globalThis.WebSocket = previousSocket; }
});
