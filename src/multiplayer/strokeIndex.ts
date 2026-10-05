import { decodeSurface } from './surfaces';
import type { SharedStroke } from './protocol';

interface Entry { stroke: SharedStroke; wallId: string; order: number }
interface WallBucket { entries: Map<string, Entry>; ordered: SharedStroke[]; dirty: boolean }

/** Maintains per-wall stroke membership and lazily cached sequence ordering. */
export class StrokeIndex {
  private entries = new Map<string, Entry>();
  private walls = new Map<string, WallBucket>();
  private nextOrder = 0;

  set(stroke: SharedStroke): void { this.store(stroke); }

  /** Call after mutating an indexed stroke's surface or sequence metadata. */
  changed(stroke: SharedStroke): void { this.store(stroke); }

  delete(strokeId: string): void {
    const entry = this.entries.get(strokeId);
    if (!entry) return;
    this.entries.delete(strokeId);
    const bucket = this.walls.get(entry.wallId);
    if (!bucket) return;
    bucket.entries.delete(strokeId); bucket.dirty = true;
    if (!bucket.entries.size) this.walls.delete(entry.wallId);
  }

  clear(): void { this.entries.clear(); this.walls.clear(); this.nextOrder = 0; }

  forWall(wallId: string): SharedStroke[] {
    const bucket = this.walls.get(wallId);
    if (!bucket) return [];
    if (bucket.dirty) {
      bucket.ordered = [...bucket.entries.values()]
        .sort((a, b) => (a.stroke.sequence ?? Number.MAX_SAFE_INTEGER) - (b.stroke.sequence ?? Number.MAX_SAFE_INTEGER) || a.order - b.order)
        .map(entry => entry.stroke);
      bucket.dirty = false;
    }
    return bucket.ordered;
  }

  private store(stroke: SharedStroke): void {
    const surface = decodeSurface(stroke.surfaceId);
    const previous = this.entries.get(stroke.strokeId);
    if (!surface) { this.delete(stroke.strokeId); return; }

    if (previous && previous.wallId !== surface.wallId) this.delete(stroke.strokeId);
    const prior = previous?.wallId === surface.wallId ? previous : undefined;
    const entry: Entry = { stroke, wallId: surface.wallId, order: prior?.order ?? this.nextOrder++ };
    this.entries.set(stroke.strokeId, entry);
    let bucket = this.walls.get(surface.wallId);
    if (!bucket) this.walls.set(surface.wallId, bucket = { entries: new Map(), ordered: [], dirty: true });
    bucket.entries.set(stroke.strokeId, entry); bucket.dirty = true;
  }
}
