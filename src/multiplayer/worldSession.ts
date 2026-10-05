import * as THREE from 'three';
import type { AvatarEmote, LiveSettings, PaintWall, PaintWorkspaceSelection, WorldEngine } from '../game/worldTypes';
import { MultiplayerConnection, type PlayerIdentity } from './connection';
import { DEFAULT_ROOM_ID, MULTIPLAYER_URL } from './config';
import { PaintSync } from './paintSync';
import { PaintReplay } from './paintReplay';
import { headForTool } from '../game/sprayHeads';
import { PlayerSync } from './playerSync';
import { RemotePlayers } from './remotePlayers';
import { decodeSurface, encodeSurface } from './surfaces';
import { ChatSync } from './chat';
import { ArtworkSync } from './artworkSync';
import { WorldOrder } from './worldOrder';
import { AccountFeatures } from './accountFeatures';
import { choosePieceAtWorldPoint, PieceSync } from './pieceSync';
import { clearPaintWorkspace } from '../game/paintWorkspace';
import { elementPointerPoint } from '../game/pointerCoordinates';
import { isPaintTargetReachable } from '../game/paintTargeting';
import type { Message, MultiplayerStatus, MultiplayerView, PlayerCosmetics } from './protocol';
import { canManageRole, canDeletePieces, readPermissions, type ServerPermissions, type ServerRole } from './permissions';
import { canAdminPaint } from './permissions';
import { adminPaintSamples } from './adminPaint';
import { pointToHit } from './surfaces';
import { paintRadius, stampPaintHit, type PaintPoint } from '../game/worldPainting';
import { buildAdminAction, type AdminAction, type AdminActionOptions } from './adminActions';
import { ProtectionSync } from './protectionSync';
import { setWorkspaceInvalid, workspaceWorldBounds } from '../game/paintWorkspaceFeedback';
import { pulsePieceBounds } from './piecePulse';

export class WorldMultiplayerSession {
  private connection: MultiplayerConnection;
  private paint: PaintSync;
  private replay: PaintReplay;
  private players: RemotePlayers;
  private playerSync: PlayerSync;
  private chat: ChatSync;
  private artworks: ArtworkSync;
  private pieces: PieceSync;
  private protection: ProtectionSync;
  private protectionRevision = 0;
  private previewKey = '';
  private previewSelection: PaintWorkspaceSelection | null = null;
  private previewOverlap = false;
  private selectedPieceId: string | null = null;
  private selectedPiece: PaintWorkspaceSelection | null = null;
  private selectedPieceForView: string | null = null;
  private piecePickSequence = 0;
  private removalWalls = new Set<string>();
  private pieceChunk = '';
  private nextNearbyPieceRefreshAt = 0;
  private piecePulseStop: (() => void) | null = null;
  private order: WorldOrder;
  readonly accounts: AccountFeatures;
  private multiplayer = false;
  private walls = new Map<string, PaintWall>();
  private visibility = [true];
  private recompose = new Set<string>();
  private status: MultiplayerStatus = { phase: 'solo', playerCount: 0 };
  private serverPermissions: ServerPermissions | null = null;
  private selectedPlayer: MultiplayerView['selectedPlayer'] = null;
  private roleChange: MultiplayerView['roleChange'];
  private adminResult: MultiplayerView['adminResult'];
  private lastView = '';
  private serverPlayerCount: number | null = null;
  private cosmetics: PlayerCosmetics = { outfit: 'street', top: 'coral', bottom: 'charcoal', accessory: 'none' };
  private lastPosition: number[];
  private snapshotPlayerId: string | null = null;
  private sharedRevision = 0;
  private requestedRevision = 0;
  private lastSharedAt = 0;
  constructor(private world: WorldEngine, private report: (status: MultiplayerStatus) => void,
    private reportView: (view: MultiplayerView) => void = () => {}) {
    this.lastPosition = world.playerPosition.toArray();
    this.players = new RemotePlayers(world.scene);
    this.replay = new PaintReplay(() => this.visibility);
    this.connection = new MultiplayerConnection(MULTIPLAYER_URL, status => {
      if (status.phase === 'disconnected' || status.phase === 'connecting') {
        this.protection?.reset();
        this.serverPermissions = null;
        this.world.adminFreePaint = false;
        this.selectedPlayer = null; this.roleChange = undefined; this.adminResult = undefined;
        this.selectedPieceForView = null;
        this.paint.interrupted(); this.artworks.interrupted(); this.players.clear(); this.serverPlayerCount = null;
        this.emitView();
      }
      this.emit(status);
    }, message => this.message(message));
    this.chat = new ChatSync(message => this.connection.send(message), () => this.emitView());
    this.order = new WorldOrder();
    this.pieces = new PieceSync(message => this.sendWorld(message), (_pieces, removedStrokeIds) => {
      this.protectionRevision++;
      if (removedStrokeIds?.length || this.removalWalls.size) {
        const affected = new Set<string>(this.removalWalls); this.removalWalls.clear();
        for (const id of removedStrokeIds ?? []) { const stroke = this.paint.strokes.get(id); const surface = stroke && decodeSurface(stroke.surfaceId); if (surface) affected.add(surface.wallId); }
        this.paint.removeStrokeIds(removedStrokeIds ?? []);
        for (const id of affected) { const wall = this.walls.get(id); if (wall) { this.replay.rebuild(wall); for (const stroke of this.paint.forWall(id)) this.paint.replay(stroke); } }
      }
      this.emitView();
    });
    this.accounts = new AccountFeatures(message => this.connection.send(message));
    this.artworks = new ArtworkSync(message => this.sendWorld(message), notice => this.emit({ ...this.status, notice }));
    this.paint = new PaintSync({
      send: message => this.sendWorld(message),
      reset: () => { this.replay.cancel(); this.refreshWalls(); for (const wall of this.walls.values()) this.replay.rebuild(wall); },
      draw: (stroke, points, previous) => {
        const surface = decodeSurface(stroke.surfaceId);
        const wall = surface ? this.walls.get(surface.wallId) : null;
        if (wall) this.replay.enqueue(wall, stroke, points, previous);
      },
    });
    this.playerSync = new PlayerSync(message => this.connection.send(message));
    this.protection = new ProtectionSync(message => this.connection.send(message), () => this.emitView());
    world.onPaintSample = (wall, hit, settings, continues) => {
      if (!this.multiplayer || !wall.surfaceId || !hit.face) return;
      const face = hit.face.materialIndex ?? 0;
      const selection = world.paintWorkspace?.selection;
      const recordedBounds = this.selectedPieceId ? this.pieces.pieces.get(this.selectedPieceId)?.bounds : undefined;
      const movedDraft = !!selection && !!recordedBounds && !!this.selectedPieceId && !this.protection.protections.has(this.selectedPieceId) &&
        JSON.stringify(recordedBounds) !== JSON.stringify(workspaceWorldBounds(selection));
      if (this.connection.connected && selection && (selection !== this.selectedPiece || movedDraft)) {
        this.completePiece();
        const bounds = new THREE.Box3();
        const positions = selection.preview.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) bounds.expandByPoint(selection.wall.mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, index)));
        bounds.expandByScalar(0.02);
        this.selectedPieceId = this.pieces.create(selection.center.toArray() as [number, number, number], { min: bounds.min.toArray() as [number, number, number], max: bounds.max.toArray() as [number, number, number] });
        this.selectedPiece = selection;
      }
      const value = this.paint.sample({
        pieceId: this.selectedPieceId ?? undefined,
        surfaceId: encodeSurface(wall.surfaceId, face, Math.max(0, settings.layerIndex)),
        colour: settings.color, tool: settings.eraseMode ? 'eraser' : ((settings as typeof settings & { brushHead?: string }).brushHead ? headForTool((settings as typeof settings & { brushHead?: string }).brushHead) : undefined) ?? 'spray', brushSize: settings.brushSize,
        operation: settings.eraseMode ? 'erase' : 'paint', opacity: this.connection.protocol === 1 ? 1 : Math.max(0.05, Math.min(1, settings.opacity)),
        layerIndex: Math.max(0, settings.layerIndex), face: String(face),
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z, pressure: this.connection.protocol === 1 ? Math.max(0.05, Math.min(1, settings.opacity)) : 1 },
      }, continues);
      if (this.replay.isRebuilding(wall)) this.replay.enqueue(wall, value.stroke, [value.stroke.points[value.stroke.points.length - 1]], value.previous);
    };
    world.onArtworkPlaced = (wall, face, artwork) => { if (this.multiplayer) void this.artworks.placed(wall, face, artwork, this.connection.connected); };
    world.onPlayerPick = event => {
      if (!this.multiplayer) return false;
      const picked = this.players.pick(event, this.world.renderer.domElement, this.world.cameraMode === 'map' ? this.world.mapCamera : this.world.camera, this.world.walls.map(wall => wall.mesh), this.world.playerPosition);
      if (!picked) { this.selectedPlayer = null; this.emitView(); return false; }
      this.selectedPlayer = picked; this.emitView(); return true;
    };
    world.onPiecePick = event => {
      if (!this.multiplayer) return false;
      const canvas = this.world.renderer.domElement;
      const normalized = elementPointerPoint(canvas, event);
      const pointer = new THREE.Vector2(normalized.x * 2 - 1, 1 - normalized.y * 2);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, this.world.cameraMode === 'map' ? this.world.mapCamera : this.world.camera);
      const wallMeshes = this.world.walls.filter(wall => wall.mesh.visible).map(wall => wall.mesh);
      const hit = raycaster.intersectObjects(wallMeshes, false).find(candidate => candidate.face && isPaintTargetReachable(
        raycaster.ray, candidate.point, candidate.distance, this.world.playerPosition, this.world.colliders,
      ));
      const piece = hit ? choosePieceAtWorldPoint(this.pieces.pieces.values(), [hit.point.x, hit.point.y, hit.point.z]) : null;
      this.selectedPieceForView = piece?.pieceId ?? null;
      this.piecePickSequence++;
      this.emitView();
      return !!piece;
    };
    world.onPaintEnd = () => this.paint.end();
    world.onMultiplayerFrame = (delta, settings) => this.update(delta, settings);
  }
  completePiece(title?: string): void {
    this.paint.end();
    if (this.selectedPieceId) this.pieces.complete(this.selectedPieceId, title);
    this.selectedPieceId = null; this.selectedPiece = null;
    this.protection?.setCurrentBounds(null, null);
  }
  setSelectedPieceTitle(title: string): boolean {
    if (!this.selectedPieceId) return false;
    return this.pieces.setLocalTitle(this.selectedPieceId, title);
  }
  inspectPiece(pieceId: string): boolean {
    const piece = this.pieces.pieces.get(pieceId);
    if (!piece) return false;
    this.piecePulseStop?.();
    this.piecePulseStop = pulsePieceBounds(this.world.scene, piece.protectionBounds ?? piece.bounds);
    const dx = piece.anchor[0] - this.world.playerPosition.x;
    const dy = piece.anchor[1] - this.world.playerPosition.y;
    const dz = piece.anchor[2] - this.world.playerPosition.z;
    this.world.playerYaw = Math.atan2(-dx, -dz);
    this.world.playerPitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.24, 1.18);
    this.world.cameraMode = 'first';
    return true;
  }
  likePiece(pieceId: string): boolean { return this.connection.connected && this.pieces.like(pieceId); }
  deletePiece(pieceId: string): boolean {
    if (!this.connection.connected || !canDeletePieces(this.serverPermissions) || !pieceId) return false;
    return this.sendWorld({ type: 'admin_delete_piece', pieceId });
  }
  adminPaintOver(pieceId: string, colour: string): boolean {
    if (!this.connection.connected || this.connection.protocol !== 2 || !canAdminPaint(this.serverPermissions) ||
        !/^#[0-9a-f]{6}$/i.test(colour)) return false;
    const target = this.pieces.pieces.get(pieceId);
    if (!target) return false;
    const fills: Array<{ wall: PaintWall; face: number; point: THREE.Vector3 }> = [];
    for (const wall of this.world.walls) {
      if (!wall.surfaceId) continue;
      const samples = adminPaintSamples(wall, target.protectionBounds ?? target.bounds, 0.07, 512 - fills.length);
      if (fills.length + samples.length > 512) return false;
      fills.push(...samples.map(sample => ({ wall, face: sample.face, point: sample.point })));
    }
    if (!fills.length) return false;
    this.completePiece();
    clearPaintWorkspace(this.world);
    const replacementId = this.pieces.create(target.anchor, target.protectionBounds ?? target.bounds);
    if (!replacementId) return false;
    this.selectedPieceId = replacementId;
    const settings: LiveSettings = {
      paintMode: true, eraseMode: false, color: colour, opacity: 1, brushSize: 5, brushHead: 'roller',
      movement: { x: 0, y: 0 }, lookInput: { x: 0, y: 0 }, moveSpeed: 0, jumpPower: 0,
      lookSensitivity: 0, fogDensity: 0, layerIndex: 4, layerVisibility: this.visibility,
    };
    let previous: PaintPoint | null = null;
    let previousWall: PaintWall | null = null;
    let previousFace = -1;
    try {
      for (const sample of fills) {
        const continues = previousWall === sample.wall && previousFace === sample.face &&
          !!previous?.worldPoint && previous.worldPoint[0] !== undefined &&
          Math.hypot(previous.worldPoint[0] - sample.point.x, previous.worldPoint[1] - sample.point.y, previous.worldPoint[2] - sample.point.z) <= 8.5;
        if (!continues) { this.paint.end(); previous = null; }
        const hit = pointToHit(sample.wall, sample.face, { x: sample.point.x, y: sample.point.y, z: sample.point.z, pressure: 1 });
        if (!hit) continue;
        previous = stampPaintHit(sample.wall, hit, colour, 1, paintRadius(settings.brushSize), 4,
          continues ? previous : null, true, false, 'roller');
        if (!previous) continue;
        previousWall = sample.wall; previousFace = sample.face;
        this.world.onPaintSample?.(sample.wall, hit, settings, continues);
      }
      this.paint.end();
      this.pieces.complete(replacementId);
      return true;
    } finally {
      this.paint.end();
      this.selectedPieceId = null; this.selectedPiece = null;
    }
  }
  adminAction(action: AdminAction, targetUsername: string, options: AdminActionOptions): boolean {
    if (!this.connection.connected || this.connection.protocol !== 2) return false;
    const message = buildAdminAction(this.serverPermissions?.role, this.players.roleForUsername(targetUsername) ?? (this.selectedPlayer?.username.toLowerCase() === targetUsername.toLowerCase() ? this.selectedPlayer.role : undefined), action, targetUsername, options);
    return !!message && this.connection.send(message);
  }
  setRole(targetUsername: string, role: ServerRole): boolean {
    const ownRole = this.serverPermissions?.role;
    if (!this.connection.connected || this.connection.protocol !== 2 || !targetUsername || !canManageRole(ownRole, this.players.roleForUsername(targetUsername), role)) return false;
    return this.sendWorld({ type: 'admin_set_role', targetUsername, role });
  }
  join(displayName: string, roomId = DEFAULT_ROOM_ID, identity?: PlayerIdentity): void {
    this.protection.reset();
    this.serverPermissions = null;
    this.world.adminFreePaint = false;
    this.selectedPlayer = null; this.roleChange = undefined; this.adminResult = undefined;
    this.selectedPieceForView = null;
    this.completePiece(); this.pieces.clear(); clearPaintWorkspace(this.world);
    this.paint.interrupted(); this.artworks.interrupted(); this.players.clear(); this.playerSync.reset(); this.serverPlayerCount = null;
    this.connection.connect(displayName, roomId, identity);
  }
  leave(): void {
    this.piecePulseStop?.(); this.piecePulseStop = null;
    this.protection.reset();
    this.serverPermissions = null;
    this.world.adminFreePaint = false;
    this.selectedPlayer = null; this.roleChange = undefined; this.adminResult = undefined;
    this.selectedPieceForView = null;
    this.completePiece(); clearPaintWorkspace(this.world); this.connection.disconnect(); this.players.clear(); this.replay.cancel(); this.artworks.clear(); this.pieces.clear();
    this.multiplayer = false; this.world.multiplayerActive = false; this.walls.clear(); this.recompose.clear();
    this.chat.clear(); this.accounts.snapshotWorldItems([]); this.order.snapshot({}); this.emitView();
    this.snapshotPlayerId = null; this.sharedRevision = this.requestedRevision = 0;
    this.world.setPaintSession('solo'); this.world.paintRevision++;
  }
  dispose(): void {
    this.piecePulseStop?.(); this.piecePulseStop = null;
    this.protection.reset();
    this.serverPermissions = null;
    this.world.adminFreePaint = false;
    this.selectedPlayer = null; this.roleChange = undefined; this.adminResult = undefined;
    this.selectedPieceForView = null;
    this.completePiece(); clearPaintWorkspace(this.world); this.connection.disconnect(); this.players.clear(); this.replay.cancel(); this.artworks.clear(); this.pieces.clear();
    this.world.multiplayerActive = false;
    this.world.onPaintSample = this.world.onPaintEnd = this.world.onMultiplayerFrame = this.world.onArtworkPlaced = this.world.onPlayerPick = this.world.onPiecePick = undefined;
  }
  sendChat(text: string): boolean { return this.chat.send(text); }
  workspaceChanged(): void {
    const selection = this.world.paintWorkspace?.selection;
    if (!selection) { this.protection.setCurrentBounds(null, null); return; }
    if (this.selectedPieceId && this.selectedPiece?.wall === selection.wall && this.selectedPiece.face === selection.face) {
      this.selectedPiece = selection;
      this.protection.setCurrentBounds(this.selectedPieceId, workspaceWorldBounds(selection));
    }
  }
  quoteProtection(): boolean {
    const selection = this.world.paintWorkspace?.selection;
    if (!this.connection.connected || this.connection.protocol !== 2 || !selection || selection.hasPaint) return false;
    const bounds = workspaceWorldBounds(selection);
    if (!this.selectedPieceId || !this.selectedPiece || this.selectedPiece.wall !== selection.wall || this.selectedPiece.face !== selection.face || this.selectedPiece.hasPaint) {
      this.completePiece();
      this.selectedPieceId = this.pieces.create(selection.center.toArray(), bounds);
    }
    this.selectedPiece = selection;
    return !!this.selectedPieceId && this.protection.requestQuote(this.selectedPieceId, bounds);
  }
  purchaseProtection(): boolean {
    if (!this.connection.connected || !this.selectedPieceId || !this.protection.currentBounds) return false;
    if (this.world.paintWorkspace?.selection) this.world.paintWorkspace.selection.moving = false;
    return this.protection.purchase(this.selectedPieceId, this.protection.currentBounds);
  }
  resync(): boolean {
    const sent = this.connection.send({ type: 'resync_request' });
    if (sent) this.requestedRevision = this.sharedRevision;
    return sent;
  }
  setCosmetics(cosmetics: PlayerCosmetics): void { this.cosmetics = { ...cosmetics }; }
  emote(emote: AvatarEmote): void {
    this.connection.send({ type: 'player_action', actionId: crypto.randomUUID(), action: 'emote', data: { emote } });
  }
  private message(message: Message): void {
    if (['admin_give_credits_complete', 'admin_ban_complete', 'admin_unban_complete'].includes(message.type) && typeof message.targetUsername === 'string') {
      this.adminResult = { type: message.type, targetUsername: message.targetUsername,
        amount: Number.isSafeInteger(message.amount) ? message.amount as number : undefined,
        balance: Number.isSafeInteger(message.balance) && (message.balance as number) >= 0 ? message.balance as number : undefined,
        permanent: typeof message.permanent === 'boolean' ? message.permanent : undefined,
        bannedUntil: typeof message.bannedUntil === 'number' && Number.isFinite(message.bannedUntil) ? message.bannedUntil : undefined,
        serverTime: typeof message.serverTime === 'number' && Number.isFinite(message.serverTime) ? message.serverTime : undefined };
      this.emitView(); return;
    }
    const confirmedBounds = message.type === 'protection_purchased' && typeof message.pieceId === 'string'
      ? this.protection.purchaseBoundsFor(message.pieceId) : null;
    if (this.protection.accept(message)) {
      if (message.type === 'protection_purchased' || message.type === 'piece_protection_updated') this.pieces.accept(confirmedBounds ? { ...message, protectionBounds: confirmedBounds } : message);
      return;
    }
    if (message.type === 'permissions') {
      this.serverPermissions = readPermissions(message);
      this.world.adminFreePaint = this.connection.connected && this.connection.protocol === 2 && canAdminPaint(this.serverPermissions);
      this.emit({ ...this.status, role: this.serverPermissions?.role ?? 'player' });
      return;
    }
    if (message.type === 'player_role_changed' && typeof message.playerId === 'string' && typeof message.username === 'string' && isServerRole(message.role)) {
      this.players.roleChanged(message.playerId, message.username, message.role);
      if (this.selectedPlayer?.playerId === message.playerId) this.selectedPlayer = this.players.get(message.playerId);
      this.emitView(); return;
    }
    if (message.type === 'admin_set_role_complete' && typeof message.targetUsername === 'string' && isServerRole(message.previousRole) && isServerRole(message.role) && typeof message.serverTime === 'number') {
      this.roleChange = { targetUsername: message.targetUsername, previousRole: message.previousRole, role: message.role, serverTime: message.serverTime };
      this.emitView(); return;
    }
    if (message.type === 'world_snapshot') {
      const sameConnection = this.snapshotPlayerId === this.connection.playerId;
      this.snapshotPlayerId = this.connection.playerId;
      if (!sameConnection) { this.paint.interrupted(); this.world.paintRevision++; }
      this.multiplayer = true; this.world.multiplayerActive = true;
      this.order.snapshot(message);
      this.world.setPaintSession('multiplayer'); this.refreshWalls();
      this.players.clear();
      for (const player of message.players as unknown[]) this.players.joined(player, this.connection.playerId);
      this.serverPlayerCount = Number.isInteger(message.playerCount) ? message.playerCount as number : null;
      this.paint.snapshot(message.strokes as unknown[], sameConnection);
      this.chat.snapshot(Array.isArray(message.chatHistory) ? message.chatHistory : []);
      this.pieces.snapshot(Array.isArray(message.graffitiPieces) ? message.graffitiPieces : []);
      this.protection.protections.clear();
      for (const piece of this.pieces.pieces.values()) {
        if (piece.protectedUntil !== undefined) this.protection.protections.set(piece.pieceId, { pieceId: piece.pieceId, protectedUntil: piece.protectedUntil });
      }
      if (this.selectedPieceForView && !this.pieces.pieces.has(this.selectedPieceForView)) this.selectedPieceForView = null;
      this.artworks.snapshot(Array.isArray(message.artworks) ? message.artworks : []);
      this.accounts.snapshotWorldItems(Array.isArray(message.worldItems) ? message.worldItems : []);
      this.artworks.refresh(this.walls); this.playerSync.reset(); this.emitView();
      return;
    }
    const ordered = message.type.startsWith('piece_') || message.type.startsWith('stroke_') || message.type.startsWith('artwork_') || message.type.startsWith('item_') || message.type === 'chat_message';
    if (ordered && !this.order.accept(message)) return;
    if (message.type === 'player_joined') {
      this.players.joined(message.player, this.connection.playerId); this.serverPlayerCount = null; this.emit(this.status);
    } else if (message.type === 'player_left' && typeof message.playerId === 'string') {
      this.players.left(message.playerId); this.serverPlayerCount = null; this.emit(this.status);
      if (this.selectedPlayer?.playerId === message.playerId) { this.selectedPlayer = ['admin', 'owner'].includes(this.serverPermissions?.role ?? '') ? { ...this.selectedPlayer, online: false } : null; this.emitView(); }
    } else if (message.type === 'player_count') {
      const count = message.playerCount ?? message.count;
      if (Number.isInteger(count) && (count as number) >= 0) this.serverPlayerCount = count as number;
      this.emit(this.status);
    } else if (message.type === 'player_state' && typeof message.playerId === 'string' && message.playerId !== this.connection.playerId) {
      this.players.state(message.playerId, message.state);
    } else if (message.type === 'player_action' && message.playerId !== this.connection.playerId) this.players.action(message);
    else if (message.type === 'chat_message') this.chat.accept(message);
    else if (message.type === 'artwork_place' || message.type === 'artwork_placed') { this.artworks.accept(message); this.artworks.refresh(this.walls); }
    else if (message.type.startsWith('piece_')) {
      if (message.type === 'piece_removed' && typeof message.pieceId === 'string') {
        for (const surfaceId of this.paint.rejectPiece(message.pieceId)) { const surface = decodeSurface(surfaceId); if (surface) this.removalWalls.add(surface.wallId); }
      }
      if (message.type === 'piece_removed' && message.pieceId === this.selectedPieceId) {
        this.selectedPieceId = null; this.selectedPiece = null; this.world.paintRevision++;
      }
      if (message.type === 'piece_removed' && message.pieceId === this.selectedPieceForView) this.selectedPieceForView = null;
      if (message.type === 'piece_removed' && typeof message.pieceId === 'string') this.protection.protections.delete(message.pieceId);
      this.pieces.accept(message);
      const current = this.selectedPieceId ? this.pieces.pieces.get(this.selectedPieceId) : undefined;
      if (current?.protectedUntil !== undefined) this.protection.protections.set(current.pieceId, { pieceId: current.pieceId, protectedUntil: current.protectedUntil });
    }
    else if (message.type.startsWith('item_')) this.accounts.worldItemEvent(message);
    else if (message.type.startsWith('stroke_')) {
      this.paint.accept(message);
      if (message.type === 'stroke_end' && typeof message.strokeId === 'string') {
        // A snapshot stores whole strokes with their final sequence. Recompose on completion to
        // converge live interleaved strokes and later snapshot replay to the same final order.
        const stroke = this.paint.strokes.get(message.strokeId), surface = stroke && decodeSurface(stroke.surfaceId);
        const wall = surface ? this.walls.get(surface.wallId) : undefined;
        if (wall) this.recompose.add(wall.surfaceId!);
      }
    }
    if (ordered) this.emitView();
  }
  private refreshWalls(): void {
    if (!this.multiplayer) return;
    const next = new Map(this.world.walls.filter(w => w.surfaceId).map(w => [w.surfaceId!, w]));
    this.replay.removeMissing(next);
    for (const [id, wall] of next) {
      if (this.walls.get(id) === wall) continue;
      this.replay.rebuild(wall);
      this.walls.set(id, wall);
      for (const stroke of this.paint.forWall(id)) this.paint.replay(stroke);
    }
    this.walls = next;
    this.artworks.refresh(next);
  }
  private update(delta: number, settings: LiveSettings): void {
    this.visibility = settings.layerVisibility;
    if (!this.multiplayer) return;
    this.protection.tick();
    const selection = this.world.paintWorkspace?.selection;
    const previewKey = `${this.protectionRevision}:${Math.floor(Date.now() / 1000)}`;
    if (selection !== this.previewSelection || previewKey !== this.previewKey) {
      this.previewSelection = selection ?? null; this.previewKey = previewKey; this.previewOverlap = false;
      if (selection) {
        const bounds = workspaceWorldBounds(selection);
        for (const piece of this.pieces.pieces.values()) {
          if (piece.pieceId === this.selectedPieceId || piece.owner === this.connection.playerId || !piece.protectedUntil || piece.protectedUntil <= Date.now()) continue;
          const other = piece.protectionBounds ?? piece.bounds;
          if (bounds.min.every((n, axis) => n <= other.max[axis] && bounds.max[axis] >= other.min[axis])) { this.previewOverlap = true; break; }
        }
      }
    }
    const quote = this.protection.quote;
    setWorkspaceInvalid(this.world.paintWorkspace?.selection, !this.world.adminFreePaint && (
      (quote !== null && this.protection.creditBalance !== null && quote.cost > this.protection.creditBalance) ||
      this.previewOverlap || this.protection.errorCode === 'protected_area_overlap' || this.protection.errorCode === 'insufficient_credits'
    ));
    this.refreshWalls();
    this.paint.flush(performance.now()); this.replay.update(); this.players.update(delta);
    for (const id of this.recompose) {
      const wall = this.walls.get(id);
      if (!wall) { this.recompose.delete(id); continue; }
      if (this.replay.isRebuilding(wall)) continue;
      this.recompose.delete(id); this.replay.rebuild(wall);
      for (const saved of this.paint.forWall(id)) this.paint.replay(saved);
    }
    // The server does not echo accepted own stroke sequences. Fetch canonical metadata once
    // the brush is idle; never interrupt input or repeatedly restart a long wall reconstruction.
    if (this.connection.connected && this.sharedRevision > this.requestedRevision && !this.paint.drawing && !this.replay.rebuilding && performance.now() - this.lastSharedAt > 1500) {
      if (this.resync()) this.requestedRevision = this.sharedRevision;
    }
    const position = this.world.playerPosition.toArray();
    const moving = position.some((n, i) => Math.abs(n - this.lastPosition[i]) > 0.001);
    const jumping = Math.abs(this.world.velocityY) > 0.1 || this.world.abilityActive;
    const emote = this.world.playerAvatar?.userData.activeEmote?.name ?? '';
    this.playerSync.update({
      position, rotation: [this.world.playerPitch, this.world.playerYaw, 0], movement: moving ? 'walking' : 'idle',
      tool: settings.paintMode ? settings.eraseMode ? 'eraser' : 'spray' : 'off', jumping,
      animation: emote || (jumping ? 'jumping' : moving ? 'walking' : 'idle'), emote,
      visibleHeldItem: ['sprayCan', 'basketball'].includes(this.cosmetics.accessory) ? this.cosmetics.accessory : 'none',
      flightState: this.world.abilityActive ? this.cosmetics.outfit === 'jax' ? 'flying' : 'levitating' : 'grounded',
      cosmetics: this.cosmetics,
    }, performance.now());
    this.lastPosition = position;
    const chunk = Math.floor(position[0] / 32) + ':' + Math.floor(position[2] / 32);
    const now = performance.now();
    if (chunk !== this.pieceChunk || now >= this.nextNearbyPieceRefreshAt) {
      this.pieceChunk = chunk;
      this.nextNearbyPieceRefreshAt = now + 1000;
      this.emitView();
    }
  }
  private emitView(): void {
    const nearbyPieces = [...this.pieces.pieces.values()].filter(piece => this.world.playerPosition.distanceToSquared(new THREE.Vector3(...piece.anchor)) <= 96 * 96).sort((a, b) => this.world.playerPosition.distanceToSquared(new THREE.Vector3(...a.anchor)) - this.world.playerPosition.distanceToSquared(new THREE.Vector3(...b.anchor)));
    const pieces = nearbyPieces.slice(0, 20);
    const selectedPiece = this.selectedPieceForView ? this.pieces.pieces.get(this.selectedPieceForView) : undefined;
    if (selectedPiece && !pieces.some(piece => piece.pieceId === selectedPiece.pieceId)) pieces.push(selectedPiece);
    const protection = this.protection;
    const protectedUntil = this.selectedPieceId ? protection?.protections.get(this.selectedPieceId)?.protectedUntil ?? null : null;
    const view: MultiplayerView = { adminResult: this.adminResult, protection: protection ? { creditBalance: protection.creditBalance, quote: protection.quote, pendingQuote: !!protection.pendingQuotePieceId, pendingPurchase: !!protection.pendingPurchasePieceId, protectedUntil, notice: protection.notice } : undefined, chat: this.chat.messages, revision: this.order.revision, selectedPlayer: this.selectedPlayer, selectedPieceId: this.selectedPieceForView, piecePickSequence: this.piecePickSequence, roleChange: this.roleChange,
      accountFeaturesAvailable: this.accounts.available, worldItemCount: this.accounts.worldItems.size,
      pieces };
    const serial = JSON.stringify(view);
    if (serial === this.lastView) return;
    this.lastView = serial; this.reportView(view);
  }
  private sendWorld(message: Message): boolean {
    const sent = this.connection.send(message);
    if (sent && (message.type === 'stroke_end' || message.type === 'artwork_place' || message.type === 'piece_create' || message.type === 'piece_complete' || message.type === 'piece_like')) {
      this.sharedRevision++; this.lastSharedAt = performance.now();
    }
    return sent;
  }
  private emit(status: MultiplayerStatus): void {
    this.world.adminFreePaint = this.connection.connected && this.connection.protocol === 2 && canAdminPaint(this.serverPermissions);
    status = {
      ...status,
      role: status.phase === 'connected' ? this.serverPermissions?.role : undefined,
      canDeletePieces: this.connection.connected && canDeletePieces(this.serverPermissions),
      canAdminPaint: this.connection.connected && this.connection.protocol === 2 && canAdminPaint(this.serverPermissions),
    };
    const next = { ...status, playerCount: status.phase === 'connected' ? this.serverPlayerCount ?? this.players.count + 1 : 0 };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next; this.report(next);
  }
}

function isServerRole(value: unknown): value is ServerRole { return value === 'player' || value === 'moderator' || value === 'admin' || value === 'owner'; }
