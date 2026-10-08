import type * as THREE from 'three';
import type { PaintWorkspaceHistory } from '@/components/PaintWorkspaceHud';
import type { LiveSettings, PaintWall, WorldEngine } from '@/game/worldTypes';

/**
 * Solo Undo is disabled: reading the live paint canvas before a gesture can
 * stall drawing and make subsequent CanvasTexture uploads much slower.
 * Keep the existing lifecycle API so painting and server history stay separate.
 */
export class SoloPaintHistory {
  constructor(_world: WorldEngine, report: (view: PaintWorkspaceHistory) => void) {
    report({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, limit: 0 });
  }
  setAllowed(_allowed: boolean): void {}
  syncSelection(): void {}
  reset(): void {}
  begin(_wall: PaintWall, _hit: THREE.Intersection, _settings: LiveSettings): void {}
  changed(): void {}
  end(): void {}
  undo(): boolean { return false; }
  redo(): boolean { return false; }
}
