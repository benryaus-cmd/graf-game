import type * as THREE from 'three';
import type { PaintWorkspaceHistory } from '@/components/PaintWorkspaceHud';
import type { LiveSettings, PaintWall, WorldEngine } from '@/game/worldTypes';
import { paintRadius } from '@/game/worldPainting';

interface Patch { wall: PaintWall; layer: number; face: number; brushSize: number; context: CanvasRenderingContext2D; x: number; y: number; width: number; height: number; image: ImageData }
const LIMIT = 2;
const MEMORY = 16 * 1024 * 1024;
export class SoloPaintHistory {
  private undoList: Patch[] = [];
  private redoList: Patch[] = [];
  private pending: Patch | null = null;
  private painted = false;
  private selection: WorldEngine['paintWorkspace']['selection'] | undefined;
  private revision = -1;
  private lastView = '';
  private allowed = true;
  constructor(private readonly world: WorldEngine, private readonly report: (view: PaintWorkspaceHistory) => void) {}
  setAllowed(allowed: boolean): void { if (this.allowed !== allowed) { this.allowed = allowed; this.reset(); } }
  syncSelection(): void {
    if (this.selection !== this.world.paintWorkspace?.selection || this.revision !== this.world.paintRevision) {
      this.selection = this.world.paintWorkspace?.selection; this.revision = this.world.paintRevision; this.reset();
    }
  }
  reset(): void { this.undoList = []; this.redoList = []; this.pending = null; this.painted = false; this.emit(); }
  begin(wall: PaintWall, hit: THREE.Intersection, settings: LiveSettings): void {
    this.syncSelection();
    if (!this.allowed || this.world.multiplayerActive || !this.selection?.started || this.selection.wall !== wall || !hit.face) return;
    const face = hit.face.materialIndex ?? 0, layer = Math.max(0, settings.layerIndex);
    if (this.pending?.wall === wall && this.pending.layer === layer && this.pending.face === face && this.pending.brushSize === settings.brushSize) return;
    this.end();
    while (wall.layers.length <= layer) wall.createLayer();
    const context = wall.layers[layer]?.ensureFace(face); if (!context) return;
    const dimensions = wall.faceDimensions[face], bounds = this.selection.bounds;
    // Capture selected bounds plus overspray once per gesture. At maximum dwell,
    // FAT reaches roughly 25.4 radii (scaled head plus its tail); 32 covers its cap.
    const margin = Math.max(.08, paintRadius(settings.brushSize) * 32);
    const minU = Math.max(0, bounds.minU - margin / dimensions.width), maxU = Math.min(1, bounds.maxU + margin / dimensions.width);
    const minV = Math.max(0, bounds.minV - margin / dimensions.height), maxV = Math.min(1, bounds.maxV + margin / dimensions.height);
    const x = Math.floor(minU * context.canvas.width), y = Math.floor((1 - maxV) * context.canvas.height);
    const width = Math.min(context.canvas.width - x, Math.ceil(maxU * context.canvas.width) - x);
    const height = Math.min(context.canvas.height - y, Math.ceil((1 - minV) * context.canvas.height) - y);
    const bytes = width * height * 4;
    this.redoList = [];
    while (this.undoList.length && this.undoList.reduce((n, patch) => n + patch.image.data.byteLength, bytes) > MEMORY) this.undoList.shift();
    try {
      if (!width || !height || bytes > MEMORY) { this.reset(); return; }
      this.pending = { wall, layer, face, brushSize: settings.brushSize, context, x, y, width, height, image: context.getImageData(x, y, width, height) };
      this.painted = false; this.emit();
    } catch { this.reset(); }
  }
  changed(): void { if (this.pending) this.painted = true; }
  end(): void {
    if (!this.pending) return;
    if (this.painted) { this.undoList.push(this.pending); if (this.undoList.length > LIMIT) this.undoList.shift(); }
    this.pending = null; this.painted = false; this.emit();
  }
  undo(): boolean { this.syncSelection(); return this.restore(this.undoList, this.redoList); }
  redo(): boolean { this.syncSelection(); return this.restore(this.redoList, this.undoList); }
  private restore(from: Patch[], to: Patch[]): boolean {
    if (!this.allowed || this.world.multiplayerActive || this.pending || !from.length) return false;
    const patch = from[from.length - 1];
    if (patch.wall.layers[patch.layer]?.ensureFace(patch.face) !== patch.context) { this.reset(); return false; }
    try {
      const image = patch.context.getImageData(patch.x, patch.y, patch.width, patch.height);
      patch.context.putImageData(patch.image, patch.x, patch.y);
      from.pop(); to.push({ ...patch, image });
      patch.wall.dirty = true; patch.wall.layers[patch.layer].textures[patch.face].needsUpdate = true;
      this.emit(); return true;
    } catch { this.reset(); return false; }
  }
  private emit(): void {
    const ready = this.allowed && !this.world.multiplayerActive && !this.pending;
    const view = { canUndo: ready && !!this.undoList.length, canRedo: ready && !!this.redoList.length, undoDepth: this.undoList.length, redoDepth: this.redoList.length, limit: LIMIT };
    const serial = JSON.stringify(view); if (serial !== this.lastView) { this.lastView = serial; this.report(view); }
  }
}
