import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MultiplayerConnection } from '../src/multiplayer/connection';
import { PaintSync } from '../src/multiplayer/paintSync';
import { StrokeIndex } from '../src/multiplayer/strokeIndex';
import { assignSurfaceIds, encodeSurface, decodeSurface, pointToHit } from '../src/multiplayer/surfaces';
import { interpolatePlayer } from '../src/multiplayer/playerSync';
import { createCityChunk } from '../src/game/cityChunkContent';
import { createCityChunkStream } from '../src/game/cityChunks';
import { stampPaintHit } from '../src/game/worldPainting';
import { aippyDisplayName } from '../src/multiplayer/profile';
import { PaintReplay, renderNetworkPoint } from '../src/multiplayer/paintReplay';
import { WorldMultiplayerSession } from '../src/multiplayer/worldSession';
import { selectPaintWorkspaceFace } from '../src/game/paintWorkspace';
import { sprayOnWall } from '../src/game/worldPainting';
import { restorePersistentChunkPaint } from '../src/game/paintPersistence';
import { readCosmetics, readPlayer, readPlayerState, readStroke } from '../src/multiplayer/protocol';
import { ArtworkUpload, posterBlob } from '../src/multiplayer/artworkUpload';
import { ArtworkSync, readArtwork } from '../src/multiplayer/artworkSync';
import liveContract from './fixtures/protocol2.json';
import { addPosterOverlay } from '../src/game/posterOverlay';
import { RemotePlayers } from '../src/multiplayer/remotePlayers';
import { ChatSync } from '../src/multiplayer/chat';
import { WorldOrder } from '../src/multiplayer/worldOrder';
import { AccountFeatures } from '../src/multiplayer/accountFeatures';

// Minimal browser canvas fixture. Geometry/session tests do not need a GPU.
function canvasFixture() {
  const canvas: any = { width: 1, height: 1 };
  let path: unknown[] = [];
  const context: any = {
    canvas, draws: [], globalAlpha: 1, globalCompositeOperation: 'source-over',
    save() {}, restore() {}, setTransform() {}, fillRect() {}, rect() {}, clip() {}, strokeRect() {}, fillText() {}, measureText(value: string) { return { width: value.length * 12 }; },
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
const fixtureElements = new Map<string, any>();
(globalThis as any).document = {
  getElementById: (id: string) => fixtureElements.get(id) ?? null,
  body: { appendChild(element: any) { fixtureElements.set(element.id, element); } },
  createElement: (tag: string) => tag === 'canvas' ? canvasFixture() : {
    style: {}, id: '', textContent: '', remove() { fixtureElements.delete(this.id); },
  },
};
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

test('town join preserves identity and rejects a missing or wrong world before accepting state', () => {
  for (const worldId of [undefined, 'original-v1']) {
    const socket = new Socket(), states: any[] = [], received: any[] = [];
    const connection = new MultiplayerConnection('wss://example.test', value => states.push(value), value => received.push(value), () => socket);
    connection.connect('Nickname', 'morning-quarter-v1', { username: 'artist', nickName: 'Nickname' }, [0, 1.7, 0], 'map2-v1');
    socket.readyState = 1;
    socket.receive({ type: 'hello', playerId: 'self', protocol: 2 });
    assert.equal(socket.sent[0].worldId, 'map2-v1');
    assert.equal(socket.sent[0].roomId, 'morning-quarter-v1');
    assert.equal(socket.sent[0].username, 'artist');
    assert.equal(socket.sent[0].nickName, 'Nickname');
    socket.receive({ type: 'account_state', credits: 999 });
    socket.receive({ type: 'world_snapshot', playerId: 'self', roomId: 'morning-quarter-v1', worldId, strokes: [], players: [] });
    assert.equal(connection.connected, false);
    assert.deepEqual(received, []);
    assert.match(states.at(-1).notice, /server.*Town world update/i);
    connection.disconnect();
  }
});

test('town accepts matching snapshot only and never falls back to public', () => {
  const socket = new Socket(), received: any[] = [];
  const connection = new MultiplayerConnection('wss://example.test', () => {}, value => received.push(value), () => socket);
  connection.connect('Artist', 'morning-quarter-v1', {}, [0, 1.7, 0], 'map2-v1');
  socket.readyState = 1;
  socket.receive({ type: 'hello', playerId: 'self', protocol: 2 });
  socket.receive({ type: 'world_snapshot', playerId: 'self', roomId: 'public', worldId: 'map2-v1', strokes: [], players: [] });
  assert.equal(connection.connected, false);
  const snapshot = { type: 'world_snapshot', playerId: 'self', roomId: 'morning-quarter-v1', worldId: 'map2-v1', strokes: [], players: [] };
  socket.receive(snapshot);
  assert.equal(connection.connected, true);
  assert.deepEqual(received, [snapshot]);
  assert.equal(socket.sent.length, 1);
  socket.receive({ ...snapshot, worldId: 'original-v1' });
  assert.equal(connection.connected, false, 'mismatched resync must stop the town session');
  assert.deepEqual(received, [snapshot], 'wrong-world resync cannot reach replay');
  connection.disconnect();
});

test('stroke index returns only a wall bucket in stable sequence order and tracks mutations', () => {
  const index = new StrokeIndex();
  const wallId = (n: number) => `ss1:0:${Math.floor(n / 100)}:wall`;
  const makeStroke = (n: number) => ({ strokeId:`stroke-${n}`, surfaceId:encodeSurface(wallId(n), n % 6, 0),
    colour:'#fff', tool:'spray', brushSize:1, points:[], sequence:10_000 - n });
  for (let n = 0; n < 10_000; n++) index.set(makeStroke(n));
  const bucket = index.forWall(wallId(3));
  assert.equal(bucket.length, 100);
  assert.ok(bucket.every(stroke => decodeSurface(stroke.surfaceId)?.wallId === wallId(3)));
  assert.deepEqual(bucket.map(stroke => stroke.sequence), [...bucket.map(stroke => stroke.sequence)].sort((a, b) => a! - b!));

  const equalA = { ...makeStroke(30_000), strokeId:'equal-a', sequence:7 };
  const equalB = { ...makeStroke(30_001), strokeId:'equal-b', sequence:7 };
  equalA.surfaceId = encodeSurface(wallId(3), 0, 0); equalB.surfaceId = equalA.surfaceId;
  index.set(equalA); index.set(equalB);
  assert.deepEqual(index.forWall(wallId(3)).filter(stroke => stroke.strokeId.startsWith('equal-')).map(stroke => stroke.strokeId), ['equal-a','equal-b']);
  equalA.sequence = 0; index.changed(equalA);
  assert.equal(index.forWall(wallId(3))[0].strokeId, 'equal-a');
  equalA.surfaceId = encodeSurface('ss1:9:9:other', 0, 0); index.changed(equalA);
  assert.ok(!index.forWall(wallId(3)).some(stroke => stroke.strokeId === 'equal-a'));
  assert.equal(index.forWall('ss1:9:9:other')[0].strokeId, 'equal-a');
  index.delete('equal-a'); index.clear();
  assert.deepEqual(index.forWall(wallId(3)), []);
});

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
  assert.deepEqual(socket.sent[0], { type: 'join', protocol: 2, roomId: 'public', displayName: 'Aippy nickname',
    networkRevision: 6, capabilities: ['spatial_interest_v1', 'spatial_world_delta_v1', 'player_directory_v1', 'basketball_court_v1'] });
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

test('fine spray has a four millimetre line width and retains that width through multiplayer replay', () => {
  const chunk = createCityChunk(0, 0, materials()); chunk.group.updateMatrixWorld(true);
  const wall = chunk.walls.find(w => w.mesh.geometry.type === 'BoxGeometry')!;
  wall.mesh.geometry.computeBoundingBox();
  const v = wall.mesh.localToWorld(new THREE.Vector3(0, 0, wall.mesh.geometry.boundingBox!.max.z));
  const point = { x: v.x, y: v.y, z: v.z, pressure: 1 };
  stampPaintHit(wall, pointToHit(wall, 4, point)!, '#ff0000', 1, .1 / 50, 0);
  const ctx: any = wall.layers[0].ensureFace(4)!;
  assert.equal(ctx.draws.at(-1).width, .004);
  const local = [...ctx.draws]; ctx.draws = [];
  renderNetworkPoint(wall, 4, 0, { strokeId: 'fine', surfaceId: encodeSurface(wall.surfaceId!, 4, 0), colour: '#ff0000', tool: 'spray', brushSize: .1, points: [point] }, point, null, [true]);
  assert.deepEqual(ctx.draws, local);
});

test('offscreen snapshot replay retains paint made during replay without double deposition', () => {
  let disposed = 0;
  const disposeTexture = THREE.Texture.prototype.dispose;
  THREE.Texture.prototype.dispose = function() { disposed++; return disposeTexture.call(this); };
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
  THREE.Texture.prototype.dispose = disposeTexture;
  assert.ok(disposed > 0, 'temporary staging textures are disposed after commit');
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

for (const protocol of [1,2]) test(`protocol ${protocol}: brush renders before network, remote avatars and offline controls survive`, () => {
  const sockets: Socket[] = [];
  const previousSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = class extends Socket { constructor() { super(); sockets.push(this); } };
  const scene = new THREE.Scene();
  const stream = createCityChunkStream(scene, materials()); stream.updateAt(0, 0);
  const world: any = {
    scene, walls: stream.walls, colliders: stream.colliders, setPaintSession: stream.setPaintSession,
    playerPosition: new THREE.Vector3(0, 1.72, 0), playerYaw: 0, playerPitch: 0,
    velocityY: 0, abilityActive: false, paintRevision: 0, cameraMode: 'first',
    camera: new THREE.PerspectiveCamera(), renderer: { domElement: { closest: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
  };
  const statuses: any[] = [];
  const session = new WorldMultiplayerSession(world, status => statuses.push(status));
  const settings: any = { paintMode: true, eraseMode: false, color: '#ff0000', opacity: 0.88, brushSize: 5, layerIndex: 0, layerVisibility: [true] };
  try {
    assert.equal(sockets.length, 0);
    session.join('Aippy Nick');
    const socket = sockets[0]; socket.readyState = 1;
    socket.receive({ type: 'hello', playerId: 'server-only-id', protocol });
    assert.equal(socket.sent[0].displayName, 'Aippy Nick');
    socket.receive({ type: 'world_snapshot', playerId: 'server-only-id', roomId: 'public', strokes: [], players: [] });
    scene.updateMatrixWorld(true);
    const wall = world.walls[0];
    const v = wall.mesh.localToWorld(new THREE.Vector3(1, 1, 0));
    const sample = { x: v.x, y: v.y, z: v.z, pressure: 0.88 };
    const hit = pointToHit(wall, 0, sample)!; hit.distance = 2;
    world.playerPosition.copy(hit.point);
    const targetNormal = hit.face!.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(wall.mesh.matrixWorld)).normalize();
    const targetRay = new THREE.Ray(hit.point.clone().addScaledVector(targetNormal, 2), targetNormal.negate());
    const area = selectPaintWorkspaceFace(world, wall, 0, { minU: 0, minV: 0, maxU: 1, maxV: 1 });
    area.selection!.purchaseApproved = true; // This responsiveness fixture starts after confirmed canvas purchase.
    area.selection!.started = true;
    const context: any = wall.layers[0].ensureFace(0);
    let renderedBeforeSend = false;
    const originalSend = socket.send.bind(socket);
    socket.send = data => { if (JSON.parse(data).type === 'stroke_begin') renderedBeforeSend = context.draws.length > 0; originalSend(data); };
    sprayOnWall(world, { clientX: 50, clientY: 50 } as PointerEvent, settings,
      { ray: targetRay, setFromCamera() {}, intersectObjects: () => [hit] } as any,
      new THREE.Vector2(), [wall.mesh], new Map([[wall.mesh, wall]]), () => {}, () => {}, { current: 0 }, { current: null });
    assert.equal(renderedBeforeSend, true);
    assert.equal(socket.sent.find(m => m.type === 'stroke_begin').brushSize, 5);
    assert.equal(socket.sent.find(m => m.type === 'stroke_begin').opacity, protocol === 1 ? 1 : 0.88);
    world.onPaintEnd();
    assert.equal(socket.sent.find(m => m.type === 'stroke_points').points[0].pressure, protocol === 1 ? 0.88 : 1);
    world.playerPosition.set(0, 1.72, 0);
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
    world.playerPosition.copy(hit.point);
    sprayOnWall(world, { clientX: 50, clientY: 50 } as PointerEvent, settings,
      { ray: targetRay, setFromCamera() {}, intersectObjects: () => [hit] } as any,
      new THREE.Vector2(), [wall.mesh], new Map([[wall.mesh, wall]]), () => {}, () => {}, { current: 0 }, { current: null });
    assert.equal(context.draws.length, count + 1, 'offline brush still renders');
    session.leave();
    assert.equal(statuses[statuses.length - 1].phase, 'solo');
    assert.ok(world.walls[0] === wall, 'same world survives joining and leaving');
  } finally { session.dispose(); globalThis.WebSocket = previousSocket; }
});


test('protocol 2 paint metadata survives capture and replay, including erase operation and opacity', () => {
  const sent: any[] = [];
  const sync = new PaintSync({ send: m => { sent.push(m); return true; }, draw: () => {}, reset: () => {} });
  sync.sample({ ...sample(0), operation: 'erase', opacity: 0.4, layerIndex: 2, face: '4', tool: 'eraser' } as any, false);
  assert.equal(sent[0].operation, 'erase');
  assert.equal(sent[0].opacity, 0.4);
  assert.equal(sent[0].layerIndex, 2);
  assert.equal(sent[0].face, '4');
  const stroke = readStroke({ id: 's', surfaceId: 'ss1:0:0:wall/f4/l2', operation: 'erase', opacity: 0.4,
    colour: '#ffffff', tool: 'spray', brushSize: 3, layerIndex: 2, face: '4', sequence: 10, revision: 8, points: [point(0)] });
  assert.equal((stroke as any).operation, 'erase');
  assert.equal((stroke as any).opacity, 0.4);
  assert.equal((stroke as any).sequence, 10);
  sync.end();
});

test('protocol 2 retains remote cosmetics, emotes and equipped visual state', () => {
  const state = readPlayerState({ position: [0, 1.72, 0], rotation: [0,0,0], movement: 'walking', jumping: true,
    tool: 'spray', animation: 'walking', emote: 'think', visibleHeldItem: 'sprayCan', flightState: 'flying',
    cosmetics: { outfit: 'jax', top: 'teal', bottom: 'denim', accessory: 'sprayCan' } });
  assert.equal((state as any).cosmetics.outfit, 'jax');
  assert.equal((state as any).emote, 'think');
  assert.equal((state as any).visibleHeldItem, 'sprayCan');
  assert.equal((state as any).flightState, 'flying');
});


test('chat snapshot/live messages deduplicate by server ID and retain plain text', () => {
  const sent: any[] = []; const updates: any[] = [];
  const chat = new ChatSync(m => { sent.push(m); return true; }, m => updates.push(m));
  const message = { id: 'chat-1', playerId: 'p', displayName: 'Aippy Name', text: '<img onerror=alert(1)>', timestamp: 123 };
  chat.snapshot([message]); chat.accept({ type: 'chat_message', message });
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].text, message.text);
  assert.equal(chat.send('  hello  '), true);
  assert.deepEqual(sent[0], { type: 'chat_message', text: 'hello' });
  assert.equal(chat.send('  '), false);
  chat.clear(); assert.equal(chat.messages.length, 0);
});

test('world order ignores duplicates and accepts gaps from excluded own broadcasts', () => {
  const order = new WorldOrder(); order.snapshot({ sequence: 7, revision: 3 });
  assert.equal(order.accept({ sequence: 6 }), false);
  assert.equal(order.accept({ sequence: 8, revision: 4 }), true);
  assert.equal(order.accept({ sequence: 8 }), false);
  assert.equal(order.accept({ sequence: 10 }), true);
  assert.equal(order.accept({ sequence: 11 }), true);
  order.snapshot({ sequence: 11, revision: 6 });
  assert.equal(order.accept({ sequence: 12, revision: 7 }), true);
  assert.equal(order.revision, 7);
});

test('account-backed inventory and trade actions never send while verification is unavailable', () => {
  const sent: any[] = [];
  const accounts = new AccountFeatures(m => { sent.push(m); return true; });
  assert.equal(accounts.available, false);
  assert.equal(accounts.requestInventory(), false);
  assert.equal(accounts.trade({ type: 'trade_request', playerId: 'p' }), false);
  assert.equal(accounts.itemAction({ type: 'item_pickup', itemId: 'i' }), false);
  assert.equal(sent.length, 0);
  accounts.snapshotWorldItems([{ id: 'item', position: [1,2,3] }]);
  accounts.worldItemEvent({ type: 'item_remove', itemId: 'item' });
  assert.equal(accounts.worldItems.size, 0);
});

test('poster upload sends binary once for concurrent reuse, then uses the persistent asset URL', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jLQAAAABJRU5ErkJggg==';
  const calls: any[] = [];
  const upload = new ArtworkUpload(async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ok: true, assetRef: 'https://24.144.88.205/artwork/test.png' }), { status: 200 });
  });
  const refs = await Promise.all([upload.assetRef(png), upload.assetRef(png)]);
  assert.deepEqual(refs, ['https://24.144.88.205/artwork/test.png', 'https://24.144.88.205/artwork/test.png']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.ok(calls[0].options.body instanceof Blob);
  assert.equal(calls[0].options.body.type, 'image/png');
  assert.equal(new Uint8Array(await calls[0].options.body.arrayBuffer())[0], 137);
  await upload.assetRef(png); assert.equal(calls.length, 1);
  await upload.assetRef(refs[0]); assert.equal(calls.length, 1);
  assert.throws(() => posterBlob('data:image/gif;base64,eA=='), /PNG, JPEG or WebP/);
  assert.throws(() => posterBlob('data:image/png;base64,' + 'A'.repeat(7_000_000)), /5 MB/);
});

test('poster snapshot mounts once, orders overlapping images by server sequence and cancels late loads on leave', () => {
  const images: any[] = [], notices: string[] = [];
  const sync = new ArtworkSync(() => true, value => notices.push(value), () => { const image: any = {}; images.push(image); return image; });
  const chunk = createCityChunk(0, 0, materials()); const wall = chunk.walls[0];
  const saved = (id: string, sequence: number) => ({ id, assetRef: 'https://example.test/' + id + '.png', surfaceId: encodeSurface(wall.surfaceId!,0,0), face:'0', position:[0,0,0], rotation:[0,0,0,1], width:1, height:1, sequence });
  sync.snapshot([saved('older',10), saved('newer',20)]); const walls = new Map([[wall.surfaceId!,wall]]);
  sync.refresh(walls); sync.refresh(walls); assert.equal(images.length,2);
  images[1].onload(); images[0].onload();
  const overlays = (wall.layers[0]?.mesh ?? wall.mesh).children.filter(c=>c.userData.posterArtwork);
  assert.deepEqual(overlays.map(c=>c.renderOrder),[110,100]);
  sync.accept({type:'artwork_placed',artwork:saved('older',10)});sync.refresh(walls);assert.equal(images.length,2);
  sync.snapshot([saved('older',10), saved('newer',20), saved('late',30)]);sync.refresh(walls);
  sync.clear(); images[2].onload();
  assert.equal((wall.layers[0]?.mesh ?? wall.mesh).children.filter(c=>c.userData.posterArtwork).length,0);
  assert.equal(notices.length,0);
});

test('poster image decoding starts in a bounded queue and advances as loads settle', () => {
  const images: any[] = [];
  const sync = new ArtworkSync(() => true, () => {}, () => { const image: any = {}; images.push(image); return image; });
  const chunk = createCityChunk(0, 0, materials()); const wall = chunk.walls[0];
  const saved = (id: string, sequence: number) => ({ id, assetRef: 'https://example.test/' + id + '.png', surfaceId: encodeSurface(wall.surfaceId!,0,0), face:'0', position:[0,0,0], rotation:[0,0,0,1], width:1, height:1, sequence });
  sync.snapshot(Array.from({ length: 12 }, (_, index) => saved(String(index), index)));
  const walls = new Map([[wall.surfaceId!,wall]]);
  sync.refresh(walls); sync.refresh(walls);
  assert.equal(images.length, 7);
  images[0].onload(); sync.refresh(walls);
  assert.equal(images.length, 8);
  images[1].onerror(); sync.refresh(walls);
  assert.equal(images.length, 9);
  sync.clear();
});

test('image distance defers remote downloads, limits concurrency and preserves cached images outside range',()=>{
  const images:any[]=[];const sync=new ArtworkSync(()=>true,()=>{},()=>{const image:any={};images.push(image);return image;});
  const wall=createCityChunk(0,0,materials()).walls[0],walls=new Map([[wall.surfaceId!,wall]]);
  sync.snapshot(['one','two'].map(id=>({id,assetRef:`https://example.test/${id}.png`,surfaceId:encodeSurface(wall.surfaceId!,0,0),position:[0,0,0],rotation:[0,0,0,1],width:1,height:1})));
  let nearby=false;const demand={canLoad:()=>nearby,maxConcurrent:1};
  sync.refresh(walls,demand);assert.equal(images.length,0);
  nearby=true;sync.refresh(walls,demand);assert.equal(images.length,1);images[0].onload();
  const mesh=sync.meshFor('one')!;assert.ok(mesh);nearby=false;sync.refresh(walls,demand);assert.equal(mesh.visible,false);assert.equal(images.length,1);
  nearby=true;sync.refresh(walls,demand);assert.equal(mesh.visible,true);assert.equal(images.length,2);
  sync.clear();
});

test('artwork indexed for an unloaded wall mounts when that wall becomes available', () => {
  const images: any[] = [];
  const sync = new ArtworkSync(() => true, () => {}, () => { const image: any = {}; images.push(image); return image; });
  const first = createCityChunk(0, 0, materials()).walls[0];
  const later = createCityChunk(1, 0, materials()).walls[0];
  const saved = { id:'later', assetRef:'https://example.test/later.png', surfaceId:encodeSurface(later.surfaceId!,0,0), face:'0', position:[0,0,0], rotation:[0,0,0,1], width:1, height:1, sequence:1 };
  sync.snapshot([saved]);
  sync.refresh(new Map([[first.surfaceId!, first]]));
  assert.equal(images.length, 0);
  sync.refresh(new Map([[later.surfaceId!, later]]));
  assert.equal(images.length, 1);
  images[0].onload();
  assert.equal((later.layers[0]?.mesh ?? later.mesh).children.filter(child => child.userData.posterArtwork).length, 1);
  sync.clear();
});

test('updated artwork cancels its stale image load and mounts the newest asset', () => {
  const images: any[] = [];
  const sync = new ArtworkSync(() => true, () => {}, () => { const image: any = { src: '' }; images.push(image); return image; });
  const wall = createCityChunk(0, 0, materials()).walls[0];
  const saved = (assetRef: string) => ({ id:'same', assetRef, surfaceId:encodeSurface(wall.surfaceId!,0,0), face:'0', position:[0,0,0], rotation:[0,0,0,1], width:1, height:1 });
  sync.snapshot([saved('https://example.test/old.png')]);
  const walls = new Map([[wall.surfaceId!, wall]]);
  sync.refresh(walls);
  const staleLoad = images[0].onload;
  sync.accept({ type:'artwork_placed', artwork:saved('https://example.test/new.png') });
  assert.equal(images[0].src, '');
  sync.refresh(walls);
  assert.equal(images.length, 2);
  staleLoad();
  assert.equal((wall.layers[0]?.mesh ?? wall.mesh).children.filter(child => child.userData.posterArtwork).length, 0);
  images[1].onload();
  assert.equal((wall.layers[0]?.mesh ?? wall.mesh).children.filter(child => child.userData.posterArtwork).length, 1);
  sync.clear();
});

test('timed out artwork loads release their concurrency slot and queued images continue', () => {
  const images: any[] = [], timers: Array<() => void> = [];
  const sync = new ArtworkSync(() => true, () => {}, () => { const image: any = { src: '' }; images.push(image); return image; }, undefined,
    callback => { timers.push(callback); return timers.length as any; }, () => {});
  const wall = createCityChunk(0, 0, materials()).walls[0];
  const saved = (id: string) => ({ id, assetRef:`https://example.test/${id}.png`, surfaceId:encodeSurface(wall.surfaceId!,0,0), face:'0', position:[0,0,0], rotation:[0,0,0,1], width:1, height:1 });
  sync.snapshot(Array.from({ length: 11 }, (_, index) => saved(String(index))));
  const walls = new Map([[wall.surfaceId!, wall]]);
  sync.refresh(walls);
  assert.equal(images.length, 7);
  timers[0](); sync.refresh(walls);
  assert.equal(images[0].src, '');
  assert.equal(images.length, 8);
  images[7].onload();
  assert.ok((wall.layers[0]?.mesh ?? wall.mesh).children.some(child => child.userData.posterArtwork));
  sync.clear();
});

test('local poster renders immediately; upload completion shares only its URL and own echo does not mount twice', async () => {
  let release!: (response: Response) => void;
  const upload = new ArtworkUpload(async () => new Promise<Response>(resolve=> { release=resolve; }));
  const sent: any[] = [], images: any[] = [];
  const sync = new ArtworkSync(message=> {sent.push(message);return true;},()=>{},()=> {const image:any={};images.push(image);return image;},upload);
  const chunk = createCityChunk(0,0,materials()); const wall=chunk.walls[0];
  const artwork:any={image:'data:image/png;base64,eA==',position:[0,0,0],quaternion:[0,0,0,1],width:1,height:1};
  addPosterOverlay(wall,artwork,{} as HTMLImageElement);
  const pending=sync.placed(wall,0,artwork); assert.equal(sent.length,0); assert.equal((wall.layers[0]?.mesh ?? wall.mesh).children.filter(c=>c.userData.posterArtwork).length,1);
  while (!release) await new Promise(resolve=>setTimeout(resolve,0));
  release(new Response(JSON.stringify({ok:true,assetRef:'https://example.test/saved.png'})));
  await pending; assert.equal(sent.length,1); assert.equal(sent[0].assetRef,'https://example.test/saved.png');
  assert.equal(JSON.stringify(sent[0]).includes('base64'),false);
  sync.accept({type:'artwork_placed',artwork:{...sent[0],id:sent[0].artworkId,sequence:50}});
  sync.refresh(new Map([[wall.surfaceId!,wall]])); assert.equal(images.length,0);
  assert.equal((wall.layers[0]?.mesh ?? wall.mesh).children.find(c=>c.userData.posterArtwork)!.renderOrder,140);
  sync.snapshot([]);
  assert.equal((wall.layers[0]?.mesh ?? wall.mesh).children.filter(c=>c.userData.posterArtwork).length,0);
  sync.clear();
});

test('remote cosmetics and emotes reuse the existing avatar; repeated action IDs do not restart animation', () => {
  const scene = new THREE.Scene(), players = new RemotePlayers(scene);
  players.joined({id:'other',displayName:'Other'},'self');
  players.state('other',{position:[1,1.72,2],rotation:[0,0,0],movement:'idle',cosmetics:{outfit:'jax',top:'coral',bottom:'charcoal',accessory:'sprayCan'},visibleHeldItem:'sprayCan',emote:''});
  players.update(0.016); const avatar=scene.children.find(c=>c.userData.parts)!;
  assert.equal(avatar.userData.parts.jaxDetails.visible,true);
  assert.equal(avatar.userData.parts.accessories.sprayCan.visible,true);
  players.action({type:'player_action',actionId:'once',playerId:'other',action:'emote',data:{emote:'think'}});
  players.update(0.1); const elapsed=avatar.userData.activeEmote.elapsed;
  players.action({type:'player_action',actionId:'once',playerId:'other',action:'emote',data:{emote:'think'}});
  assert.equal(avatar.userData.activeEmote.elapsed,elapsed);
  players.clear();assert.equal(scene.children.length,0);
});

test('protocol 2 role changes use exact server wire and remote role broadcasts without optimistic assignment', () => {
  const sockets: Socket[] = [], previousSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = class extends Socket { constructor() { super(); sockets.push(this); } };
  const scene = new THREE.Scene();
  const world: any = { scene, walls: [], setPaintSession() {}, playerPosition: new THREE.Vector3(), playerYaw: 0, playerPitch: 0, paintRevision: 0 };
  const statuses: any[] = [], views: any[] = [];
  const session = new WorldMultiplayerSession(world, status => statuses.push(status), view => views.push(view));
  try {
    session.join('Owner'); const socket = sockets[0]; socket.readyState = 1;
    socket.receive({ type: 'hello', protocol: 2, playerId: 'self' });
    socket.receive({ type: 'world_snapshot', protocol: 2, roomId: 'public', playerId: 'self', sequence: 0, revision: 0, strokes: [], players: [{ playerId: 'target', username: 'artist', nickName: 'Artist', role: 'player' }] });
    socket.receive({ type: 'permissions', role: 'owner', permissions: ['*'] });
    assert.equal(statuses.at(-1).role, 'owner');
    assert.equal(session.setRole('artist', 'admin'), true);
    assert.deepEqual(socket.sent.at(-1), { type: 'admin_set_role', targetUsername: 'artist', role: 'admin' });
    assert.equal((session as any).players.get('target').role, 'player', 'the outbound request does not optimistically change remote role');
    socket.receive({ type: 'admin_set_role_complete', targetUsername: 'artist', previousRole: 'player', role: 'admin', serverTime: 123 });
    assert.deepEqual(views.at(-1).roleChange, { targetUsername: 'artist', previousRole: 'player', role: 'admin', serverTime: 123 });
    socket.receive({ type: 'player_role_changed', playerId: 'target', username: 'artist', role: 'admin' });
    assert.equal((session as any).players.get('target').role, 'admin');
    socket.receive({ type: 'permissions', role: 'player', permissions: [] });
    assert.equal(statuses.at(-1).role, 'player');
    assert.equal(session.setRole('artist', 'owner'), false);
    session.leave();
    assert.equal(statuses.at(-1).role, undefined);
    assert.equal(session.setRole('artist', 'moderator'), false);
  } finally { session.dispose(); globalThis.WebSocket = previousSocket; }
});

test('repeated player picks notify the UI, ordinary updates stay silent and departures retain the profile offline', () => {
  const sockets: Socket[] = [], previousSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = class extends Socket { constructor() { super(); sockets.push(this); } };
  const world: any = { scene: new THREE.Scene(), walls: [], setPaintSession() {}, playerPosition: new THREE.Vector3(), playerYaw: 0, playerPitch: 0, paintRevision: 0, renderer: { domElement: {} } };
  const views: any[] = [];
  const session = new WorldMultiplayerSession(world, () => {}, view => views.push(view));
  try {
    session.join('Artist'); const socket = sockets[0]; socket.readyState = 1;
    socket.receive({ type: 'hello', protocol: 2, playerId: 'self' });
    socket.receive({ type: 'world_snapshot', protocol: 2, roomId: 'public', playerId: 'self', sequence: 0, revision: 0, strokes: [], players: [{ playerId: 'target', username: 'artist', nickName: 'Artist', role: 'player' }] });
    (session as any).players.pick = () => (session as any).players.get('target');
    assert.equal(world.onPlayerPick({}), true);
    const first = views.at(-1).playerPickSequence;
    assert.equal(world.onPlayerPick({}), true);
    assert.equal(views.at(-1).playerPickSequence, first + 1);
    socket.receive({ type: 'player_role_changed', playerId: 'target', username: 'artist', role: 'moderator' });
    assert.equal(views.at(-1).playerPickSequence, first + 1);
    socket.receive({ type: 'player_left', playerId: 'target' });
    assert.deepEqual(views.at(-1).selectedPlayer, { playerId: 'target', username: 'artist', nickName: 'Artist', role: 'moderator', online: false });
  } finally { session.dispose(); globalThis.WebSocket = previousSocket; }
});

test('a delayed poster upload cannot publish after connection interruption, and offline placement never uploads', async () => {
  let release!:(response:Response)=>void; let uploads=0;
  const upload=new ArtworkUpload(async()=> {uploads++;return new Promise<Response>(resolve=>{release=resolve;});});
  const sent:any[]=[];
  const sync=new ArtworkSync(message=>{sent.push(message);return true;},()=>{},()=>({} as HTMLImageElement),upload);
  const chunk=createCityChunk(0,0,materials()), wall=chunk.walls[0];
  const poster:any={image:'data:image/png;base64,eA==',position:[0,0,0],quaternion:[0,0,0,1],width:1,height:1};
  addPosterOverlay(wall,poster,{} as HTMLImageElement);
  const pending=sync.placed(wall,0,poster);
  while(!release) await new Promise(resolve=>setTimeout(resolve,0));
  sync.interrupted();sync.snapshot([]);
  release(new Response(JSON.stringify({ok:true,assetRef:'https://example.test/uploaded.png'})));
  await pending;assert.equal(sent.length,0);assert.equal(uploads,1);
  assert.equal((wall.layers[0]?.mesh??wall.mesh).children.filter(c=>c.userData.posterArtwork).length,1);
  addPosterOverlay(wall,poster,{} as HTMLImageElement);
  await sync.placed(wall,0,poster,false);assert.equal(uploads,1);assert.equal(sent.length,0);
  sync.clear();
});

test('nested stroke sequence participates in ordering and duplicate begins retain own accepted metadata', () => {
  const order=new WorldOrder();order.snapshot({sequence:10,revision:10});
  assert.equal(order.accept({type:'stroke_begin',stroke:{sequence:11,revision:11}}),true);
  assert.equal(order.accept({type:'stroke_points',sequence:12,revision:12}),true);
  const sync=new PaintSync({send:()=>true,draw:()=>assert.fail('own echo redrawn'),reset:()=>{}});
  const local=sync.sample(sample(1),false);
  sync.accept({type:'stroke_begin',stroke:{...local.stroke,sequence:11,revision:11,playerId:'server-id'}});
  assert.equal(sync.strokes.get(local.stroke.strokeId)?.sequence,11);
});

test('session reconstructs chat/items, handles explicit resync and keeps identity account features locked', () => {
  const sockets:Socket[]=[], previousSocket=globalThis.WebSocket;
  (globalThis as any).WebSocket=class extends Socket {constructor(){super();sockets.push(this);}};
  const scene=new THREE.Scene(), stream=createCityChunkStream(scene,materials());stream.updateAt(0,0);
  const world:any={scene,walls:stream.walls,setPaintSession:stream.setPaintSession,playerPosition:new THREE.Vector3(),playerYaw:0,playerPitch:0,paintRevision:0};
  const views:any[]=[],statuses:any[]=[];
  const session=new WorldMultiplayerSession(world,s=>statuses.push(s),v=>views.push(v));
  try {
    session.join('Aippy Default');const socket=sockets[0];socket.readyState=1;
    socket.receive({type:'hello',protocol:2,playerId:'assigned'});
    const snapshot:any={type:'world_snapshot',protocol:2,roomId:'public',playerId:'assigned',sequence:10,revision:10,playerCount:4,strokes:[],players:[],artworks:[],worldItems:[{id:'drop'}],chatHistory:[{id:'old',playerId:'other',displayName:'Other',text:'saved',timestamp:100}]};
    socket.receive(snapshot);assert.equal(world.multiplayerActive,true);assert.equal(views.at(-1).chat[0].text,'saved');
    assert.equal(views.at(-1).worldItemCount,1);assert.equal(views.at(-1).accountFeaturesAvailable,false);assert.equal(statuses.at(-1).playerCount,4);
    session.sendChat('test transport only');assert.equal(socket.sent.at(-1).type,'chat_message');
    socket.receive({type:'chat_message',sequence:11,revision:11,message:{id:'new',playerId:'other',displayName:'Other',text:'live',timestamp:200}});
    assert.equal(views.at(-1).chat.length,2);
    socket.receive({type:'stroke_points',strokeId:'missing',sequence:13,revision:13,points:[]});
    socket.receive({type:'stroke_points',strokeId:'missing',sequence:14,revision:14,points:[]});
    assert.equal(socket.sent.filter(m=>m.type==='resync_request').length,0,'own broadcasts can create valid sequence gaps');
    session.resync();assert.equal(socket.sent.filter(m=>m.type==='resync_request').length,1);
    socket.receive({...snapshot,sequence:14,revision:14});assert.equal(views.at(-1).revision,14);
    session.emote('think');assert.deepEqual(socket.sent.at(-1).data,{emote:'think'});
    const sent=socket.sent.length;session.accounts.requestInventory();session.accounts.trade({type:'trade_request'});assert.equal(socket.sent.length,sent);
    session.leave();assert.equal(world.multiplayerActive,false);assert.equal(views.at(-1).chat.length,0);
  } finally {session.dispose();globalThis.WebSocket=previousSocket;}
});

test('frequent stroke endings do not restart a wall snapshot replay indefinitely', () => {
  const sockets:Socket[]=[], previousSocket=globalThis.WebSocket;
  (globalThis as any).WebSocket=class extends Socket {constructor(){super();sockets.push(this);}};
  const scene=new THREE.Scene(), stream=createCityChunkStream(scene,materials());stream.updateAt(0,0);
  const world:any={scene,walls:stream.walls,setPaintSession:stream.setPaintSession,playerPosition:new THREE.Vector3(),playerYaw:0,playerPitch:0,paintRevision:0,velocityY:0,abilityActive:false};
  const session=new WorldMultiplayerSession(world,()=>{});
  try {
    session.join('Tester');const socket=sockets[0];socket.readyState=1;socket.receive({type:'hello',protocol:2,playerId:'assigned'});
    const wall=world.walls[0],position=wall.mesh.localToWorld(new THREE.Vector3(0.2,0.2,0));
    world.playerPosition.copy(position); // This regression exercises nearby replay, independently of display distance.
    const point={x:position.x,y:position.y,z:position.z,pressure:1};
    const stroke={id:'history',surfaceId:encodeSurface(wall.surfaceId!,0,0),colour:'#ff0000',brushSize:5,opacity:1,points:Array.from({length:800},()=>({...point}))};
    const real:any=wall.layers[0].ensureFace(0);
    socket.receive({type:'world_snapshot',protocol:2,roomId:'public',playerId:'assigned',strokes:[stroke],players:[]});
    const settings:any={layerVisibility:[true],paintMode:false,eraseMode:false};
    for(let frame=0;frame<20&&real.draws.length===0;frame++) {
      socket.receive({type:'stroke_end',strokeId:'history'});world.onMultiplayerFrame(0.016,settings);
    }
    assert.ok(real.draws.length>=800,'the in-progress replay commits despite repeated stroke endings');
  } finally {session.dispose();globalThis.WebSocket=previousSocket;}
});

test('same-connection resync preserves a held stroke and keeps sending only its new points', () => {
  const sent:any[]=[],draws:any[]=[];
  const sync=new PaintSync({send:m=>{sent.push(m);return true;},reset:()=>{},draw:(...args)=>draws.push(args)});
  const local=sync.sample({...sample(1),opacity:0.88},false);sync.flush(100);
  sync.snapshot([{...local.stroke,id:local.stroke.strokeId,points:[point(1)],sequence:10}],true);
  assert.equal(sync.drawing,true);
  assert.equal(sync.sample({...sample(2),opacity:0.88},true).stroke.strokeId,local.stroke.strokeId);
  sync.flush(200);sync.end();
  assert.equal(sent.filter(m=>m.type==='stroke_begin').length,1);
  assert.deepEqual(sent.filter(m=>m.type==='stroke_points').map(m=>m.points.length),[1,1]);
  assert.equal(sync.strokes.get(local.stroke.strokeId)?.points.length,2);
  assert.equal(draws.length,1,'snapshot stages the already rendered stroke once');
});

test('live metadata/artwork packets decode and a server movement packet missing position is rejected', () => {
  assert.equal(readPlayer(liveContract.joined.player)?.playerId,liveContract.joined.player.id);
  assert.equal(readCosmetics(liveContract.state.state.cosmetics)?.outfit,'jax');
  assert.equal(readPlayerState(liveContract.state.state),null,'live server currently drops position: documented backend blocker, never invent a spawn position');
  const rendered:any[]=[];const paint=new PaintSync({send:()=>true,reset:()=>{},draw:(...args)=>rendered.push(args)});
  paint.accept(liveContract.begin);paint.accept(liveContract.points);paint.accept(liveContract.end);
  const stroke=paint.strokes.get(liveContract.begin.stroke.id)!;
  assert.equal(stroke.operation,'erase');assert.equal(stroke.opacity,0.05);assert.equal(stroke.sequence,liveContract.end.sequence);
  assert.equal(rendered.length,1);assert.deepEqual(stroke.points,liveContract.points.points);
  const artwork=readArtwork(liveContract.artwork.artwork)!;
  assert.deepEqual(artwork.quaternion,[0,0,0,1]);assert.equal(artwork.sequence,liveContract.artwork.sequence);
});

test('join account and permissions messages are retained before the initial snapshot', () => {
  const socket = new Socket();
  const messages: any[] = [];
  const connection = new MultiplayerConnection('wss://example.test', () => {}, message => messages.push(message), () => socket);
  connection.connect('Owner', 'public'); socket.readyState = 1;
  socket.receive({ type: 'hello', playerId: 'owner-id', protocol: 2 });
  socket.receive({ type: 'account_state', username: 'owner', credits: 1000 });
  socket.receive({ type: 'permissions', role: 'owner', permissions: ['*'] });
  assert.deepEqual(messages.map(message => message.type), ['account_state', 'permissions']);
  assert.equal(connection.connected, false);
  socket.receive({ type: 'world_snapshot', roomId: 'public', playerId: 'owner-id', strokes: [], players: [] });
  assert.equal(connection.connected, true);
  socket.receive({ type: 'error', code: 'insufficient_credits', pieceId: 'piece' });
  assert.equal(messages.at(-1).code, 'insufficient_credits');
  connection.disconnect();
});

test('live chat echoes attach bubbles to own and remote avatars and clean up on leave', () => {
  const sockets: Socket[] = [], oldSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = class extends Socket { constructor() { super(); sockets.push(this); } };
  const scene = new THREE.Scene(), playerAvatar = new THREE.Group();
  const world: any = { scene, playerAvatar, walls: [], setPaintSession() {}, playerPosition: new THREE.Vector3(), playerYaw: 0, playerPitch: 0, paintRevision: 0 };
  const session = new WorldMultiplayerSession(world, () => {});
  try {
    session.join('Self'); const socket = sockets[0]; socket.readyState = 1;
    socket.receive({ type: 'hello', protocol: 2, playerId: 'self' });
    socket.receive({ type: 'world_snapshot', protocol: 2, roomId: 'public', playerId: 'self', sequence: 10, revision: 10, strokes: [], artworks: [], worldItems: [], graffitiPieces: [], players: [{ playerId: 'other', displayName: 'Other', state: { position: [0, 1.72, 1], rotation: [0, 0, 0] } }], chatHistory: [{ id: 'history', playerId: 'self', text: 'old', timestamp: 1 }] });
    const remote = scene.children.find(child => child.userData.parts)!;
    assert.equal(playerAvatar.children.length, 0, 'history must not create an own bubble');
    const remoteLabels = remote.children.filter(child => child instanceof THREE.Sprite).length;
    const own = { id: 'own', playerId: 'self', text: 'hello from me', timestamp: 2 };
    socket.receive({ type: 'chat_message', sequence: 11, revision: 11, message: own });
    assert.equal(playerAvatar.children.length, 1);
    const original = playerAvatar.children[0];
    socket.receive({ type: 'chat_message', sequence: 12, revision: 12, message: own });
    assert.equal(playerAvatar.children[0], original, 'duplicate must not replace the bubble');
    socket.receive({ type: 'chat_message', sequence: 13, revision: 13, message: { id: 'remote', playerId: 'other', text: 'hi there', timestamp: 3 } });
    assert.equal(remote.children.filter(child => child instanceof THREE.Sprite).length, remoteLabels + 1);
    session.leave(); assert.equal(playerAvatar.children.length, 0); assert.equal(scene.children.length, 0);
  } finally { session.dispose(); globalThis.WebSocket = oldSocket; }
});

test('distant live wall replay keeps canonical strokes and catches up when entering range', () => {
 const sockets:Socket[]=[],old=globalThis.WebSocket;
 (globalThis as any).WebSocket=class extends Socket {constructor(){super();sockets.push(this);}};
 const scene=new THREE.Scene(),stream=createCityChunkStream(scene,materials());stream.updateAt(0,0);
 const world:any={scene,walls:stream.walls,setPaintSession:stream.setPaintSession,playerPosition:new THREE.Vector3(),playerYaw:0,playerPitch:0,paintRevision:0,velocityY:0,abilityActive:false};
 const session=new WorldMultiplayerSession(world,()=>{});
 try {session.join('Tester');const socket=sockets[0];socket.readyState=1;socket.receive({type:'hello',protocol:2,playerId:'assigned'});
  const wall=world.walls[0],point=wall.mesh.localToWorld(new THREE.Vector3(.2,.2,0)),real:any=wall.layers[0].ensureFace(0);
  socket.receive({type:'world_snapshot',protocol:2,roomId:'public',playerId:'assigned',strokes:[{id:'far-stroke',playerId:'other',surfaceId:encodeSurface(wall.surfaceId!,0,0),colour:'#ff0000',brushSize:5,opacity:1,points:[{x:point.x,y:point.y,z:point.z,pressure:1}]}],players:[]});
  const settings:any={layerVisibility:[true],paintMode:false,eraseMode:false};
  world.onMultiplayerFrame(.016,settings);assert.equal(real.draws.length,0,'far wall defers drawing');
  assert.ok((session as any).paint.strokes.has('far-stroke'),'canonical data is retained');
  world.playerPosition.copy(point);for(let i=0;i<5;i++)world.onMultiplayerFrame(.016,settings);
  assert.ok(real.draws.length>0,'approach replays retained canonical data');
 } finally {session.dispose();scene.userData.disposeCity?.();globalThis.WebSocket=old;}
});

test('world-stream teardown invalidates delayed solo restoration callbacks',()=>{
 const images:any[]=[],oldImage=globalThis.Image,oldWindow=globalThis.window;
 (globalThis as any).Image=class{onload:()=>void;set src(_value:string){images.push(this);}};
 (globalThis as any).window={localStorage:{getItem:()=>JSON.stringify({0:[['data:image/png;base64,old']]}),setItem(){},removeItem(){}}};
 const scene=new THREE.Scene(),stream=createCityChunkStream(scene,materials());
 try {stream.updateAt(0,0);const wall=stream.walls[0];assert.ok(images.length>0);scene.userData.disposeCity();images.forEach(image=>image.onload?.());assert.equal(wall.layers[0].contexts[0],null);}
 finally{globalThis.Image=oldImage;globalThis.window=oldWindow;}
});
