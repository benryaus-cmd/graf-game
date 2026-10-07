import { StrokeIndex } from './strokeIndex';
import { readPoint, readStroke, type Message, type SharedStroke, type StrokePoint } from './protocol';

export interface PaintSample {
  surfaceId: string; colour: string; tool: string; brushSize: number; point: StrokePoint;
  operation?: 'paint' | 'erase'; opacity?: number; layerIndex?: number; face?: string; pieceId?: string;
}
interface PaintAdapter {
  send: (message: Message) => boolean;
  draw: (stroke: SharedStroke, points: StrokePoint[], previous: StrokePoint | null) => void;
  reset: () => void;
}
interface PendingStroke { stroke: SharedStroke; sent: number; shared: boolean }
const MAX_REJECTION_TOMBSTONES = 10_000;

function rememberRejected(set: Set<string>, id: string): void {
  set.delete(id);
  set.add(id);
  if (set.size > MAX_REJECTION_TOMBSTONES) set.delete(set.values().next().value!);
}

export class PaintSync {
  strokes = new Map<string, SharedStroke>();
  private index = new StrokeIndex();
  private local = new Map<string, SharedStroke>();
  /** Local IDs known to have been accepted by the server (or present in a full snapshot). */
  private confirmedLocal = new Set<string>();
  private rejectedStrokeIds = new Set<string>();
  private rejectedPieceIds = new Set<string>();
  private active: PendingStroke | null = null;
  private gesture: string | null = null;
  private segment = 0;
  private lastFlush = 0;
  constructor(private adapter: PaintAdapter) {}
  get drawing(): boolean { return this.active !== null; }

  sample(sample: PaintSample, continues: boolean): { stroke: SharedStroke; previous: StrokePoint | null } {
    const prior = this.active?.stroke;
    const same = prior && prior.surfaceId === sample.surfaceId && prior.colour === sample.colour &&
      prior.tool === sample.tool && prior.brushSize === sample.brushSize && prior.opacity === sample.opacity && prior.pieceId === sample.pieceId;
    if (!continues) this.end();
    else if (prior && !same) { this.finishActive(); this.segment++; }
    if (this.active && this.active.stroke.points.length >= 16_000) {
      this.finishActive(); this.segment++;
    }
    if (!this.active) {
      if (!this.gesture) { this.gesture = crypto.randomUUID(); this.segment = 0; }
      const stroke: SharedStroke = {
        strokeId: this.gesture + '.' + this.segment, surfaceId: sample.surfaceId,
        colour: sample.colour, tool: sample.tool, brushSize: sample.brushSize, points: [],
        pieceId: typeof sample.pieceId === 'string' && sample.pieceId.length <= 100 ? sample.pieceId : undefined,
        operation: sample.operation ?? (sample.tool === 'eraser' ? 'erase' : 'paint'), opacity: sample.opacity,
        layerIndex: sample.layerIndex, face: sample.face,
      };
      this.strokes.set(stroke.strokeId, stroke); this.index.set(stroke); this.local.set(stroke.strokeId, stroke);
      const shared = this.adapter.send({
        type: 'stroke_begin', strokeId: stroke.strokeId, surfaceId: stroke.surfaceId,
        colour: stroke.colour, tool: stroke.tool, brushSize: stroke.brushSize,
        ...(stroke.pieceId ? { pieceId: stroke.pieceId } : {}),
        operation: stroke.operation, opacity: stroke.opacity ?? 1, layerIndex: stroke.layerIndex ?? 0, face: stroke.face ?? '',
      });
      this.active = { stroke, sent: 0, shared };
    }
    const stroke = this.active.stroke;
    const previous = stroke.points[stroke.points.length - 1] ?? this.continuationPoint(stroke.strokeId);
    stroke.points.push({ ...sample.point });
    // Local rendering has already happened; this hook never waits for or redraws an echo.
    return { stroke, previous };
  }
  flush(now: number): void {
    if (now - this.lastFlush < 100) return;
    this.lastFlush = now;
    this.flushActive(false);
  }
  end(): void { this.finishActive(); this.gesture = null; this.segment = 0; }
  interrupted(): void {
    // Don't upload offline drafts automatically under a new connection identity.
    if (this.active) this.active.shared = false;
  }
  private finishActive(): void {
    const active = this.active;
    if (!active) return;
    this.flushActive(true);
    if (active.shared) this.adapter.send({ type: 'stroke_end', strokeId: active.stroke.strokeId });
    if (this.active === active) this.active = null;
  }
  private flushActive(all: boolean): void {
    const active = this.active;
    if (!active || !active.shared) return;
    let batches = 0;
    while (active.sent < active.stroke.points.length && (all || batches < 2)) {
      const points = active.stroke.points.slice(active.sent, active.sent + 96);
      if (!this.adapter.send({ type: 'stroke_points', strokeId: active.stroke.strokeId, points })) {
        active.shared = false; return;
      }
      active.sent += points.length; batches++;
    }
  }
  private continuationPoint(id: string): StrokePoint | null {
    const split = id.lastIndexOf('.');
    const segment = Number(id.slice(split + 1));
    if (split < 0 || !Number.isInteger(segment) || segment <= 0) return null;
    const previous = this.strokes.get(id.slice(0, split + 1) + (segment - 1))?.points;
    return previous?.[previous.length - 1] ?? null;
  }
  accept(message: Message): void {
    if (message.type === 'stroke_begin') {
      const incoming = readStroke(message.stroke);
      if (!incoming) return;
      if (this.rejectedStrokeIds.has(incoming.strokeId) || (incoming.pieceId && this.rejectedPieceIds.has(incoming.pieceId))) return;
      const existing = this.strokes.get(incoming.strokeId);
      if (existing) {
        const sequence = Number.isSafeInteger(incoming.sequence) ? incoming.sequence :
          Number.isSafeInteger(message.sequence) ? message.sequence as number : undefined;
        existing.sequence = sequence ?? existing.sequence;
        existing.revision = incoming.revision;
        existing.playerId = incoming.playerId;
        existing.pieceId = incoming.pieceId ?? existing.pieceId;
        this.index.changed(existing);
        if (sequence !== undefined) this.confirmLocal(incoming.strokeId);
        return;
      }
      this.strokes.set(incoming.strokeId, incoming); this.index.set(incoming);
      if (incoming.points.length) this.adapter.draw(incoming, incoming.points, this.continuationPoint(incoming.strokeId));
      return;
    }
    if (typeof message.strokeId !== 'string') return;
    if (this.rejectedStrokeIds.has(message.strokeId)) return;
    const stroke = this.strokes.get(message.strokeId);
    if (!stroke) return;
    if (Number.isSafeInteger(message.sequence)) stroke.sequence = message.sequence as number;
    if (Number.isSafeInteger(message.revision)) stroke.revision = message.revision as number;
    if (Number.isSafeInteger(message.sequence)) this.confirmLocal(message.strokeId);
    this.index.changed(stroke);
    if (this.local.has(message.strokeId)) return;
    if (message.type === 'stroke_points' && Array.isArray(message.points)) {
      const points = message.points.slice(0, 128).map(readPoint).filter((p): p is StrokePoint => !!p);
      const valid = points.slice(0, 20_000 - stroke.points.length);
      const previous = stroke.points[stroke.points.length - 1] ?? this.continuationPoint(stroke.strokeId);
      stroke.points.push(...valid);
      this.adapter.draw(stroke, valid, previous);
    }
  }
  snapshot(values: unknown[], preserveActive = false): void {
    const activeAtSnapshot = this.active?.stroke.strokeId ?? null;
    if (!preserveActive) { this.interrupted(); this.end(); }
    this.strokes.clear(); this.index.clear();
    for (const value of values.slice(0, 10_000)) {
      let stroke = readStroke(value);
      if (!stroke) continue;
      if (this.rejectedStrokeIds.has(stroke.strokeId) || (stroke.pieceId && this.rejectedPieceIds.has(stroke.pieceId))) continue;
      const local = this.local.get(stroke.strokeId);
      if (local && this.active?.stroke === local && preserveActive) {
        Object.assign(local, { ...stroke, points: local.points }); stroke = local;
      }
      // A disconnect can leave the server with only the beginning of our immediate local stroke.
      if (local && local.points.length > stroke.points.length) stroke.points = local.points;
      if (local && stroke.points.length >= local.points.length &&
          this.active?.stroke !== local && activeAtSnapshot !== local.strokeId) {
        this.confirmLocal(local.strokeId);
      }
      this.strokes.set(stroke.strokeId, stroke);
    }
    for (const [id, stroke] of this.local) {
      if (this.strokes.has(id)) continue;
      // A complete snapshot is authoritative for an ended stroke once the server has
      // confirmed that ID. Keep offline drafts and strokes interrupted mid-gesture.
      if (this.confirmedLocal.has(id) && this.active?.stroke !== stroke && activeAtSnapshot !== id) {
        this.local.delete(id);
        this.confirmedLocal.delete(id);
        continue;
      }
      this.strokes.set(id, stroke);
    }
    for (const stroke of this.strokes.values()) this.index.set(stroke);
    this.adapter.reset();
    for (const stroke of [...this.strokes.values()].sort(strokeOrder)) {
      if (stroke.points.length) this.adapter.draw(stroke, stroke.points, this.continuationPoint(stroke.strokeId));
    }
  }
  private confirmLocal(id: string): void {
    if (this.local.has(id)) this.confirmedLocal.add(id);
  }
  forWall(wallId: string): SharedStroke[] {
    return this.index.forWall(wallId);
  }
  replay(stroke: SharedStroke): void { this.adapter.draw(stroke, stroke.points, this.continuationPoint(stroke.strokeId)); }

  /** Streaming unload is reversible and must never create rejection tombstones. */
  unloadStrokeIds(ids: readonly string[]): string[] {
    const surfaces = new Set<string>();
    for (const id of new Set(ids)) {
      const stroke = this.strokes.get(id);
      if (!stroke || this.active?.stroke.strokeId === id || (this.local.has(id) && !this.confirmedLocal.has(id))) continue;
      surfaces.add(stroke.surfaceId);
      this.strokes.delete(id); this.index.delete(id); this.local.delete(id); this.confirmedLocal.delete(id);
    }
    return [...surfaces];
  }
  /** Batch membership changes only; caller rebuilds each affected wall once. */
  upsertStrokes(values: readonly unknown[]): string[] {
    const surfaces = new Set<string>();
    for (const value of values) {
      const incoming = readStroke(value);
      if (!incoming || this.rejectedStrokeIds.has(incoming.strokeId) || (incoming.pieceId && this.rejectedPieceIds.has(incoming.pieceId))) continue;
      const old = this.strokes.get(incoming.strokeId), local = this.local.get(incoming.strokeId);
      if (old) surfaces.add(old.surfaceId);
      if (local && (this.active?.stroke === local || local.points.length > incoming.points.length)) {
        Object.assign(local, { ...incoming, points: local.points });
        this.strokes.set(local.strokeId, local); this.index.changed(local);
      } else { this.strokes.set(incoming.strokeId, incoming); this.index.set(incoming); }
      if (incoming.sequence !== undefined) this.confirmLocal(incoming.strokeId);
      surfaces.add(incoming.surfaceId);
    }
    return [...surfaces];
  }
  /** Only an explicit authoritative redo may restore an undone stroke ID. */
  restoreStrokes(values: readonly unknown[]): string[] {
    const strokes = values.map(readStroke).filter((stroke): stroke is SharedStroke => !!stroke);
    for (const stroke of strokes) this.rejectedStrokeIds.delete(stroke.strokeId);
    return this.upsertStrokes(strokes);
  }

  /** Remove strokes named by an authoritative piece-removal broadcast. Returns affected surfaces for one rebuild each. */
  removeStrokeIds(ids: readonly string[]): string[] {
    const surfaces = new Set<string>();
    const removed = new Set(ids.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 120));
    for (const id of removed) {
      rememberRejected(this.rejectedStrokeIds, id);
      const stroke = this.strokes.get(id) ?? this.local.get(id);
      if (stroke) surfaces.add(stroke.surfaceId);
      this.strokes.delete(id); this.index.delete(id);
      this.local.delete(id);
      this.confirmedLocal.delete(id);
      if (this.active?.stroke.strokeId === id) {
        // Do not flush or end a stroke the server has just removed with its piece.
        this.active = null;
        this.gesture = null;
        this.segment = 0;
      }
    }
    return [...surfaces];
  }

  /** Prevent delayed server echoes and stale snapshots from restoring a removed piece's paint. */
  rejectPiece(pieceId: string): string[] {
    if (typeof pieceId !== 'string' || !pieceId || pieceId.length > 100) return [];
    rememberRejected(this.rejectedPieceIds, pieceId);
    const ids = new Set<string>();
    for (const [id, stroke] of this.strokes) if (stroke.pieceId === pieceId) ids.add(id);
    for (const [id, stroke] of this.local) if (stroke.pieceId === pieceId) ids.add(id);
    return this.removeStrokeIds([...ids]);
  }
}

export function strokeOrder(a: SharedStroke, b: SharedStroke): number {
  return (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER);
}
