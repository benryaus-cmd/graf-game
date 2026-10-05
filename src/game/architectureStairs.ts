import * as THREE from 'three';
import { createPaintWall } from '@/game/architectureWalls';
import type { Collider, PaintWall, Staircase, WalkSurface } from '@/game/worldTypes';

export function addStaircase(
  group: THREE.Object3D,
  x: number,
  startZ: number,
  endZ: number,
  topY: number,
  wallMaterial: THREE.MeshStandardMaterial,
  baseY = 0,
  landingDepth = 6.2,
): { stairs: Staircase; collider: Collider; surface: WalkSurface; paintWalls: PaintWall[] } {
  const stepCount = Math.max(12, Math.ceil((topY - baseY) / 0.4));
  const width = 4.8;
  const stairDepth = Math.abs(endZ - startZ) / stepCount;
  const paintWalls: PaintWall[] = [];
  for (let index = 0; index < stepCount; index += 1) {
    const stepTop = baseY + (topY - baseY) * ((index + 1) / stepCount);
    const progress = (index + 0.5) / stepCount;
    const step = createPaintWall(
      group, x, startZ + (endZ - startZ) * progress, width,
      stepTop - baseY, stairDepth + 0.035, wallMaterial, baseY,
    );
    paintWalls.push(step.wall);
  }
  const landingZ = endZ + Math.sign(endZ - startZ) * 3;
  const landingWidth = 6.4;
  const landingHeight = 0.5;
  const landing = createPaintWall(
    group, x, landingZ, landingWidth, landingHeight, landingDepth,
    wallMaterial, topY - landingHeight,
  );
  paintWalls.push(landing.wall);
  const bounds = {
    minX: x - landingWidth / 2, maxX: x + landingWidth / 2,
    minZ: landingZ - landingDepth / 2, maxZ: landingZ + landingDepth / 2,
  };
  return {
    stairs: {
      minX: x - width / 2, maxX: x + width / 2,
      minZ: Math.min(startZ, endZ), maxZ: Math.max(startZ, endZ),
      startZ, endZ, baseY, topY, steps: stepCount,
    },
    collider: { ...bounds, minY: topY - landingHeight, maxY: topY },
    surface: { ...bounds, height: topY },
    paintWalls,
  };
}