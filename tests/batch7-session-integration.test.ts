import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldMultiplayerSession } from '../src/multiplayer/worldSession';
import type { MultiplayerView, Message } from '../src/multiplayer/protocol';
import type { ServerRole } from '../src/multiplayer/permissions';
import { encodeSurface } from '../src/multiplayer/surfaces';

class Socket {
  readyState = 1; bufferedAmount = 0;
  onopen = null; onerror = null; onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: Message[] = [];
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
  disconnect() { this.readyState = 3; this.onclose?.(); }
}
const spatialCaps = ['spatial_interest_v1', 'spatial_world_delta_v1', 'player_directory_v1'];
const surfaceId = 'ss1:0:0:wall/f0/l0';
const stroke = { strokeId: 'gesture.0', pieceId: 'piece', playerId: 'self', surfaceId, colour: '#123456', tool: 'marker', brushSize: 1, points: [{ x: 1, y: 1, z: 1, pressure: 1 }], sequence: 1 };
const piece = { pieceId: 'piece', owner: 'self', ownerPlayerId: 'self', ownerUsername: 'self-user', ownerNickName: 'Self', anchor: [1, 1, 1], bounds: { min: [0, 0, 0], max: [2, 2, 2] }, strokeIds: ['gesture.0'] };
const artwork = { id: 'art', assetRef: 'https://example.test/art.png', surfaceId, position: [1, 1, 1], quaternion: [0, 0, 0, 1], width: 2, height: 1, ownerPlayerId: 'departed', ownerUsername: 'real-creator', ownerNickName: 'Creator', sequence: 1 };
const reference = { id: 'ref', referenceId: 'ref', assetRef: 'https://example.test/reference.png', name: 'Seed', surfaceId, position: [1, 1, 1], quaternion: [0, 0, 0, 1], width: 2, height: 1, opacity: .35, aboveArt: true, createdAt: 1, updatedAt: 2 };

function fixture(capabilities: string[] = [], initial: Record<string, unknown> = {}) {
  const oldSocket = globalThis.WebSocket, oldDocument = globalThis.document, oldImage = globalThis.Image;
  let socket!: Socket;
  const images: any[] = [];
  globalThis.WebSocket = class extends Socket { constructor() { super(); socket = this; } } as unknown as typeof WebSocket;
  globalThis.document = { getElementById: () => null, createElement: () => ({ width: 1, height: 1, getContext: () => null }) } as unknown as Document;
  globalThis.Image = class { src = ''; onload?: () => void; constructor() { images.push(this); } } as unknown as typeof Image;
  const world: any = { scene: new THREE.Scene(), walls: [], setPaintSession() {}, playerPosition: new THREE.Vector3(1, 1.72, 1), playerYaw: 0, playerPitch: 0, paintRevision: 0, renderer: { domElement: {} } };
  const views: MultiplayerView[] = [];
  const session = new WorldMultiplayerSession(world, () => {}, view => views.push(view));
  session.join('Self', 'public', { username: 'self-user', nickName: 'Self' });
  socket.receive({ type: 'hello', protocol: 2, playerId: 'self', capabilities: [...spatialCaps, ...capabilities] });
  socket.receive({ type: 'world_snapshot', protocol: 2, roomId: 'public', playerId: 'self', sequence: 10, revision: 10, strokes: [], players: [], playerDirectory: [{ playerId: 'target', username: 'artist', nickName: 'Artist', role: 'player' }, { playerId: 'protected', username: 'protected-owner', nickName: 'Owner', role: 'owner' }], artworks: [], graffitiPieces: [], chatHistory: [], ...initial });
  return { session, socket, world, views, images, state: session as any,
    permissions(role: ServerRole, permissions: string[] = []) { socket.receive({ type: 'permissions', role, permissions }); },
    dispose() { session.dispose(); globalThis.WebSocket = oldSocket; globalThis.document = oldDocument; globalThis.Image = oldImage; } };
}

function activateOwnPiece(f: ReturnType<typeof fixture>) {
  f.state.selectedPieceId = 'piece';
  f.world.paintWorkspace = { active: false, savedLayers: null, selection: { hasPaint: false, preview: new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()) } };
}

test('session applies remove/upsert spatial deltas at the same world sequence and reloads membership', () => {
  const f = fixture([], { strokes: [stroke], artworks: [artwork], graffitiPieces: [piece] });
  try {
    f.socket.receive({ type: 'spatial_world_delta', sequence: 10, revision: 10, removeStrokeIds: ['gesture.0'], removeArtworkIds: ['art'], removePieceIds: ['piece'], upsertStrokes: [{ ...stroke, points: [{ x: 2, y: 1, z: 1, pressure: 1 }] }], upsertArtworks: [{ ...artwork, name: 'reloaded' }], upsertPieces: [piece] });
    assert.equal(f.state.paint.strokes.get('gesture.0').points[0].x, 2);
    assert.equal(f.views.at(-1)?.artworks?.length, 1); assert.equal(f.views.at(-1)?.pieces?.length, 1);
    f.socket.receive({ type: 'spatial_world_delta', sequence: 10, removeStrokeIds: ['gesture.0'], removeArtworkIds: ['art'], removePieceIds: ['piece'] });
    assert.equal(f.state.paint.strokes.size, 0); assert.equal(f.views.at(-1)?.artworks?.length, 0); assert.equal(f.views.at(-1)?.pieces?.length, 0);
    f.socket.receive({ type: 'spatial_world_delta', sequence: 10, upsertStrokes: [stroke], upsertArtworks: [artwork], upsertPieces: [piece] });
    assert.equal(f.state.paint.strokes.size, 1); assert.equal(f.views.at(-1)?.artworks?.length, 1); assert.equal(f.views.at(-1)?.pieces?.length, 1);
  } finally { f.dispose(); }
});

test('session undo stays disabled while awaiting history confirmation and explicit redo restores rejected strokes', () => {
  const f = fixture(['stroke_undo_redo'], { strokes: [stroke], graffitiPieces: [piece] });
  try {
    activateOwnPiece(f);
    assert.equal(f.session.undoStroke(), false, 'no speculative undo before server history');
    f.socket.receive({ type: 'stroke_history_state', pieceId: 'other', canUndo: true, canRedo: true, undoDepth: 1, redoDepth: 1, limit: 2 });
    assert.equal(f.session.undoStroke(), false, 'history for another piece cannot enable actions');
    f.socket.receive({ type: 'stroke_history_state', pieceId: 'piece', canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0, limit: 2 });
    assert.equal(f.session.undoStroke(), true); assert.deepEqual(f.socket.sent.at(-1), { type: 'stroke_undo', pieceId: 'piece' });
    assert.equal(f.views.at(-1)?.strokeHistory?.canUndo, false); assert.equal(f.session.undoStroke(), false);
    f.socket.receive({ type: 'stroke_gesture_undone', pieceId: 'piece', gestureId: 'gesture', strokeIds: ['gesture.0'], sequence: 11, revision: 11 });
    assert.equal(f.state.paint.strokes.size, 0); assert.equal(f.views.at(-1)?.strokeHistory?.canRedo, false);
    f.socket.receive({ type: 'spatial_world_delta', sequence: 11, upsertStrokes: [stroke] });
    assert.equal(f.state.paint.strokes.size, 0, 'spatial upsert cannot undo an authoritative removal');
    f.socket.receive({ type: 'stroke_history_state', pieceId: 'piece', canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1, limit: 2 });
    assert.equal(f.session.redoStroke(), true); assert.deepEqual(f.socket.sent.at(-1), { type: 'stroke_redo', pieceId: 'piece' });
    f.socket.receive({ type: 'stroke_gesture_redone', pieceId: 'piece', gestureId: 'gesture', strokes: [{ ...stroke, sequence: 12 }], sequence: 12, revision: 12 });
    assert.equal(f.state.paint.strokes.size, 1); assert.equal(f.views.at(-1)?.strokeHistory?.canUndo, false);
    f.socket.receive({ type: 'stroke_history_state', pieceId: 'piece', canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0, limit: 2 });
    assert.equal(f.views.at(-1)?.strokeHistory?.canUndo, true);
    f.state.pieces.pieces.get('piece').owner = 'someone-else'; assert.equal(f.session.undoStroke(), false);
  } finally { f.dispose(); }
});

test('supplied stroke history errors release the pending request without inventing availability', () => {
  const f = fixture(['stroke_undo_redo'], { graffitiPieces: [piece] });
  try {
    activateOwnPiece(f);
    for (const code of ['stroke_undo_unavailable', 'stroke_redo_unavailable', 'stroke_undo_limit', 'nothing_to_undo', 'nothing_to_redo']) {
      f.socket.receive({ type: 'stroke_history_state', pieceId: 'piece', canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0, limit: 2 });
      assert.equal(f.session.undoStroke(), true);
      f.socket.receive({ type: 'error', code });
      assert.equal(f.state.historyBusy, false, code);
    }
  } finally { f.dispose(); }
});

test('bulk art removal requires capability, permission and hierarchy and sends one correlated job request', () => {
  for (const capabilities of [[], ['admin_bulk_art_remove']]) {
    const f = fixture(capabilities, { artworks: [artwork], graffitiPieces: [piece] });
    try {
      f.permissions('admin'); assert.equal(f.session.adminAction('remove-all-art', 'artist', {}), false);
      f.permissions('player', ['remove_graffiti']); assert.equal(f.session.adminAction('remove-all-art', 'artist', {}), false);
      f.permissions('admin', ['remove_graffiti']);
      assert.equal(f.session.adminAction('remove-all-art', 'protected-owner', {}), false);
      const before = f.socket.sent.length;
      assert.equal(f.session.adminAction('remove-all-art', 'artist', {}), capabilities.length > 0);
      if (!capabilities.length) { assert.equal(f.socket.sent.length, before); continue; }
      assert.deepEqual(f.socket.sent.at(-1), { type: 'admin_remove_user_art', targetUsername: 'artist' });
      assert.equal(f.session.adminAction('remove-all-art', 'artist', {}), false); assert.equal(f.socket.sent.length, before + 1);
      const progress = { jobId: 'job', targetUsername: 'artist', total: 3, removed: 0, removedPieces: 0, removedArtworks: 0, removedStrokes: 0, remaining: 3, serverTime: 1 };
      f.socket.receive({ type: 'admin_remove_user_art_started', ...progress });
      f.socket.receive({ type: 'admin_remove_user_art_progress', ...progress, jobId: 'other-job', removed: 2, remaining: 1 });
      assert.equal(f.views.at(-1)?.artRemoval?.removed, 0);
      f.socket.receive({ type: 'admin_remove_user_art_progress', ...progress, removed: 2, removedPieces: 1, removedArtworks: 1, removedStrokes: 9, remaining: 1 });
      assert.equal(f.views.at(-1)?.artRemoval?.removed, 2);
      f.socket.receive({ type: 'admin_remove_user_art_complete', ...progress, removed: 3, removedPieces: 2, removedArtworks: 1, removedStrokes: 10, remaining: 0 });
      assert.equal(f.views.at(-1)?.artRemoval?.remaining, 0);
      assert.equal(f.views.at(-1)?.artworks?.length, 1, 'progress never substitutes for actual authoritative deletions');
      assert.equal(f.views.at(-1)?.pieces?.length, 1);
    } finally { f.dispose(); }
  }
});

test('owner reference snapshots and controls require owner plus capability and clear on disconnect', () => {
  for (const capabilities of [[], ['owner_reference_persistence']]) {
    const f = fixture(capabilities);
    try {
      f.permissions('admin', ['*']);
      f.socket.receive({ type: 'owner_reference_list', references: [reference] });
      assert.equal(f.views.at(-1)?.ownerReferences?.length, 0); assert.equal(f.session.deleteReference('ref'), false);
      f.permissions('owner', ['*']);
      f.socket.receive({ type: 'owner_reference_list', references: [reference] });
      assert.equal(f.views.at(-1)?.canKeepReference, capabilities.length > 0);
      assert.equal(f.views.at(-1)?.ownerReferences?.length, capabilities.length ? 1 : 0);
      if (!capabilities.length) { assert.equal(f.session.deleteReference('ref'), false); assert.equal(f.images.length, 0); continue; }
      assert.equal(f.images.length, 1); assert.equal(f.session.deleteReference('ref'), true);
      assert.deepEqual(f.socket.sent.at(-1), { type: 'owner_reference_delete', referenceId: 'ref' });
      f.socket.receive({ type: 'owner_reference_deleted', referenceId: 'ref' }); assert.equal(f.views.at(-1)?.ownerReferences?.length, 0);
      f.socket.receive({ type: 'owner_reference_saved', reference });
      const staleLoad = f.images.at(-1).onload;
      f.permissions('player'); staleLoad();
      assert.equal(f.views.at(-1)?.ownerReferences?.length, 0); assert.equal(f.world.scene.children.length, 0);
      f.permissions('owner', ['*']); f.socket.receive({ type: 'owner_reference_list', references: [reference] });
      f.socket.disconnect(); assert.equal(f.views.at(-1)?.ownerReferences?.length, 0); assert.equal(f.views.at(-1)?.canKeepReference, false); assert.equal(f.world.scene.children.length, 0);
    } finally { f.dispose(); }
  }
});

test('offline piece and poster creators retain server identity without nickname-to-handle guessing', () => {
  const f = fixture([], { artworks: [artwork], graffitiPieces: [{ ...piece, owner: 'departed', ownerPlayerId: 'departed', ownerUsername: 'real-creator', ownerNickName: 'Creator' }] });
  try {
    const savedPiece = f.views.at(-1)?.pieces?.[0]!;
    f.session.selectCreator({ playerId: savedPiece.ownerPlayerId, username: savedPiece.ownerUsername!, nickName: savedPiece.ownerNickName! });
    assert.deepEqual(f.views.at(-1)?.selectedPlayer, { playerId: 'departed', username: 'real-creator', nickName: 'Creator', online: false });
    const savedArt = f.views.at(-1)?.artworks?.[0]!;
    f.session.selectCreator({ playerId: savedArt.ownerPlayerId, username: savedArt.ownerUsername!, nickName: savedArt.ownerNickName! });
    assert.equal(f.views.at(-1)?.selectedPlayer?.username, 'real-creator'); assert.equal(f.views.at(-1)?.selectedPlayer?.online, false);
    f.session.selectCreator({ playerId: 'unknown', username: '', nickName: 'Artist' });
    assert.equal(f.views.at(-1)?.selectedPlayer?.username, ''); assert.equal(f.views.at(-1)?.selectedPlayer?.online, false);
  } finally { f.dispose(); }
});

test('authoritative artwork_removed clears the visible record and selection without touching other posters', () => {
  const f = fixture([], { artworks: [artwork, { ...artwork, id: 'other' }] });
  try {
    f.state.selectedArtworkId = 'art';
    f.socket.receive({ type: 'artwork_removed', artworkId: 'art', sequence: 11, revision: 11 });
    assert.deepEqual(f.views.at(-1)?.artworks?.map(value => value.id), ['other']); assert.equal(f.views.at(-1)?.selectedArtworkId, null);
    f.socket.receive({ type: 'artwork_removed', artworkId: 'art', sequence: 11, revision: 11 });
    assert.deepEqual(f.views.at(-1)?.artworks?.map(value => value.id), ['other']);
  } finally { f.dispose(); }
});

test('poster picking and View use transformed wall coordinates for aiming and locator bounds', () => {
  const oldRequest = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    for (const useLayer of [true, false]) {
      const f = fixture();
      const group = new THREE.Group();
      group.position.set(11, 2, -8); group.rotation.set(0, .6, .2);
      const geometry = new THREE.PlaneGeometry(12, 10);
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(2, 1, -3); mesh.rotation.y = -.4; group.add(mesh);
      const layer = new THREE.Mesh(geometry, material);
      layer.position.set(.2, .1, .015); layer.rotation.z = .2;
      if (useLayer) mesh.add(layer);
      f.world.scene.add(group);
      const wallId = 'ss1:4:-2:translated-wall';
      const wall: any = { surfaceId: wallId, mesh, layers: useLayer ? [{ mesh: layer }] : [] };
      f.world.walls = [wall]; f.state.walls.set(wallId, wall);
      const parent = useLayer ? layer : mesh;
      const localPosition = new THREE.Vector3(1.3, .7, .04);
      const localRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .12, .35));
      const transformed = { ...artwork, surfaceId: encodeSurface(wallId, 0, 0), position: localPosition.toArray(), quaternion: localRotation.toArray() };
      f.state.artworks.upsert([transformed]);
      parent.updateWorldMatrix(true, false);
      const center = parent.localToWorld(localPosition.clone());
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(parent.matrixWorld);
      f.world.playerPosition.copy(center).addScaledVector(normal, 4).add(new THREE.Vector3(0, -.7, 0));
      const camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
      camera.position.copy(f.world.playerPosition); camera.lookAt(center); camera.updateMatrixWorld(true);
      f.world.camera = camera; f.world.cameraMode = 'first'; f.world.colliders = [];
      f.world.renderer.domElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
      try {
        assert.equal(f.world.onPiecePick({ clientX: 50, clientY: 50 }), true, 'the world wall hit finds its local poster');
        assert.equal(f.views.at(-1)?.selectedArtworkId, 'art');
        f.world.cameraMode = 'map';
        assert.equal(f.session.inspectArtwork('art'), true);
        const delta = center.clone().sub(f.world.playerPosition);
        assert.ok(Math.abs(f.world.playerYaw - Math.atan2(-delta.x, -delta.z)) < 1e-10);
        const expectedPitch = THREE.MathUtils.clamp(Math.atan2(delta.y, Math.hypot(delta.x, delta.z)), -1.24, 1.18);
        assert.ok(Math.abs(f.world.playerPitch - expectedPitch) < 1e-10);
        assert.equal(f.world.cameraMode, 'first');
        const corners = [-1, 1].flatMap(x => [-1, 1].map(y => parent.localToWorld(new THREE.Vector3(x * artwork.width / 2, y * artwork.height / 2, 0).applyQuaternion(localRotation).add(localPosition))));
        const expectedBounds = new THREE.Box3().setFromPoints(corners).expandByScalar(.025);
        const locator = f.world.scene.children.find((object: THREE.Object3D) => object instanceof THREE.Box3Helper) as THREE.Box3Helper;
        assert.ok(locator, 'View creates a locator');
        assert.ok(locator.box.min.distanceTo(expectedBounds.min) < 1e-10);
        assert.ok(locator.box.max.distanceTo(expectedBounds.max) < 1e-10);
      } finally { f.dispose(); geometry.dispose(); material.dispose(); }
    }
  } finally { globalThis.requestAnimationFrame = oldRequest; globalThis.cancelAnimationFrame = oldCancel; }
});

test('multiplayer history received while drawing becomes usable immediately when the brush is released',()=>{
 const f=fixture(['stroke_undo_redo'],{graffitiPieces:[piece]});
 try{
  activateOwnPiece(f);
  f.state.paint.sample({pieceId:'piece',surfaceId:stroke.surfaceId,colour:'#000000',tool:'marker',brushSize:1,point:{x:0,y:0,z:0,pressure:1}},false);
  f.socket.receive({type:'stroke_history_state',pieceId:'piece',canUndo:true,canRedo:false,undoDepth:1,redoDepth:0,limit:2});
  assert.equal(f.views.at(-1)?.strokeHistory?.canUndo,false);
  f.world.onPaintEnd();
  assert.equal(f.views.at(-1)?.strokeHistory?.canUndo,true);
  assert.equal(f.session.undoStroke(),true);
 }finally{f.dispose();}
});
