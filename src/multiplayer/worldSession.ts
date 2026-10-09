import { getRenderSettings } from '@/game/renderSettings';
import { withinLiveStrokeDistance } from '@/game/liveStrokeDistance';
import * as THREE from 'three';
import type { AvatarEmote, LiveSettings, PaintWall, PaintWorkspaceSelection, WorldEngine } from '../game/worldTypes';
import { MultiplayerConnection, type PlayerIdentity } from './connection';
import { DEFAULT_ROOM_ID, MULTIPLAYER_URL } from './config';
import { PaintSync } from './paintSync';
import { PaintReplay } from './paintReplay';
import { headForTool } from '../game/sprayHeads';
import { PlayerSync } from './playerSync';
import { SpeechBubble } from '../game/speechBubble';
import { RemotePlayers } from './remotePlayers';
import { PlayerDirectory } from './playerDirectory';
import { SpatialDirectory } from './spatialDirectory';
import { readChatMute } from './chatMute';
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
import { ArtworkUpload } from './artworkUpload';
import {
  captureFlattenedPiece,
  flattenedPieceArtworkMessage,
  type FlattenedPieceCapture,
} from './pieceFlatten';
import { setWorkspaceInvalid, workspaceWorldBounds } from '../game/paintWorkspaceFeedback';
import { pulsePieceBounds } from './piecePulse';
import { OwnerReferences, type OwnerReferenceDraft } from './ownerReferences';
import { readAdminArtRemovalProgress } from './adminArtRemoval';
import { readSpatialStatus, readSpatialDelta, readStrokeHistory, readGestureUndone, readGestureRedone } from './spatialProtocol';
import type { CourtConnection, CourtListener } from './basketballSync';
import { BASKETBALL_CAPABILITY, readCourtRequest } from '../game/basketballSession';
import { BASKETBALL_COURT } from '../game/basketballCourt';
import { MAIN_ROOM_ID, MAIN_WORLD_ID } from './config';

export class WorldMultiplayerSession {
  private courtListeners = new Set<CourtListener>();
  get courtConnection(): CourtConnection {
    return { connected: this.connection.connected, playerId: this.connection.playerId,
      capabilities: [...this.connection.capabilities], roomId: this.connection.admittedRoomId,
      worldId: this.connection.admittedWorldId, serverTime: this.connection.serverTime };
  }
  subscribeCourt(listener: CourtListener): () => void {
    this.courtListeners.add(listener); listener(null, this.courtConnection);
    return () => this.courtListeners.delete(listener);
  }
  sendCourt(message: Message): boolean {
    const context = this.courtConnection;
    const request = readCourtRequest(message);
    return !!request && request.type.startsWith('court_') && request.roomId === MAIN_ROOM_ID && request.mapId === BASKETBALL_COURT.mapId && request.courtId === BASKETBALL_COURT.id &&
      context.connected && this.connection.protocol === 2 && context.roomId === MAIN_ROOM_ID && context.worldId === MAIN_WORLD_ID &&
      context.capabilities.includes(BASKETBALL_CAPABILITY) && this.connection.send(message);
  }
  private emitCourt(message: Message | null = null): void {
    for (const listener of this.courtListeners) listener(message, this.courtConnection);
  }
  private connection: MultiplayerConnection;
  private paint: PaintSync;
  private replay: PaintReplay;
  private players: RemotePlayers;
  private profiles = new PlayerDirectory();
  private directory = new SpatialDirectory();
  private spatialEnabled = false;
  private ownerReferences: OwnerReferences;
  private ownerReferenceBusy = false;
  private ownerReferencesRequested = false;
  private ownerReferenceNotice = '';
  private ownerReferenceGeneration = 0;
  private strokeHistory: MultiplayerView['strokeHistory'] = null;
  private historyBusy = false;
  private artRemoval: MultiplayerView['artRemoval'] = null;
  private artRemovalTarget: string | null = null;
  private selectedArtworkId: string | null = null;
  private ownIdentity = { username: '', nickName: 'PLAYER' };
  private playerSync: PlayerSync;
  private chat: ChatSync;
  private ownSpeech: SpeechBubble;
  private artworks: ArtworkSync;
  private pieces: PieceSync;
  private protection: ProtectionSync;
  private canvasProtectionEnabled = false;
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
  private readonly pieceFlattenUpload = new ArtworkUpload();
  private flattenPrepareGeneration = 0;
  private pendingFlatten: {
    pieceId: string;
    generation: number;
    prepared: boolean;
    commitRequested: boolean;
  } | null = null;
  readonly accounts: AccountFeatures;
  private multiplayer = false;
  private walls = new Map<string, PaintWall>();
  private visibility = [true];
  private recompose = new Set<string>();
  private status: MultiplayerStatus = { phase: 'solo', playerCount: 0 };
  private serverPermissions: ServerPermissions | null = null;
  private chatMute: MultiplayerView['chatMute'] = null;
  private selectedPlayer: MultiplayerView['selectedPlayer'] = null;
  private playerPickSequence = 0;
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
    this.ownSpeech = new SpeechBubble(world.playerAvatar);
    this.replay = new PaintReplay(() => this.visibility);
    this.connection = new MultiplayerConnection(MULTIPLAYER_URL, status => {
      if (status.phase === 'disconnected' || status.phase === 'connecting') {
        this.protection?.reset();
        this.resetClientTools();
        this.serverPermissions = null;
        this.world.adminFreePaint = false;
        this.selectedPlayer = null; this.roleChange = undefined; this.adminResult = undefined; this.chatMute = null;
        this.selectedPieceForView = null;
        this.paint.interrupted(); this.artworks.interrupted(); this.players.clear(); this.directory.clear(); this.spatialEnabled = false; this.ownSpeech.dispose(); this.serverPlayerCount = null;
        this.emitView();
      }
      this.emit(status);
      this.emitCourt();
    }, message => this.message(message));
    this.chat = new ChatSync(message => this.connection.send(message), () => this.emitView(), message => {
      if (message.playerId === this.connection.playerId) {
        this.ownSpeech.show(message.text);
        // An accepted live self-message is also authoritative evidence chat is allowed.
        if (this.chatMute?.muted) { this.chatMute = null; this.emitView(); }
      }
      else this.players.say(message.playerId, message.text);
    });
    this.order = new WorldOrder();
    this.pieces = new PieceSync(message => this.sendWorld(message), (_pieces, removedStrokeIds) => {
      this.protectionRevision++;
      if (removedStrokeIds?.length || this.removalWalls.size) {
        const affected = new Set<string>(this.removalWalls); this.removalWalls.clear();
        for (const id of removedStrokeIds ?? []) { const stroke = this.paint.strokes.get(id); const surface = stroke && decodeSurface(stroke.surfaceId); if (surface) affected.add(surface.wallId); }
        this.paint.removeStrokeIds(removedStrokeIds ?? []);
        for (const id of affected) this.recompose.add(id);
      }
      this.emitView();
    });
    this.accounts = new AccountFeatures(message => this.connection.send(message));
    this.artworks = new ArtworkSync(message => this.sendWorld(message), notice => this.emit({ ...this.status, notice }));
    this.paint = new PaintSync({
      send: message => this.sendWorld(message),
      reset: () => { this.replay.cancel(); this.refreshWalls(); for (const wall of this.walls.values()) { if (this.shouldReplayWall(wall)) this.replay.rebuild(wall); else this.recompose.add(wall.surfaceId!); } },
      draw: (stroke, points, previous) => {
        const surface = decodeSurface(stroke.surfaceId);
        const wall = surface ? this.walls.get(surface.wallId) : null;
        if (wall) {
          if (stroke.playerId === this.connection.playerId || this.shouldReplayWall(wall)) this.replay.enqueue(wall, stroke, points, previous);
          else this.recompose.add(surface!.wallId);
        }
      },
    });
    this.ownerReferences = new OwnerReferences(world.scene, message => this.connection.send(message), () => this.emitView());
    this.playerSync = new PlayerSync(message => this.connection.send(message));
    this.protection = new ProtectionSync(message => this.connection.send(message), () => this.emitView());
    world.onPaintSample = (wall, hit, settings, continues) => {
      if (!this.multiplayer || !wall.surfaceId || !hit.face) return;
      const face = hit.face.materialIndex ?? 0;
      const selection = world.paintWorkspace?.selection;
      const recordedBounds = this.selectedPieceId ? this.pieces.pieces.get(this.selectedPieceId)?.bounds : undefined;
      const movedDraft = !!selection && !!recordedBounds && !!this.selectedPieceId && !this.protection.protections.has(this.selectedPieceId) &&
        !selection.purchaseApproved && JSON.stringify(recordedBounds) !== JSON.stringify(workspaceWorldBounds(selection));
      if (this.connection.connected && selection && (selection !== this.selectedPiece || movedDraft)) {
        this.completePiece();
        this.selectedPieceId = this.pieces.create(selection.center.toArray(), workspaceWorldBounds(selection));
        this.selectedPiece = selection;
      }
      const wasDrawing = this.paint.drawing;
      const value = this.paint.sample({
        pieceId: this.selectedPieceId ?? undefined,
        surfaceId: encodeSurface(wall.surfaceId, face, Math.max(0, settings.layerIndex)),
        colour: settings.color, tool: settings.eraseMode ? 'eraser' : ((settings as typeof settings & { brushHead?: string }).brushHead ? headForTool((settings as typeof settings & { brushHead?: string }).brushHead) : undefined) ?? 'spray', brushSize: settings.brushSize,
        operation: settings.eraseMode ? 'erase' : 'paint', opacity: this.connection.protocol === 1 ? 1 : Math.max(0.05, Math.min(1, settings.opacity)),
        layerIndex: Math.max(0, settings.layerIndex), face: String(face),
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z, pressure: this.connection.protocol === 1 ? Math.max(0.05, Math.min(1, settings.opacity)) : 1 },
      }, continues);
      if (!wasDrawing) this.emitView();
      if (this.replay.isRebuilding(wall)) this.replay.enqueue(wall, value.stroke, [value.stroke.points[value.stroke.points.length - 1]], value.previous);
    };
    world.onArtworkPlaced = (wall, face, artwork) => { if (this.multiplayer) void this.artworks.placed(wall, face, artwork, this.connection.connected); };
    world.onPlayerPick = event => {
      if (!this.multiplayer) return false;
      const picked = this.players.pick(event, this.world.renderer.domElement, this.world.cameraMode === 'map' ? this.world.mapCamera : this.world.camera, this.world.walls.map(wall => wall.mesh), this.world.playerPosition);
      if (!picked) { this.selectedPlayer = null; this.emitView(); return false; }
      this.selectedPlayer = picked; this.playerPickSequence++; this.emitView(); return true;
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
      this.selectedArtworkId = null;
      if (piece) this.pulsePiece(piece.pieceId);
      else if (hit) {
        const artwork = this.artworks.entries().slice().reverse().find(value => {
          if (value.id.startsWith('piece:')) return false;
          const matrix = this.artworkWorldMatrix(value);
          if (!matrix) return false;
          const point = hit.point.clone().applyMatrix4(matrix.invert());
          return Math.abs(point.z) < .15 && Math.abs(point.x) <= value.width / 2 && Math.abs(point.y) <= value.height / 2;
        });
        this.selectedArtworkId = artwork?.id ?? null;
        if (artwork) this.pulseArtwork(artwork.id);
      }
      this.piecePickSequence++;
      this.emitView();
      return !!piece || !!this.selectedArtworkId;
    };
    world.onPaintEnd = () => {
      const wasDrawing = this.paint.drawing;
      this.paint.end();
      if (wasDrawing) this.emitView();
    };
    world.onMultiplayerFrame = (delta, settings) => this.update(delta, settings);
  }
  completePiece(title?: string): void {
    this.paint.end();
    if (this.selectedPieceId) this.pieces.complete(this.selectedPieceId, title);
    this.selectedPieceId = null; this.selectedPiece = null; this.strokeHistory = null; this.historyBusy = false;
    this.protection?.setCurrentBounds(null, null);
  }
  preparePieceFlatten(): void {
    const pieceId = this.selectedPieceId;
    const selection = this.selectedPiece;

    if (
      !pieceId ||
      !selection?.hasPaint ||
      !this.connection.connected ||
      this.connection.protocol !== 2 ||
      !this.connection.capabilities.includes('piece_flatten_deferred')
    ) return;

    const capture = captureFlattenedPiece(selection, this.visibility);
    if (!capture) return;

    const generation = ++this.flattenPrepareGeneration;

    this.pendingFlatten = {
      pieceId,
      generation,
      prepared: false,
      commitRequested: false,
    };

    void this.uploadPreparedFlatten(pieceId, capture, generation);
  }

  cancelPreparedPieceFlatten(): void {
    const pieceId = this.pendingFlatten?.pieceId ?? this.selectedPieceId;

    this.flattenPrepareGeneration++;
    this.pendingFlatten = null;

    if (
      !pieceId ||
      !this.connection.connected ||
      this.connection.protocol !== 2 ||
      !this.connection.capabilities.includes('piece_flatten_deferred')
    ) return;

    this.connection.send({
      type: 'piece_flatten_cancel',
      pieceId,
    });
  }

  finalizePiece(title?: string): void {
    const pieceId = this.selectedPieceId;
    const selection = this.selectedPiece;

    const canFlatten =
      !!pieceId &&
      !!selection?.hasPaint &&
      this.connection.connected &&
      this.connection.protocol === 2 &&
      this.connection.capabilities.includes('piece_flatten');

    const deferred =
      canFlatten &&
      this.connection.capabilities.includes('piece_flatten_deferred');

    let immediateCapture: FlattenedPieceCapture | null = null;

    if (canFlatten && !deferred && selection) {
      immediateCapture = captureFlattenedPiece(selection, this.visibility);
    }

    if (deferred && pieceId && selection) {
      let pending =
        this.pendingFlatten?.pieceId === pieceId
          ? this.pendingFlatten
          : null;

      if (!pending) {
        const capture = captureFlattenedPiece(selection, this.visibility);

        if (capture) {
          const generation = ++this.flattenPrepareGeneration;

          pending = {
            pieceId,
            generation,
            prepared: false,
            commitRequested: true,
          };

          this.pendingFlatten = pending;

          void this.uploadPreparedFlatten(pieceId, capture, generation);
        }
      } else {
        pending.commitRequested = true;
      }
    }

    this.completePiece(title);

    if (!canFlatten || !pieceId) return;

    if (deferred) {
      const pending = this.pendingFlatten;

      if (
        pending?.pieceId === pieceId &&
        pending.prepared
      ) {
        this.connection.send({
          type: 'piece_flatten_commit',
          pieceId,
        });
      }

      return;
    }

    if (immediateCapture) {
      void this.uploadFlattenedPiece(pieceId, immediateCapture);
    }
  }
  setSelectedPieceTitle(title: string): boolean {
    if (!this.selectedPieceId) return false;
    return this.pieces.setLocalTitle(this.selectedPieceId, title);
  }
  inspectPiece(pieceId: string): boolean {
    const piece = this.pieces.pieces.get(pieceId);
    if (!piece) return false;
    this.piecePulseStop?.();
    this.pulsePiece(pieceId);
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
    if (action === 'remove-all-art' && (!this.canRemoveAllArt() || this.artRemovalTarget)) return false;
    const message = buildAdminAction(this.serverPermissions?.role, this.directory.roleForUsername(targetUsername) ?? (this.selectedPlayer?.username.toLowerCase() === targetUsername.toLowerCase() ? this.selectedPlayer.role : undefined), action, targetUsername, options);
    const sent = !!message && this.connection.send(message);
    if (sent && action === 'remove-all-art') { this.artRemovalTarget = targetUsername.replace(/^@/, '').toLowerCase(); this.artRemoval = null; this.emitView(); }
    return sent;
  }
  private canKeepReference(): boolean {
    return this.connection.connected && this.connection.protocol === 2 && this.serverPermissions?.role === 'owner' && this.connection.capabilities.includes('owner_reference_persistence');
  }
  private canRemoveAllArt(): boolean {
    return this.connection.connected && this.connection.protocol === 2 && ['owner','admin'].includes(this.serverPermissions?.role ?? '') && canDeletePieces(this.serverPermissions) && this.connection.capabilities.includes('admin_bulk_art_remove');
  }
  private syncOwnerAccess(): void {
    const enabled = this.canKeepReference();
    this.ownerReferences.setAccess(enabled);
    if (enabled && !this.ownerReferencesRequested) this.ownerReferencesRequested = this.ownerReferences.list();
    if (!enabled) this.ownerReferencesRequested = false;
  }
  private resetClientTools(): void {
    this.ownerReferencesRequested = false; this.ownerReferenceGeneration++; this.ownerReferenceBusy = false; this.ownerReferenceNotice = '';
    this.ownerReferences?.setAccess(false); this.strokeHistory = null; this.historyBusy = false;
    this.artRemoval = null; this.artRemovalTarget = null; this.selectedArtworkId = null;
    this.piecePulseStop?.(); this.piecePulseStop = null;
  }
  async keepReference(draft: OwnerReferenceDraft): Promise<boolean> {
    if (!this.canKeepReference() || this.ownerReferenceBusy) return false;
    const generation = this.ownerReferenceGeneration;
    this.ownerReferenceBusy = true; this.ownerReferenceNotice = 'Uploading reference…'; this.emitView();
    const sent = await this.ownerReferences.save(draft);
    if (generation !== this.ownerReferenceGeneration) return false;
    if (!sent) { this.ownerReferenceBusy = false; this.ownerReferenceNotice = 'Could not keep the reference. Please try again.'; }
    else if (this.ownerReferenceBusy) this.ownerReferenceNotice = 'Saving reference…';
    this.emitView(); return sent;
  }
  deleteReference(referenceId: string): boolean {
    if (!this.canKeepReference() || this.ownerReferenceBusy) return false;
    const sent = this.ownerReferences.remove(referenceId);
    if (sent) { this.ownerReferenceBusy = true; this.ownerReferenceNotice = 'Removing reference…'; this.emitView(); }
    return sent;
  }
  undoStroke(): boolean { return this.requestStrokeHistory('stroke_undo'); }
  redoStroke(): boolean { return this.requestStrokeHistory('stroke_redo'); }
  private requestStrokeHistory(type: 'stroke_undo' | 'stroke_redo'): boolean {
    const piece = this.selectedPieceId ? this.pieces.pieces.get(this.selectedPieceId) : undefined;
    if (!this.connection.connected || !this.connection.capabilities.includes('stroke_undo_redo') || !piece || piece.owner !== this.connection.playerId || piece.flattened || !this.world.paintWorkspace?.selection || this.paint.drawing || this.historyBusy || this.strokeHistory?.pieceId !== piece.pieceId || !(type === 'stroke_undo' ? this.strokeHistory.canUndo : this.strokeHistory.canRedo)) return false;
    const sent = this.connection.send({ type, pieceId: piece.pieceId });
    if (sent) { this.historyBusy = true; this.emitView(); }
    return sent;
  }
  private queueSurfaces(surfaceIds: readonly string[]): void {
    for (const id of surfaceIds) { const surface = decodeSurface(id); if (surface) this.recompose.add(surface.wallId); }
  }
  private observeOrder(message: Message): void {
    if (Number.isSafeInteger(message.sequence)) this.order.sequence = Math.max(this.order.sequence, message.sequence as number);
    if (Number.isSafeInteger(message.revision)) this.order.revision = Math.max(this.order.revision, message.revision as number);
  }
  selectCreator(identity: { playerId?: string; username: string; nickName: string }): void {
    const username = identity.username.replace(/^@/, '').trim().slice(0,40);
    const online = this.directory.roster().find(value => username && value.username.toLowerCase() === username.toLowerCase());
    const own = username && username.toLowerCase() === this.ownIdentity.username.toLowerCase();
    this.selectedPlayer = online ? { ...online, online: true } : own && this.connection.playerId ? { playerId: this.connection.playerId, ...this.ownIdentity, role: this.serverPermissions?.role, online: this.connection.connected } : { playerId: identity.playerId ?? '', username, nickName: identity.nickName.slice(0,40) || (username ? '@' + username : 'PLAYER'), online: false };
    this.playerPickSequence++; this.emitView();
  }
  private pulsePiece(pieceId: string): void {
    const piece = this.pieces.pieces.get(pieceId); if (!piece) return;
    const bounds = piece.protectionBounds ?? piece.bounds;
    this.piecePulseStop?.();
    this.piecePulseStop = pulsePieceBounds(this.world.scene, bounds, 3400, () => {
      const flat = this.artworks.meshFor('piece:' + pieceId); if (flat) return [flat];
      return [...this.walls.values()].filter(wall => {
        const box = new THREE.Box3().setFromObject(wall.mesh);
        return box.intersectsBox(new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max)));
      }).flatMap(wall => wall.layers.map(layer => layer.mesh));
    }, this.world.renderer);
  }
  private artworkWorldMatrix(artwork: import('./artworkSync').SharedArtwork): THREE.Matrix4 | null {
    const surface = decodeSurface(artwork.surfaceId), wall = surface && this.walls.get(surface.wallId);
    if (!wall) return null;
    const parent = wall.layers[0]?.mesh ?? wall.mesh; parent.updateWorldMatrix(true, false);
    return parent.matrixWorld.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...artwork.position), new THREE.Quaternion(...artwork.quaternion), new THREE.Vector3(1,1,1)));
  }
  private pulseArtwork(artworkId: string): void {
    const artwork = this.artworks.entries().find(value => value.id === artworkId); if (!artwork) return;
    const matrix = this.artworkWorldMatrix(artwork); if (!matrix) return;
    const corners = [[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y]) => new THREE.Vector3(x * artwork.width / 2, y * artwork.height / 2, 0).applyMatrix4(matrix));
    const box = new THREE.Box3().setFromPoints(corners).expandByScalar(.025);
    this.piecePulseStop?.(); this.piecePulseStop = pulsePieceBounds(this.world.scene, { min: box.min.toArray(), max: box.max.toArray() }, 3400, () => { const mesh = this.artworks.meshFor(artworkId); return mesh ? [mesh] : []; }, this.world.renderer);
  }
  inspectArtwork(artworkId: string): boolean {
    const artwork = this.artworks.entries().find(value => value.id === artworkId); if (!artwork) return false;
    this.pulseArtwork(artworkId);
    const matrix = this.artworkWorldMatrix(artwork); if (!matrix) return false;
    const delta = new THREE.Vector3().setFromMatrixPosition(matrix).sub(this.world.playerPosition);
    this.world.playerYaw = Math.atan2(-delta.x, -delta.z); this.world.playerPitch = THREE.MathUtils.clamp(Math.atan2(delta.y, Math.hypot(delta.x,delta.z)), -1.24,1.18); this.world.cameraMode = 'first'; return true;
  }
  deleteArtwork(artworkId: string): boolean {
    return this.connection.connected && this.connection.capabilities.includes('artwork_remove') && canDeletePieces(this.serverPermissions) && !!artworkId && this.connection.send({ type: 'admin_delete_artwork', artworkId });
  }
  selectPlayer(playerId: string): void {
    const online = this.directory.get(playerId) ?? (playerId === this.connection.playerId ? { playerId, ...this.ownIdentity, role: this.serverPermissions?.role } : null);
    const profile = online ?? this.profiles.get(playerId);
    this.selectedPlayer = profile ? { ...profile, online: !!online && this.connection.connected } : null;
    this.playerPickSequence++; this.emitView();
  }
  setRole(targetUsername: string, role: ServerRole): boolean {
    const ownRole = this.serverPermissions?.role;
    if (!this.connection.connected || this.connection.protocol !== 2 || !targetUsername || !canManageRole(ownRole, this.directory.roleForUsername(targetUsername), role)) return false;
    return this.sendWorld({ type: 'admin_set_role', targetUsername, role });
  }
  join(displayName: string, roomId = DEFAULT_ROOM_ID, identity?: PlayerIdentity, expectedWorldId?: string): void {
    this.resetClientTools();
    this.profiles = new PlayerDirectory();
    this.ownIdentity = { username: identity?.username?.replace(/^@/, '') ?? '', nickName: identity?.nickName || displayName };
    this.protection.reset();
    this.serverPermissions = null;
    this.world.adminFreePaint = false;
    this.selectedPlayer = null; this.roleChange = undefined; this.adminResult = undefined; this.chatMute = null;
    this.selectedPieceForView = null;
    this.completePiece(); this.pieces.clear(); clearPaintWorkspace(this.world);
    this.paint.interrupted(); this.artworks.interrupted(); this.players.clear(); this.ownSpeech.dispose(); this.playerSync.reset(); this.serverPlayerCount = null;
    this.flattenPrepareGeneration++; this.pendingFlatten = null;
    this.directory.clear(); this.spatialEnabled = false;
    this.connection.connect(displayName, roomId, identity, this.world.playerPosition.toArray(), expectedWorldId);
  }
  leave(): void {
    this.resetClientTools();
    this.directory.clear(); this.spatialEnabled = false;
    this.piecePulseStop?.(); this.piecePulseStop = null;
    this.protection.reset();
    this.serverPermissions = null;
    this.world.adminFreePaint = false;
    this.selectedPlayer = null; this.roleChange = undefined; this.adminResult = undefined; this.chatMute = null;
    this.selectedPieceForView = null;
    this.completePiece(); clearPaintWorkspace(this.world); this.players.clear(); this.ownSpeech.dispose(); this.replay.cancel(); this.artworks.clear(); this.pieces.clear();
    this.flattenPrepareGeneration++; this.pendingFlatten = null;
    this.connection.disconnect();
    this.multiplayer = false; this.world.multiplayerActive = false; this.walls.clear(); this.recompose.clear();
    this.chat.clear(); this.accounts.snapshotWorldItems([]); this.order.snapshot({}); this.emitView();
    this.snapshotPlayerId = null; this.sharedRevision = this.requestedRevision = 0;
    this.world.setPaintSession('solo'); this.world.paintRevision++;
  }
  dispose(): void {
    this.resetClientTools(); this.ownerReferences.dispose();
    this.directory.clear(); this.spatialEnabled = false;
    this.piecePulseStop?.(); this.piecePulseStop = null;
    this.protection.reset();
    this.serverPermissions = null;
    this.world.adminFreePaint = false;
    this.selectedPlayer = null; this.roleChange = undefined; this.adminResult = undefined; this.chatMute = null;
    this.selectedPieceForView = null;
    this.completePiece(); clearPaintWorkspace(this.world); this.players.clear(); this.ownSpeech.dispose(); this.replay.cancel(); this.artworks.clear(); this.pieces.clear();
    this.flattenPrepareGeneration++; this.pendingFlatten = null;
    this.connection.disconnect();
    this.world.multiplayerActive = false;
    this.world.onPaintSample = this.world.onPaintEnd = this.world.onMultiplayerFrame = this.world.onArtworkPlaced = this.world.onPlayerPick = this.world.onPiecePick = undefined;
  }
  sendChat(text: string): boolean { return this.chat.send(text); }
  workspaceChanged(): void {
    const selection = this.world.paintWorkspace?.selection;
    if (!selection) { this.protection.setCurrentBounds(null, null); return; }
    if (this.selectedPieceId && this.selectedPiece?.wall === selection.wall && this.selectedPiece.face === selection.face) {
      this.selectedPiece = selection;
      this.protection.setCurrentBounds(this.selectedPieceId, workspaceWorldBounds(selection), this.canvasProtectionEnabled);
    }
  }
  quoteProtection(protectionEnabled = false): boolean {
    if (this.protection.pendingPurchasePieceId || this.world.paintWorkspace?.selection?.purchaseApproved) return false;
    this.canvasProtectionEnabled = protectionEnabled;
    const selection = this.world.paintWorkspace?.selection;
    if (!this.connection.connected || this.connection.protocol !== 2 || !selection || selection.hasPaint) return false;
    const bounds = workspaceWorldBounds(selection);
    if (!this.selectedPieceId || !this.selectedPiece || this.selectedPiece.wall !== selection.wall || this.selectedPiece.face !== selection.face || this.selectedPiece.hasPaint) {
      this.completePiece();
      this.selectedPieceId = this.pieces.create(selection.center.toArray(), bounds);
    }
    this.selectedPiece = selection;
    if (!this.selectedPieceId) return false;
    this.protection.setCurrentBounds(this.selectedPieceId, bounds, protectionEnabled);
    return this.protection.requestBothQuotes(this.selectedPieceId, bounds);
  }
  purchaseProtection(protectionEnabled = false): boolean {
    this.canvasProtectionEnabled = protectionEnabled;
    if (!this.connection.connected || !this.selectedPieceId || !this.protection.currentBounds) return false;
    if (this.world.paintWorkspace?.selection) this.world.paintWorkspace.selection.moving = false;
    return this.protection.purchase(this.selectedPieceId, this.protection.currentBounds, protectionEnabled);
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
  private async uploadFlattenedPiece(
    pieceId: string,
    capture: FlattenedPieceCapture,
  ): Promise<void> {
    let assetRef: string;

    try {
      assetRef = await this.pieceFlattenUpload.assetRef(capture.dataUrl);
    } catch {
      this.emit({
        ...this.status,
        notice: 'Finished graffiti optimization failed. Original strokes were kept.',
      });
      return;
    }

    if (
      !this.connection.connected ||
      this.connection.protocol !== 2 ||
      !this.connection.capabilities.includes('piece_flatten')
    ) return;

    this.connection.send({
      type: 'piece_flatten',
      pieceId,
      assetRef,
      surfaceId: capture.surfaceId,
      face: String(capture.face),
      position: capture.position,
      quaternion: capture.quaternion,
      width: capture.width,
      height: capture.height,
    });
  }

  private async uploadPreparedFlatten(
    pieceId: string,
    capture: FlattenedPieceCapture,
    generation: number,
  ): Promise<void> {
    let assetRef: string;

    try {
      assetRef = await this.pieceFlattenUpload.assetRef(capture.dataUrl);
    } catch {
      if (
        this.pendingFlatten?.pieceId === pieceId &&
        this.pendingFlatten.generation === generation
      ) {
        this.emit({
          ...this.status,
          notice: 'Finished graffiti optimization failed. Original strokes were kept.',
        });
      }
      return;
    }

    const pending = this.pendingFlatten;

    if (
      !pending ||
      pending.pieceId !== pieceId ||
      pending.generation !== generation
    ) return;

    if (
      !this.connection.connected ||
      this.connection.protocol !== 2 ||
      !this.connection.capabilities.includes('piece_flatten_deferred')
    ) return;

    const sent = this.connection.send({
      type: 'piece_flatten_prepare',
      pieceId,
      assetRef,
      surfaceId: capture.surfaceId,
      face: String(capture.face),
      position: capture.position,
      quaternion: capture.quaternion,
      width: capture.width,
      height: capture.height,
    });

    if (!sent) return;

    pending.prepared = true;

    if (pending.commitRequested) {
      this.connection.send({
        type: 'piece_flatten_commit',
        pieceId,
      });
    }
  }

  private message(message: Message): void {
    if (message.type.startsWith('court_')) { this.emitCourt(message); return; }
    const spatialStatus = readSpatialStatus(message);
    if (spatialStatus) { this.spatialEnabled = spatialStatus.enabled; this.emitView(); return; }
    const spatialDelta = readSpatialDelta(message);
    if (spatialDelta && this.spatialEnabled) {
      // Interest changes may carry the same world sequence as the preceding event.
      // They change membership, not global mutation order; never tombstone them.
      this.observeOrder(message);
      this.queueSurfaces(this.paint.unloadStrokeIds(spatialDelta.removeStrokeIds));
      this.queueSurfaces(this.paint.upsertStrokes(spatialDelta.upsertStrokes));
      const unloaded = spatialDelta.removePieceIds.filter(id => id !== this.selectedPieceId);
      this.pieces.applySpatial(spatialDelta.upsertPieces, unloaded);
      for (const id of unloaded) { this.artworks.unloadArtwork('piece:' + id); this.protection.protections.delete(id); }
      for (const id of spatialDelta.removeArtworkIds) this.artworks.unloadArtwork(id);
      this.artworks.upsert(spatialDelta.upsertArtworks);
      this.artworks.upsert(spatialDelta.upsertPieces.map(flattenedPieceArtworkMessage).filter((v): v is Message => !!v));
      for (const piece of spatialDelta.upsertPieces) if (piece.protectedUntil !== undefined) this.protection.protections.set(piece.pieceId, { pieceId: piece.pieceId, protectedUntil: piece.protectedUntil });
      this.refreshArtworkImages(); this.emitView(); return;
    }
    const history = readStrokeHistory(message);
    if (history) { if (history.pieceId === this.selectedPieceId) { this.strokeHistory = history; this.historyBusy = false; this.emitView(); } return; }
    if (message.type.startsWith('owner_reference_')) {
      if (this.canKeepReference()) {
        this.ownerReferences.accept(message);
        if (message.type === 'owner_reference_saved' || message.type === 'owner_reference_deleted') { this.ownerReferenceBusy = false; this.ownerReferenceNotice = message.type === 'owner_reference_saved' ? 'Reference kept.' : 'Reference removed.'; this.emitView(); }
      }
      return;
    }
    const removal = readAdminArtRemovalProgress(message, this.artRemovalTarget ? { targetUsername: this.artRemovalTarget, jobId: this.artRemoval?.jobId } : undefined);
    if (removal && this.canRemoveAllArt()) { this.artRemoval = removal; if (removal.type === 'admin_remove_user_art_complete') this.artRemovalTarget = null; this.emitView(); return; }
    if (message.type === 'error') {
      if (['stroke_undo_unavailable','stroke_redo_unavailable','stroke_undo_limit','undo_unavailable','redo_unavailable','undo_limit','nothing_to_undo','nothing_to_redo'].includes(String(message.code))) { this.historyBusy = false; this.emitView(); }
      if (this.ownerReferenceBusy) { this.ownerReferenceBusy = false; this.ownerReferenceNotice = 'Could not keep the reference. Please try again.'; this.emitView(); }
      if (this.artRemovalTarget) { this.artRemovalTarget = null; this.emitView(); }
    }
    const chatMute = readChatMute(message);
    if (chatMute) { this.chatMute = chatMute; this.emitView(); return; }
    if (['admin_give_credits_complete', 'admin_ban_complete', 'admin_unban_complete'].includes(message.type) && typeof message.targetUsername === 'string') {
      this.adminResult = { type: message.type, targetUsername: message.targetUsername,
        amount: Number.isSafeInteger(message.amount) ? message.amount as number : undefined,
        balance: Number.isSafeInteger(message.balance) && (message.balance as number) >= 0 ? message.balance as number : undefined,
        permanent: typeof message.permanent === 'boolean' ? message.permanent : undefined,
        bannedUntil: typeof message.bannedUntil === 'number' && Number.isFinite(message.bannedUntil) ? message.bannedUntil : undefined,
        serverTime: typeof message.serverTime === 'number' && Number.isFinite(message.serverTime) ? message.serverTime : undefined };
      this.emitView(); return;
    }
    const confirmedBounds = ['protection_purchased', 'canvas_purchase_complete'].includes(message.type) && typeof message.pieceId === 'string'
      ? this.protection.purchaseBoundsFor(message.pieceId) : null;
    if (this.protection.accept(message)) {
      if (confirmedBounds && message.pieceId === this.selectedPieceId && this.selectedPiece && this.world.paintWorkspace?.selection === this.selectedPiece &&
          JSON.stringify(confirmedBounds) === JSON.stringify(workspaceWorldBounds(this.selectedPiece)) &&
          this.protection.isPurchased(this.selectedPieceId!, confirmedBounds, message.protectionEnabled as boolean)) {
        this.canvasProtectionEnabled = message.protectionEnabled as boolean;
        this.selectedPiece.purchaseApproved = true; this.selectedPiece.started = true; this.selectedPiece.moving = false;
        this.world.onPaintWorkspaceChange?.(this.world.paintWorkspace);
        this.emitView();
      }
      if ((message.type === 'protection_purchased' && message.protectionEnabled !== false) || message.type === 'piece_protection_updated') this.pieces.accept(confirmedBounds ? { ...message, protectionBounds: confirmedBounds } : message);
      return;
    }
    if (message.type === 'permissions') {
      this.serverPermissions = readPermissions(message);
      this.syncOwnerAccess();
      this.world.adminFreePaint = this.connection.connected && this.connection.protocol === 2 && canAdminPaint(this.serverPermissions);
      this.emit({ ...this.status, role: this.serverPermissions?.role ?? 'player' });
      return;
    }
    if (message.type === 'player_role_changed' && typeof message.playerId === 'string' && typeof message.username === 'string' && isServerRole(message.role)) {
      this.players.roleChanged(message.playerId, message.username, message.role);
      this.directory.roleChanged(message.playerId, message.username, message.role);
      if (this.selectedPlayer?.playerId === message.playerId) this.selectedPlayer = { ...this.selectedPlayer, role: message.role };
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
      this.players.clear(); this.ownSpeech.dispose();
      if (Array.isArray(message.playerDirectory)) this.spatialEnabled = true;
      this.directory.snapshot(Array.isArray(message.playerDirectory) ? message.playerDirectory : Array.isArray(message.players) ? message.players : [], this.connection.playerId);
      for (const player of Array.isArray(message.players) ? message.players : []) {
        this.players.joined(player, this.connection.playerId);
      }
      this.serverPlayerCount = Number.isInteger(message.playerCount) ? message.playerCount as number : null;
      this.paint.snapshot(message.strokes as unknown[], sameConnection);
      this.chat.snapshot(Array.isArray(message.chatHistory) ? message.chatHistory : []);
      this.pieces.snapshot(Array.isArray(message.graffitiPieces) ? message.graffitiPieces : []);

      const flattenedPieceArtworks = [...this.pieces.pieces.values()]
        .map(flattenedPieceArtworkMessage)
        .filter((value): value is Message => !!value);
      this.protection.protections.clear();
      for (const piece of this.pieces.pieces.values()) {
        if (piece.protectedUntil !== undefined) this.protection.protections.set(piece.pieceId, { pieceId: piece.pieceId, protectedUntil: piece.protectedUntil });
      }
      if (this.selectedPieceForView && !this.pieces.pieces.has(this.selectedPieceForView)) this.selectedPieceForView = null;
      this.artworks.snapshot([
        ...(Array.isArray(message.artworks) ? message.artworks : []),
        ...flattenedPieceArtworks,
      ]);
      this.syncOwnerAccess();
      this.ownerReferences.snapshot(Array.isArray(message.ownerReferences) ? message.ownerReferences : []);
      this.accounts.snapshotWorldItems(Array.isArray(message.worldItems) ? message.worldItems : []);
      this.refreshArtworkImages(); this.playerSync.reset(); this.emitView();
      return;
    }
    const ordered = message.type !== 'stroke_history_state' && (message.type.startsWith('piece_') || message.type.startsWith('stroke_') || message.type.startsWith('artwork_') || message.type.startsWith('item_') || message.type === 'chat_message');
    if (ordered && !this.order.accept(message)) return;
    if (message.type === 'player_directory_joined') {
      this.directory.joined(message.player, this.connection.playerId); this.serverPlayerCount = null; this.emit(this.status); this.emitView();
    } else if (message.type === 'player_directory_left' && typeof message.playerId === 'string') {
      this.directory.left(message.playerId); this.players.left(message.playerId); this.serverPlayerCount = null;
      if (this.selectedPlayer?.playerId === message.playerId) this.selectedPlayer = { ...this.selectedPlayer, online: false };
      this.emit(this.status); this.emitView();
    } else if (message.type === 'player_joined') {
      this.players.joined(message.player, this.connection.playerId);
      if (!this.spatialEnabled) { this.directory.joined(message.player, this.connection.playerId); this.serverPlayerCount = null; }
      this.emit(this.status); this.emitView();
    } else if (message.type === 'player_left' && typeof message.playerId === 'string') {
      this.players.left(message.playerId);
      const spatial = message.spatial === true || message.reason === 'spatial_out_of_range';
      if (!spatial) { this.directory.left(message.playerId); this.serverPlayerCount = null; }
      this.emit(this.status);
      if (!spatial && this.selectedPlayer?.playerId === message.playerId) this.selectedPlayer = { ...this.selectedPlayer, online: false };
      this.emitView();
    } else if (message.type === 'player_count') {
      const count = message.playerCount ?? message.count;
      if (Number.isInteger(count) && (count as number) >= 0) this.serverPlayerCount = count as number;
      this.emit(this.status);
    } else if (message.type === 'player_state' && typeof message.playerId === 'string' && message.playerId !== this.connection.playerId) {
      this.players.state(message.playerId, message.state);
    } else if (message.type === 'player_action' && message.playerId !== this.connection.playerId) this.players.action(message);
    else if (message.type === 'chat_message') this.chat.accept(message);
    else if (message.type === 'artwork_removed' && typeof message.artworkId === 'string') {
      this.artworks.removeArtwork(message.artworkId); if (this.selectedArtworkId === message.artworkId) { this.selectedArtworkId = null; this.piecePulseStop?.(); this.piecePulseStop = null; }
    }
    else if (message.type === 'artwork_place' || message.type === 'artwork_placed') { this.artworks.accept(message); this.refreshArtworkImages(); }
    else if (message.type.startsWith('piece_')) {
      if (message.type === 'piece_removed' && typeof message.pieceId === 'string') {
        for (const surfaceId of this.paint.rejectPiece(message.pieceId)) { const surface = decodeSurface(surfaceId); if (surface) this.removalWalls.add(surface.wallId); }
        this.artworks.removeArtwork(`piece:${message.pieceId}`);
      }
      if (message.type === 'piece_removed' && message.pieceId === this.selectedPieceId) {
        this.selectedPieceId = null; this.selectedPiece = null; this.world.paintRevision++;
      }
      if (message.type === 'piece_removed' && message.pieceId === this.selectedPieceForView) { this.selectedPieceForView = null; this.piecePulseStop?.(); this.piecePulseStop = null; }
      if (message.type === 'piece_removed' && typeof message.pieceId === 'string') this.protection.protections.delete(message.pieceId);
      this.pieces.accept(message);
      if (message.type === 'piece_flattened' && typeof message.pieceId === 'string') {
        if (this.pendingFlatten?.pieceId === message.pieceId) {
          this.pendingFlatten = null;
          this.flattenPrepareGeneration++;
        }
        const piece = this.pieces.pieces.get(message.pieceId);
        const artwork = piece ? flattenedPieceArtworkMessage(piece) : null;

        if (artwork) {
          this.artworks.accept(artwork);
          this.refreshArtworkImages();
        }
      }
      const current = this.selectedPieceId ? this.pieces.pieces.get(this.selectedPieceId) : undefined;
      if (current?.protectedUntil !== undefined) this.protection.protections.set(current.pieceId, { pieceId: current.pieceId, protectedUntil: current.protectedUntil });
    }
    else if (message.type.startsWith('item_')) this.accounts.worldItemEvent(message);
    else if (message.type.startsWith('stroke_')) {
      const undone = readGestureUndone(message), redone = readGestureRedone(message);
      if (undone) {
        this.queueSurfaces(undone.strokeIds.map(id => this.paint.strokes.get(id)?.surfaceId).filter((id): id is string => !!id));
        this.paint.removeStrokeIds(undone.strokeIds);
      } else if (redone) this.queueSurfaces(this.paint.restoreStrokes(redone.strokes));
      else this.paint.accept(message);
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
  private shouldReplayWall(wall: PaintWall): boolean {
    return withinLiveStrokeDistance(wall, this.world.playerPosition, getRenderSettings().liveStrokeDistance, this.world.paintWorkspace?.selection?.wall);
  }
  private refreshArtworkImages():void {
    const settings=getRenderSettings();
    this.artworks.refresh(this.walls,{maxConcurrent:settings.imageConcurrency,canLoad:wall=>withinLiveStrokeDistance(wall,this.world.playerPosition,settings.imageLoadDistance,this.world.paintWorkspace?.selection?.wall)});
    this.world.scene.userData.cityImageStats=this.artworks.imageStats();
  }
  private refreshWalls(): void {
    if (!this.multiplayer) return;
    const next = new Map(this.world.walls.filter(w => w.surfaceId).map(w => [w.surfaceId!, w]));
    this.replay.removeMissing(next);
    for (const [id, wall] of next) {
      if (this.walls.get(id) === wall) continue;
      this.walls.set(id, wall);
      if (this.shouldReplayWall(wall)) this.replay.rebuildFrom(wall, this.paint.forWall(id));
      else this.recompose.add(id);
    }
    this.walls = next;
    this.refreshArtworkImages();
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
      (quote !== null && (!quote.canPurchase || !!quote.overlapPieceId || (this.protection.creditBalance !== null && quote.cost > this.protection.creditBalance))) ||
      this.previewOverlap || this.protection.errorCode === 'protected_area_overlap' || this.protection.errorCode === 'insufficient_credits'
    ));
    this.refreshWalls();
    this.paint.flush(performance.now()); this.replay.update(); this.players.update(delta);
    for (const id of this.recompose) {
      const wall = this.walls.get(id);
      if (!wall) { this.recompose.delete(id); continue; }
      if (!this.shouldReplayWall(wall) || this.replay.isRebuilding(wall)) continue;
      this.recompose.delete(id); this.replay.rebuildFrom(wall, this.paint.forWall(id));
    }
    // The server does not echo accepted own stroke sequences. Fetch canonical metadata once
    // the brush is idle; never interrupt input or repeatedly restart a long wall reconstruction.
    if (!this.spatialEnabled && this.connection.connected && this.sharedRevision > this.requestedRevision && !this.paint.drawing && !this.replay.rebuilding && performance.now() - this.lastSharedAt > 1500) {
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
    const onlinePlayers = this.directory.roster();
    if (this.connection.connected && this.connection.playerId) onlinePlayers.unshift({ playerId: this.connection.playerId, ...this.ownIdentity, role: this.serverPermissions?.role });
    this.profiles.sync(onlinePlayers, this.chat.messages);
    const view: MultiplayerView = { spatialEnabled: this.spatialEnabled,
      strokeHistory: this.strokeHistory?.pieceId === this.selectedPieceId ? { ...this.strokeHistory, canUndo: !this.historyBusy && !this.paint.drawing && this.strokeHistory.canUndo, canRedo: !this.historyBusy && !this.paint.drawing && this.strokeHistory.canRedo } : null,
      ownerReferences: this.ownerReferences?.records ?? [], canKeepReference: this.canKeepReference(), ownerReferenceBusy: this.ownerReferenceBusy, ownerReferenceNotice: this.ownerReferenceNotice,
      artRemoval: this.artRemoval, artworks: this.artworks.entries().filter(value => !value.id.startsWith('piece:')), selectedArtworkId: this.selectedArtworkId,
      chatMute: this.chatMute, onlinePlayers, ownPlayerId: this.connection.connected ? this.connection.playerId : null, adminResult: this.adminResult, protection: protection ? { creditBalance: protection.creditBalance, quote: protection.quote, quotes: protection.quotes, protectionEnabled: this.canvasProtectionEnabled, purchased: !!this.world.paintWorkspace?.selection?.purchaseApproved, pendingQuote: !!protection.pendingQuotePieceId, pendingPurchase: !!protection.pendingPurchasePieceId, protectedUntil, notice: protection.notice } : undefined, chat: this.chat.messages, revision: this.order.revision, selectedPlayer: this.selectedPlayer, playerPickSequence: this.playerPickSequence, selectedPieceId: this.selectedPieceForView, piecePickSequence: this.piecePickSequence, roleChange: this.roleChange,
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
      canRemoveAllArt: this.canRemoveAllArt(),
      canDeletePieces: this.connection.connected && canDeletePieces(this.serverPermissions),
      canAdminPaint: this.connection.connected && this.connection.protocol === 2 && canAdminPaint(this.serverPermissions),
    };
    const next = { ...status, playerCount: status.phase === 'connected' ? this.serverPlayerCount ?? this.directory.count + 1 : 0 };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next; this.report(next);
  }
}

function isServerRole(value: unknown): value is ServerRole { return value === 'player' || value === 'moderator' || value === 'admin' || value === 'owner'; }
