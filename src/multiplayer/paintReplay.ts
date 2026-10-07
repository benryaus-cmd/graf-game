import * as THREE from 'three';
import { stampPaintHit, paintRadius, type PaintPoint } from '../game/worldPainting';
import type { PaintWall, PaintSurfaceLayer } from '../game/worldTypes';
import { decodeSurface, pointToHit } from './surfaces';
import type { SharedStroke, StrokePoint } from './protocol';
import { headForTool, nextHoldSamples } from '../game/sprayHeads';

interface PaintJob {
  stroke: SharedStroke; surface: ReturnType<typeof decodeSurface>; points: StrokePoint[]; previous: StrokePoint | null; holdCount?: number; holdPrevious?: StrokePoint | null; index: number; count: number;
}
interface ReplaySource {
  strokes: readonly SharedStroke[];
  index: number;
  job: PaintJob | null;
  tails: Map<string, StrokePoint>;
  liveLimits: Map<string, { stroke: SharedStroke; count: number }>;
}
interface WallReplay { original: PaintWall; target: PaintWall; jobs: PaintJob[]; source: ReplaySource | null; staging: boolean; committing: boolean; commitIndex: number }

export class PaintReplay {
  private replays = new Map<string, WallReplay>();
  private dwellByStroke = new Map<string, { point: StrokePoint; count: number; wallSurfaceId: string }>();
  constructor(private visibility: () => boolean[]) {}
  get rebuilding(): boolean { return [...this.replays.values()].some(replay => replay.staging); }
  cancel(): void {
    for (const replay of this.replays.values()) this.dispose(replay);
    this.replays.clear();
    this.dwellByStroke.clear();
  }
  rebuild(wall: PaintWall): void {
    if (!wall.surfaceId) return;
    this.dwellByStroke.clear();
    const old = this.replays.get(wall.surfaceId);
    if (old) this.dispose(old);
    const layers: PaintSurfaceLayer[] = [];
    const target: PaintWall = { ...wall, layers, createLayer: () => {
      const index = layers.length;
      while (wall.layers.length <= index) wall.createLayer();
      const real = wall.layers[index];
      const contexts: PaintSurfaceLayer['contexts'] = Array(real.contexts.length).fill(null);
      const textures = real.textures.map(() => new THREE.Texture());
      const layer: PaintSurfaceLayer = {
        mesh: real.mesh, contexts, textures, ensureFace: face => {
          if (contexts[face]) return contexts[face];
          const original = real.ensureFace(face);
          if (!original) return null;
          const canvas = document.createElement('canvas');
          canvas.width = original.canvas.width; canvas.height = original.canvas.height;
          return contexts[face] = canvas.getContext('2d');
        },
      };
      layers.push(layer); return layer;
    } };
    this.replays.set(wall.surfaceId, { original: wall, target, jobs: [], source: null, staging: true, committing: false, commitIndex: 0 });
  }
  /** Submit a canonical wall in O(1); visit strokes and prepare samples inside update's budget. */
  rebuildFrom(wall: PaintWall, strokes: readonly SharedStroke[]): void {
    this.rebuild(wall);
    const replay = wall.surfaceId && this.replays.get(wall.surfaceId);
    if (replay) replay.source = { strokes, index: 0, job: null, tails: new Map(), liveLimits: new Map() };
  }
  enqueue(wall: PaintWall, stroke: SharedStroke, points: StrokePoint[], previous: StrokePoint | null): void {
    if (!wall.surfaceId || !points.length) return;
    let replay = this.replays.get(wall.surfaceId);
    if (!replay) {
      replay = { original: wall, target: wall, jobs: [], source: null, staging: false, committing: false, commitIndex: 0 };
      this.replays.set(wall.surfaceId, replay);
    }
    if (replay.staging && replay.committing) { replay.commitIndex = 0; replay.committing = false; }
    if (replay.source) {
      // Mutable active strokes can grow before their canonical job is visited. Keep their
      // newly appended samples solely in the live queue, after the canonical wall history.
      const boundary = Math.max(0, stroke.points.length - points.length);
      const prior = replay.source.liveLimits.get(stroke.strokeId);
      replay.source.liveLimits.set(stroke.strokeId, { stroke, count: prior?.stroke === stroke ? Math.min(prior.count, boundary) : boundary });
    }
    replay.jobs.push({ stroke, surface: decodeSurface(stroke.surfaceId), points, previous, index: 0, count: points.length });
  }
  isRebuilding(wall: PaintWall): boolean { return !!this.replays.get(wall.surfaceId!)?.staging; }
  removeMissing(walls: Map<string, PaintWall>): void {
    for (const [id, replay] of this.replays) {
      if (walls.get(id) !== replay.original) { this.dispose(replay); this.replays.delete(id); }
    }
    const present = new Set([...walls.values()].map(wall => wall.surfaceId));
    for (const [strokeId, dwell] of this.dwellByStroke) if (!present.has(dwell.wallSurfaceId)) this.dwellByStroke.delete(strokeId);
  }
  update(): void {
    // Incremental offscreen replay leaves current local paint visible and never waits on a snapshot.
    const deadline = performance.now() + 3;
    let remaining = 256;
    for (const [id, replay] of this.replays) {
      while ((replay.source || replay.jobs.length) && remaining > 0 && performance.now() < deadline) {
        const source = replay.source;
        if (source && !source.job) {
          if (source.index >= source.strokes.length) { replay.source = null; continue; }
          const stroke = source.strokes[source.index++];
          const surface = decodeSurface(stroke.surfaceId);
          const limit = source.liveLimits.get(stroke.strokeId);
          const count = limit?.stroke === stroke ? Math.min(stroke.points.length, limit.count) : stroke.points.length;
          if (surface?.wallId === id && count > 0) {
            const split = stroke.strokeId.lastIndexOf('.');
            const segment = Number(stroke.strokeId.slice(split + 1));
            const previousId = split >= 0 && Number.isInteger(segment) && segment > 0 ? `${stroke.strokeId.slice(0, split + 1)}${segment - 1}` : '';
            source.job = { stroke, surface, points: stroke.points, previous: source.tails.get(previousId) ?? null, index: 0, count };
            source.tails.set(stroke.strokeId, stroke.points[count - 1]);
          }
          // Empty/invalid records consume work too; large metadata-only batches cannot monopolise a frame.
          remaining--;
          continue;
        }
        const job = source?.job ?? replay.jobs[0];
        const surface = job.surface;
        if (!surface) { replay.jobs.shift(); remaining--; continue; }
        if (job.holdCount === undefined) {
          const last = this.dwellByStroke.get(job.stroke.strokeId);
          job.holdCount = last?.count ?? 0;
          job.holdPrevious = last?.point ?? job.previous;
        }
        const point = job.points[job.index];
        const prior = job.holdPrevious;
        job.holdCount = nextHoldSamples(prior ? { worldPoint: [prior.x, prior.y, prior.z], holdSamples: job.holdCount || 1 } : null, [point.x, point.y, point.z]);
        job.holdPrevious = point;
        const previousPoint = job.index > 0 ? job.points[job.index - 1] : job.previous;
        renderNetworkPoint(replay.target, surface.face, surface.layer, job.stroke, point, previousPoint, this.visibility(), job.holdCount);
        job.index++; remaining--;
        if (job.index >= job.count) {
          this.dwellByStroke.delete(job.stroke.strokeId);
          this.dwellByStroke.set(job.stroke.strokeId, { point, count: job.holdCount, wallSurfaceId: id });
          while (this.dwellByStroke.size > 10_000) this.dwellByStroke.delete(this.dwellByStroke.keys().next().value!);
          if (source) source.job = null; else replay.jobs.shift();
        }
      }
      if (!replay.source && !replay.jobs.length && replay.staging) {
        replay.committing = true;
        if (!this.commit(replay, deadline)) break;
      }
      if (!replay.source && !replay.jobs.length && !replay.committing) {
        this.dispose(replay); this.replays.delete(id);
      }
      if (remaining <= 0 || performance.now() >= deadline) break;
    }
  }
  private commit(replay: WallReplay, deadline: number): boolean {
    const faces = replay.original.layers.flatMap((layer, index) => layer.contexts.map((context, face) => ({ layer, index, context, face })).filter(entry => !!entry.context));
    let processed = 0;
    while (replay.commitIndex < faces.length && processed < 2 && performance.now() < deadline) {
        const { layer, index, context, face } = faces[replay.commitIndex++];
        context.save(); context.setTransform(1, 0, 0, 1, 0, 0); context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        const staging = replay.target.layers[index]?.contexts[face];
        if (staging) context.drawImage(staging.canvas, 0, 0);
        context.restore(); layer.textures[face].needsUpdate = true;
        processed++;
    }
    if (replay.commitIndex >= faces.length) { replay.committing = false; replay.staging = false; return true; }
    return false;
  }
  private dispose(replay: WallReplay): void {
    if (replay.target !== replay.original) replay.target.layers.forEach(layer => layer.textures.forEach(texture => texture.dispose()));
  }
}

export function renderNetworkPoint(
  wall: PaintWall, face: number, layer: number, stroke: SharedStroke, point: StrokePoint,
  previous: StrokePoint | null, visibility: boolean[], holdSamples?: number,
): PaintPoint | null {
  const hit = pointToHit(wall, face, point);
  if (!hit) return null;
  while (wall.layers.length <= layer) wall.createLayer();
  const context = wall.layers[layer]?.ensureFace(face);
  if (!context) return null;
  let prior: PaintPoint | null = null;
  const previousHit = previous ? pointToHit(wall, face, previous) : null;
  if (previousHit?.uv) {
    const scale = wall.uvScales[face] ?? { u: 1, v: 1 };
    prior = {
      object: wall.mesh, face, layer,
      x: THREE.MathUtils.clamp(previousHit.uv.x / scale.u, 0, 1) * context.canvas.width,
      y: (1 - THREE.MathUtils.clamp(previousHit.uv.y / scale.v, 0, 1)) * context.canvas.height,
      worldPoint: [previousHit.point.x, previousHit.point.y, previousHit.point.z],
    };
  }
  if (prior && holdSamples !== undefined) prior.holdSamples = Math.max(0, holdSamples - 1);
  return stampPaintHit(wall, hit, stroke.colour, point.pressure * (stroke.opacity ?? 1), paintRadius(stroke.brushSize), layer, prior, visibility[layer] ?? true, stroke.operation === 'erase' || stroke.tool === 'eraser', headForTool(stroke.tool), holdSamples);
}
