import { readPoint, readStroke, type Message, type SharedStroke, type StrokePoint } from './protocol';

export interface PaintSample {
  surfaceId: string; colour: string; tool: string; brushSize: number; point: StrokePoint;
  operation?: 'paint' | 'erase'; opacity?: number; layerIndex?: number; face?: string;
}
interface PaintAdapter {
  send: (message: Message) => boolean;
  draw: (stroke: SharedStroke, points: StrokePoint[], previous: StrokePoint | null) => void;
  reset: () => void;
}
interface PendingStroke { stroke: SharedStroke; sent: number; shared: boolean }

export class PaintSync {
  strokes = new Map<string, SharedStroke>();
  private local = new Map<string, SharedStroke>();
  private active: PendingStroke | null = null;
  private gesture: string | null = null;
  private segment = 0;
  private lastFlush = 0;
  constructor(private adapter: PaintAdapter) {}
  get drawing(): boolean { return this.active !== null; }

  sample(sample: PaintSample, continues: boolean): { stroke: SharedStroke; previous: StrokePoint | null } {
    const prior = this.active?.stroke;
    const same = prior && prior.surfaceId === sample.surfaceId && prior.colour === sample.colour &&
      prior.tool === sample.tool && prior.brushSize === sample.brushSize && prior.opacity === sample.opacity;
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
        operation: sample.operation ?? (sample.tool === 'eraser' ? 'erase' : 'paint'), opacity: sample.opacity,
        layerIndex: sample.layerIndex, face: sample.face,
      };
      this.strokes.set(stroke.strokeId, stroke); this.local.set(stroke.strokeId, stroke);
      const shared = this.adapter.send({
        type: 'stroke_begin', strokeId: stroke.strokeId, surfaceId: stroke.surfaceId,
        colour: stroke.colour, tool: stroke.tool, brushSize: stroke.brushSize,
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
      const existing = this.strokes.get(incoming.strokeId);
      if (existing) {
        existing.sequence = incoming.sequence; existing.revision = incoming.revision;
        existing.playerId = incoming.playerId;
        return;
      }
      this.strokes.set(incoming.strokeId, incoming);
      if (incoming.points.length) this.adapter.draw(incoming, incoming.points, this.continuationPoint(incoming.strokeId));
      return;
    }
    if (typeof message.strokeId !== 'string') return;
    const stroke = this.strokes.get(message.strokeId);
    if (!stroke) return;
    if (Number.isSafeInteger(message.sequence)) stroke.sequence = message.sequence as number;
    if (Number.isSafeInteger(message.revision)) stroke.revision = message.revision as number;
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
    if (!preserveActive) { this.interrupted(); this.end(); }
    this.strokes.clear();
    for (const value of values.slice(0, 10_000)) {
      let stroke = readStroke(value);
      if (!stroke) continue;
      const local = this.local.get(stroke.strokeId);
      if (local && this.active?.stroke === local && preserveActive) {
        Object.assign(local, { ...stroke, points: local.points }); stroke = local;
      }
      // A disconnect can leave the server with only the beginning of our immediate local stroke.
      if (local && local.points.length > stroke.points.length) stroke.points = local.points;
      this.strokes.set(stroke.strokeId, stroke);
    }
    for (const [id, stroke] of this.local) {
      if (!this.strokes.has(id)) this.strokes.set(id, stroke);
    }
    this.adapter.reset();
    for (const stroke of [...this.strokes.values()].sort(strokeOrder)) {
      if (stroke.points.length) this.adapter.draw(stroke, stroke.points, this.continuationPoint(stroke.strokeId));
    }
  }
  forWall(wallId: string): SharedStroke[] {
    return [...this.strokes.values()].filter(s => s.surfaceId.startsWith(wallId + '/')).sort(strokeOrder);
  }
  replay(stroke: SharedStroke): void { this.adapter.draw(stroke, stroke.points, this.continuationPoint(stroke.strokeId)); }
}

export function strokeOrder(a: SharedStroke, b: SharedStroke): number {
  return (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER);
}
