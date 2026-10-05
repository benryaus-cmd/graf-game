import * as THREE from 'three';
import { createPaintPlane } from '@/game/architecturePlanes';
import { createPaintWall } from '@/game/architectureWalls';
import { addStaircase } from '@/game/architectureStairs';
import { addRooftopRailings } from '@/game/cityDetails';
import type { Collider, PaintWall, Staircase, WalkSurface } from '@/game/worldTypes';

export interface CityMaterials {
  wallMaterial: THREE.MeshStandardMaterial;
  groundMaterial: THREE.MeshStandardMaterial;
  railMaterial: THREE.MeshStandardMaterial;
  glassMaterial: THREE.MeshStandardMaterial;
}

export interface StructureLists {
  walls: PaintWall[];
  colliders: Collider[];
  walkSurfaces: WalkSurface[];
  staircases: Staircase[];
}

export function addStructureWall(
  group: THREE.Group,
  lists: StructureLists,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  material: THREE.MeshStandardMaterial,
  baseY = 0,
): void {
  const created = createPaintWall(group, x, z, width, height, depth, material, baseY);
  lists.walls.push(created.wall);
  lists.colliders.push(created.collider);
}

export function addHouse(
  group: THREE.Group,
  lists: StructureLists,
  materials: CityMaterials,
  x: number,
  z: number,
  width: number,
  depth: number,
  hasStairs: boolean,
): void {
  const wallHeight = 4.1;
  const thickness = 0.48;
  const doorWidth = 2.7;
  const roofTop = 4.65;
  const frontZ = z + depth / 2;
  addStructureWall(group, lists, x, z - depth / 2, width, wallHeight, thickness, materials.wallMaterial);
  addStructureWall(group, lists, x - width / 2, z, thickness, wallHeight, depth, materials.wallMaterial);
  addStructureWall(group, lists, x + width / 2, z, thickness, wallHeight, depth, materials.wallMaterial);
  const segmentWidth = (width - doorWidth) / 2;
  addStructureWall(
    group,
    lists,
    x - (doorWidth + segmentWidth) / 2,
    frontZ,
    segmentWidth,
    wallHeight,
    thickness,
    materials.wallMaterial,
  );
  addStructureWall(
    group,
    lists,
    x + (doorWidth + segmentWidth) / 2,
    frontZ,
    segmentWidth,
    wallHeight,
    thickness,
    materials.wallMaterial,
  );
  addStructureWall(
    group,
    lists,
    x,
    frontZ,
    doorWidth,
    0.82,
    thickness,
    materials.wallMaterial,
    wallHeight - 0.82,
  );
  addStructureWall(
    group,
    lists,
    x,
    z,
    width + 0.9,
    0.55,
    depth + 0.9,
    materials.wallMaterial,
    wallHeight,
  );
  lists.walkSurfaces.push({
    minX: x - width / 2 - 0.4,
    maxX: x + width / 2 + 0.4,
    minZ: z - depth / 2 - 0.4,
    maxZ: z + depth / 2 + 0.4,
    height: roofTop,
  });
  addRooftopRailings(
    group,
    x,
    z,
    width + 0.3,
    depth + 0.3,
    roofTop,
    materials.railMaterial,
    lists.colliders,
  );

  if (!hasStairs) return;
  const stairs = addStaircase(
    group,
    x + width / 2 + 2.6,
    z + depth / 2 + 8,
    z + depth / 2 + 0.5,
    roofTop,
    materials.wallMaterial,
  );
  lists.staircases.push(stairs.stairs);
  lists.colliders.push(stairs.collider);
  lists.walkSurfaces.push(stairs.surface);
  lists.walls.push(...stairs.paintWalls);
}

export function createChunkGround(
  group: THREE.Group,
  centerX: number,
  centerZ: number,
  material: THREE.MeshStandardMaterial,
): PaintWall {
  const floor = createPaintPlane(group, centerX, centerZ, 48, 48, 0, material, false, 768);
  floor.mesh.userData.mapGroundPaintSurface = true;
  return floor;
}

export function addConcreteBillboard(
  group: THREE.Group,
  lists: StructureLists,
  materials: CityMaterials,
  x: number,
  z: number,
  orientation: 'x' | 'z',
  width = 7.4,
  height = 3.6,
  boardElevation = 1.3,
): void {
  const slabThickness = 0.44;
  const boardWidth = orientation === 'x' ? width : slabThickness;
  const boardDepth = orientation === 'x' ? slabThickness : width;

  // Main concrete billboard canvas (resolution 512 for high detail art)
  const board = createPaintWall(
    group,
    x,
    z,
    boardWidth,
    height,
    boardDepth,
    materials.wallMaterial,
    boardElevation,
    512,
  );
  lists.walls.push(board.wall);
  lists.colliders.push(board.collider);

  // Two sturdy concrete support pillars
  const pillarThickness = 0.52;
  const pillarOffset = (width / 2) - 0.75;
  const p1X = orientation === 'x' ? x - pillarOffset : x;
  const p1Z = orientation === 'x' ? z : z - pillarOffset;
  const p2X = orientation === 'x' ? x + pillarOffset : x;
  const p2Z = orientation === 'x' ? z : z + pillarOffset;

  const pillar1 = createPaintWall(
    group,
    p1X,
    p1Z,
    pillarThickness,
    boardElevation,
    pillarThickness,
    materials.wallMaterial,
    0,
  );
  const pillar2 = createPaintWall(
    group,
    p2X,
    p2Z,
    pillarThickness,
    boardElevation,
    pillarThickness,
    materials.wallMaterial,
    0,
  );
  lists.walls.push(pillar1.wall, pillar2.wall);
  lists.colliders.push(pillar1.collider, pillar2.collider);

  // Top concrete cap/framing
  const capThickness = 0.28;
  const capWidth = orientation === 'x' ? width + 0.6 : slabThickness + 0.35;
  const capDepth = orientation === 'x' ? slabThickness + 0.35 : width + 0.6;
  const cap = createPaintWall(
    group,
    x,
    z,
    capWidth,
    capThickness,
    capDepth,
    materials.wallMaterial,
    boardElevation + height,
  );
  lists.walls.push(cap.wall);
  lists.colliders.push(cap.collider);

  // Walk surface on top of the billboard cap
  lists.walkSurfaces.push({
    minX: x - capWidth / 2,
    maxX: x + capWidth / 2,
    minZ: z - capDepth / 2,
    maxZ: z + capDepth / 2,
    height: boardElevation + height + capThickness,
  });

  // Catwalk ledge at the base of the billboard
  const ledgeWidth = orientation === 'x' ? width + 0.4 : 1.1;
  const ledgeDepth = orientation === 'x' ? 1.1 : width + 0.4;
  const ledge = createPaintWall(
    group,
    x,
    z,
    ledgeWidth,
    0.28,
    ledgeDepth,
    materials.wallMaterial,
    boardElevation - 0.28,
  );
  lists.walls.push(ledge.wall);
  lists.colliders.push(ledge.collider);
  lists.walkSurfaces.push({
    minX: x - ledgeWidth / 2,
    maxX: x + ledgeWidth / 2,
    minZ: z - ledgeDepth / 2,
    maxZ: z + ledgeDepth / 2,
    height: boardElevation,
  });
}