import type { PaintWall, Staircase, WalkSurface, Collider } from '@/game/worldTypes';
import * as THREE from 'three';

export interface CityChunk {
  group: THREE.Group;
  walls: PaintWall[];
  colliders: Collider[];
  walkSurfaces: WalkSurface[];
  staircases: Staircase[];
}

export type SavedLayer = Array<ImageData | null>;
export type PaintCache = Map<string, SavedLayer[]>;