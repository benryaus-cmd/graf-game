import * as THREE from 'three';
import { stampPaintHit, type PaintPoint } from '../game/worldPainting';
import type { PaintWall, PaintSurfaceLayer } from '../game/worldTypes';
import { decodeSurface, pointToHit } from './surfaces';
import type { SharedStroke, StrokePoint } from './protocol';

interface PaintJob {
  stroke: SharedStroke; points: StrokePoint[]; previous: StrokePoint | null; index: number; count: number;
}
interface WallReplay { original: PaintWall; target: PaintWall; jobs: PaintJob[]; staging: boolean }

export class PaintReplay {
  private replays = new Map<string, WallReplay>();
  constructor(private visibility: () => boolean[]) {}
  cancel(): void {
    for (const replay of this.replays.values()) this.dispose(replay);
    this.replays.clear();
  }
  rebuild(wall: PaintWall): void {
    if (!wall.surfaceId) return;
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
    this.replays.set(wall.surfaceId, { original: wall, target, jobs: [], staging: true });
  }
  enqueue(wall: PaintWall, stroke: SharedStroke, points: StrokePoint[], previous: StrokePoint | null): void {
    if (!wall.surfaceId || !points.length) return;
    let replay = this.replays.get(wall.surfaceId);
    if (!replay) {
      replay = { original: wall, target: wall, jobs: [], staging: false };
      this.replays.set(wall.surfaceId, replay);
    }
    replay.jobs.push({ stroke, points, previous, index: 0, count: points.length });
  }
  isRebuilding(wall: PaintWall): boolean { return !!this.replays.get(wall.surfaceId!)?.staging; }
  removeMissing(walls: Map<string, PaintWall>): void {
    for (const [id, replay] of this.replays) {
      if (walls.get(id) !== replay.original) { this.dispose(replay); this.replays.delete(id); }
    }
  }
  update(): void {
    // Incremental offscreen replay leaves current local paint visible and never waits on a snapshot.
    const deadline = performance.now() + 3;
    let remaining = 256;
    for (const [id, replay] of this.replays) {
      while (replay.jobs.length && remaining > 0 && performance.now() < deadline) {
        const job = replay.jobs[0];
        const surface = decodeSurface(job.stroke.surfaceId);
        if (!surface) { replay.jobs.shift(); continue; }
        const previousPoint = job.index > 0 ? job.points[job.index - 1] : job.previous;
        renderNetworkPoint(replay.target, surface.face, surface.layer, job.stroke, job.points[job.index], previousPoint, this.visibility());
        job.index++; remaining--;
        if (job.index >= job.count) replay.jobs.shift();
      }
      if (!replay.jobs.length) {
        if (replay.staging) this.commit(replay);
        this.dispose(replay); this.replays.delete(id);
      }
      if (remaining <= 0 || performance.now() >= deadline) break;
    }
  }
  private commit(replay: WallReplay): void {
    replay.original.layers.forEach((layer, index) => {
      layer.contexts.forEach((context, face) => {
        if (!context) return;
        context.save(); context.setTransform(1, 0, 0, 1, 0, 0); context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        const staging = replay.target.layers[index]?.contexts[face];
        if (staging) context.drawImage(staging.canvas, 0, 0);
        context.restore(); layer.textures[face].needsUpdate = true;
      });
    });
  }
  private dispose(replay: WallReplay): void {
    if (replay.staging) replay.target.layers.forEach(layer => layer.textures.forEach(texture => texture.dispose()));
  }
}

export function renderNetworkPoint(
  wall: PaintWall, face: number, layer: number, stroke: SharedStroke, point: StrokePoint,
  previous: StrokePoint | null, visibility: boolean[],
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
    };
  }
  return stampPaintHit(wall, hit, stroke.colour, point.pressure, Math.max(0.025, stroke.brushSize / 50), layer, prior, visibility[layer] ?? true, stroke.tool === 'eraser');
}
