import type { AvatarEmote, LiveSettings, PaintWall, WorldEngine } from '../game/worldTypes';
import { MultiplayerConnection } from './connection';
import { DEFAULT_ROOM_ID, MULTIPLAYER_URL } from './config';
import { PaintSync } from './paintSync';
import { PaintReplay } from './paintReplay';
import { PlayerSync } from './playerSync';
import { RemotePlayers } from './remotePlayers';
import { decodeSurface, encodeSurface } from './surfaces';
import { ChatSync } from './chat';
import { ArtworkSync } from './artworkSync';
import { WorldOrder } from './worldOrder';
import { AccountFeatures } from './accountFeatures';
import type { Message, MultiplayerStatus, MultiplayerView, PlayerCosmetics } from './protocol';

export class WorldMultiplayerSession {
  private connection: MultiplayerConnection;
  private paint: PaintSync;
  private replay: PaintReplay;
  private players: RemotePlayers;
  private playerSync: PlayerSync;
  private chat: ChatSync;
  private artworks: ArtworkSync;
  private order: WorldOrder;
  readonly accounts: AccountFeatures;
  private multiplayer = false;
  private walls = new Map<string, PaintWall>();
  private visibility = [true];
  private recompose = new Set<string>();
  private status: MultiplayerStatus = { phase: 'solo', playerCount: 0 };
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
      if (status.phase === 'disconnected') { this.paint.interrupted(); this.artworks.interrupted(); this.players.clear(); this.serverPlayerCount = null; }
      this.emit(status);
    }, message => this.message(message));
    this.chat = new ChatSync(message => this.connection.send(message), () => this.emitView());
    this.order = new WorldOrder();
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
    world.onPaintSample = (wall, hit, settings, continues) => {
      if (!this.multiplayer || !wall.surfaceId || !hit.face) return;
      const face = hit.face.materialIndex ?? 0;
      const value = this.paint.sample({
        surfaceId: encodeSurface(wall.surfaceId, face, Math.max(0, settings.layerIndex)),
        colour: settings.color, tool: settings.eraseMode ? 'eraser' : 'spray', brushSize: Math.max(1, settings.brushSize),
        operation: settings.eraseMode ? 'erase' : 'paint', opacity: this.connection.protocol === 1 ? 1 : Math.max(0.05, Math.min(1, settings.opacity)),
        layerIndex: Math.max(0, settings.layerIndex), face: String(face),
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z, pressure: this.connection.protocol === 1 ? Math.max(0.05, Math.min(1, settings.opacity)) : 1 },
      }, continues);
      if (this.replay.isRebuilding(wall)) this.replay.enqueue(wall, value.stroke, [value.stroke.points[value.stroke.points.length - 1]], value.previous);
    };
    world.onArtworkPlaced = (wall, face, artwork) => { if (this.multiplayer) void this.artworks.placed(wall, face, artwork, this.connection.connected); };
    world.onPaintEnd = () => this.paint.end();
    world.onMultiplayerFrame = (delta, settings) => this.update(delta, settings);
  }
  join(displayName: string, roomId = DEFAULT_ROOM_ID): void {
    this.paint.interrupted(); this.artworks.interrupted(); this.players.clear(); this.playerSync.reset(); this.serverPlayerCount = null;
    this.connection.connect(displayName, roomId);
  }
  leave(): void {
    this.paint.end(); this.connection.disconnect(); this.players.clear(); this.replay.cancel(); this.artworks.clear();
    this.multiplayer = false; this.world.multiplayerActive = false; this.walls.clear(); this.recompose.clear();
    this.chat.clear(); this.accounts.snapshotWorldItems([]); this.order.snapshot({}); this.emitView();
    this.snapshotPlayerId = null; this.sharedRevision = this.requestedRevision = 0;
    this.world.setPaintSession('solo'); this.world.paintRevision++;
  }
  dispose(): void {
    this.paint.end(); this.connection.disconnect(); this.players.clear(); this.replay.cancel(); this.artworks.clear();
    this.world.multiplayerActive = false;
    this.world.onPaintSample = this.world.onPaintEnd = this.world.onMultiplayerFrame = this.world.onArtworkPlaced = undefined;
  }
  sendChat(text: string): boolean { return this.chat.send(text); }
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
      this.artworks.snapshot(Array.isArray(message.artworks) ? message.artworks : []);
      this.accounts.snapshotWorldItems(Array.isArray(message.worldItems) ? message.worldItems : []);
      this.artworks.refresh(this.walls); this.playerSync.reset(); this.emitView();
      return;
    }
    const ordered = message.type.startsWith('stroke_') || message.type.startsWith('artwork_') || message.type.startsWith('item_') || message.type === 'chat_message';
    if (ordered && !this.order.accept(message)) return;
    if (message.type === 'player_joined') {
      this.players.joined(message.player, this.connection.playerId); this.serverPlayerCount = null; this.emit(this.status);
    } else if (message.type === 'player_left' && typeof message.playerId === 'string') {
      this.players.left(message.playerId); this.serverPlayerCount = null; this.emit(this.status);
    } else if (message.type === 'player_count') {
      const count = message.playerCount ?? message.count;
      if (Number.isInteger(count) && (count as number) >= 0) this.serverPlayerCount = count as number;
      this.emit(this.status);
    } else if (message.type === 'player_state' && typeof message.playerId === 'string' && message.playerId !== this.connection.playerId) {
      this.players.state(message.playerId, message.state);
    } else if (message.type === 'player_action' && message.playerId !== this.connection.playerId) this.players.action(message);
    else if (message.type === 'chat_message') this.chat.accept(message);
    else if (message.type === 'artwork_place' || message.type === 'artwork_placed') { this.artworks.accept(message); this.artworks.refresh(this.walls); }
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
  }
  private emitView(): void {
    const view: MultiplayerView = { chat: this.chat.messages, revision: this.order.revision,
      accountFeaturesAvailable: this.accounts.available, worldItemCount: this.accounts.worldItems.size };
    const serial = JSON.stringify(view);
    if (serial === this.lastView) return;
    this.lastView = serial; this.reportView(view);
  }
  private sendWorld(message: Message): boolean {
    const sent = this.connection.send(message);
    if (sent && (message.type === 'stroke_end' || message.type === 'artwork_place')) {
      this.sharedRevision++; this.lastSharedAt = performance.now();
    }
    return sent;
  }
  private emit(status: MultiplayerStatus): void {
    const next = { ...status, playerCount: status.phase === 'connected' ? this.serverPlayerCount ?? this.players.count + 1 : 0 };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next; this.report(next);
  }
}
