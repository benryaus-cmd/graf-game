import type { LiveSettings, PaintWall, WorldEngine } from '../game/worldTypes';
import { MultiplayerConnection } from './connection';
import { DEFAULT_ROOM_ID, MULTIPLAYER_URL } from './config';
import { PaintSync } from './paintSync';
import { PaintReplay } from './paintReplay';
import { PlayerSync } from './playerSync';
import { RemotePlayers } from './remotePlayers';
import { decodeSurface, encodeSurface } from './surfaces';
import type { Message, MultiplayerStatus } from './protocol';

export class WorldMultiplayerSession {
  private connection: MultiplayerConnection;
  private paint: PaintSync;
  private replay: PaintReplay;
  private players: RemotePlayers;
  private playerSync: PlayerSync;
  private multiplayer = false;
  private walls = new Map<string, PaintWall>();
  private visibility = [true];
  private status: MultiplayerStatus = { phase: 'solo', playerCount: 0 };
  private lastPosition: number[];
  constructor(private world: WorldEngine, private report: (status: MultiplayerStatus) => void) {
    this.lastPosition = world.playerPosition.toArray();
    this.players = new RemotePlayers(world.scene);
    this.replay = new PaintReplay(() => this.visibility);
    this.connection = new MultiplayerConnection(MULTIPLAYER_URL, status => {
      if (status.phase === 'disconnected') { this.paint.interrupted(); this.players.clear(); }
      this.emit({ ...status, playerCount: status.phase === 'connected' ? this.players.count + 1 : 0 });
    }, message => this.message(message));
    this.paint = new PaintSync({
      send: message => this.connection.send(message),
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
      const value = this.paint.sample({
        surfaceId: encodeSurface(wall.surfaceId, hit.face.materialIndex ?? 0, Math.max(0, settings.layerIndex)),
        colour: settings.color, tool: settings.eraseMode ? 'eraser' : 'spray', brushSize: Math.max(1, settings.brushSize),
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z, pressure: Math.max(0.05, Math.min(1, settings.opacity)) },
      }, continues);
      if (this.replay.isRebuilding(wall)) this.replay.enqueue(wall, value.stroke, [value.stroke.points[value.stroke.points.length - 1]], value.previous);
    };
    world.onPaintEnd = () => this.paint.end();
    world.onMultiplayerFrame = (delta, settings) => this.update(delta, settings);
  }
  join(displayName: string, roomId = DEFAULT_ROOM_ID): void {
    this.paint.interrupted(); this.players.clear(); this.playerSync.reset();
    this.connection.connect(displayName, roomId);
  }
  leave(): void {
    this.paint.end(); this.connection.disconnect(); this.players.clear(); this.replay.cancel();
    this.multiplayer = false; this.walls.clear();
    this.world.setPaintSession('solo'); this.world.paintRevision++;
  }
  dispose(): void {
    this.paint.end(); this.connection.disconnect(); this.players.clear(); this.replay.cancel();
    this.world.onPaintSample = this.world.onPaintEnd = this.world.onMultiplayerFrame = undefined;
  }
  private message(message: Message): void {
    if (message.type === 'world_snapshot') {
      this.paint.interrupted(); this.multiplayer = true; this.world.paintRevision++;
      this.world.setPaintSession('multiplayer'); this.refreshWalls();
      this.players.clear();
      for (const player of message.players as unknown[]) this.players.joined(player, this.connection.playerId);
      this.paint.snapshot(message.strokes as unknown[]);
      this.playerSync.reset();
    } else if (message.type === 'player_joined') {
      this.players.joined(message.player, this.connection.playerId); this.emit(this.status);
    } else if (message.type === 'player_left' && typeof message.playerId === 'string') {
      this.players.left(message.playerId); this.emit(this.status);
    } else if (message.type === 'player_state' && typeof message.playerId === 'string' && message.playerId !== this.connection.playerId) {
      this.players.state(message.playerId, message.state);
    } else if (message.type.startsWith('stroke_')) this.paint.accept(message);
  }
  private refreshWalls(): void {
    if (!this.multiplayer) return;
    const next = new Map(this.world.walls.filter(w => w.surfaceId).map(w => [w.surfaceId!, w]));
    this.replay.removeMissing(next);
    for (const [id, wall] of next) {
      if (this.walls.get(id) === wall) continue;
      this.replay.rebuild(wall);
      // draw's lookup must see the new wall while it is replayed.
      this.walls.set(id, wall);
      for (const stroke of this.paint.forWall(id)) this.paint.replay(stroke);
    }
    this.walls = next;
  }
  private update(delta: number, settings: LiveSettings): void {
    this.visibility = settings.layerVisibility;
    if (!this.multiplayer) return;
    this.refreshWalls();
    this.paint.flush(performance.now()); this.replay.update(); this.players.update(delta);
    const position = this.world.playerPosition.toArray();
    const moving = position.some((n, i) => Math.abs(n - this.lastPosition[i]) > 0.001);
    this.playerSync.update({
      position, rotation: [this.world.playerPitch, this.world.playerYaw, 0],
      movement: moving ? 'walking' : 'idle',
      tool: settings.paintMode ? settings.eraseMode ? 'eraser' : 'spray' : 'off',
      jumping: Math.abs(this.world.velocityY) > 0.1 || this.world.abilityActive,
    }, performance.now());
    this.lastPosition = position;
  }
  private emit(status: MultiplayerStatus): void {
    const next = { ...status, playerCount: status.phase === 'connected' ? this.players.count + 1 : 0 };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next; this.report(next);
  }
}
