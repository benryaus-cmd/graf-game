import * as THREE from 'three';
import type { PaintWall, WorldEngine } from '@/game/worldTypes';

interface PosterTarget {
  wall: PaintWall;
  face: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface PosterPlacementSession {
  sequence: number;
  image: HTMLImageElement;
  size: number;
  commitSignal: number;
  lastCommitSignal: number;
  valid: boolean;
  lastReportedValid: boolean;
  target: PosterTarget | null;
  preview: THREE.Group | null;
  texture: THREE.Texture | null;
  imageMaterial: THREE.MeshBasicMaterial | null;
  outlineMaterial: THREE.LineBasicMaterial | null;
}

export function createPosterPlacementSession(
  sequence: number,
  image: HTMLImageElement,
  size: number,
  commitSignal: number,
): PosterPlacementSession {
  return {
    sequence, image, size, commitSignal, lastCommitSignal: commitSignal,
    valid: false, lastReportedValid: false, target: null, preview: null,
    texture: null, imageMaterial: null, outlineMaterial: null,
  };
}

export function disposePosterPlacementSession(
  world: WorldEngine | null,
  session: PosterPlacementSession,
): void {
  if (session.preview) world?.scene.remove(session.preview);
  session.preview?.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) object.geometry.dispose();
  });
  session.texture?.dispose();
  session.imageMaterial?.dispose();
  session.outlineMaterial?.dispose();
  session.preview = null;
  session.target = null;
}