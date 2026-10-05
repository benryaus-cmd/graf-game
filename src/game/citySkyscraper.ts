import * as THREE from 'three';
import { addRooftopRailings, addTowerWindows } from '@/game/cityDetails';
import { addStructureWall, type CityMaterials, type StructureLists } from '@/game/cityStructures';
import { createPaintPlane } from '@/game/architecturePlanes';
import { addStaircase } from '@/game/architectureStairs';

export function addSkyscraper(
  group: THREE.Group,
  lists: StructureLists,
  materials: CityMaterials,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
): void {
  const thickness = 0.62;
  const doorWidth = 2.8;
  const lintelY = 3.25;
  const frontZ = z + depth / 2;
  addStructureWall(group, lists, x, z - depth / 2, width, height, thickness, materials.wallMaterial);
  addStructureWall(group, lists, x - width / 2, z, thickness, height, depth, materials.wallMaterial);
  addStructureWall(group, lists, x + width / 2, z, thickness, height, depth, materials.wallMaterial);
  const segmentWidth = (width - doorWidth) / 2;
  addStructureWall(group, lists, x - (doorWidth + segmentWidth) / 2, frontZ, segmentWidth, height, thickness, materials.wallMaterial);
  addStructureWall(group, lists, x + (doorWidth + segmentWidth) / 2, frontZ, segmentWidth, height, thickness, materials.wallMaterial);
  addStructureWall(group, lists, x, frontZ, doorWidth, height - lintelY, thickness, materials.wallMaterial, lintelY);
  addTowerWindows(group, x, z, width, depth, height, materials.glassMaterial);

  for (let level = 9; level < height - 4; level += 11) {
    addStructureWall(group, lists, x, frontZ + 0.9, width + 1.1, 0.34, 1.8, materials.wallMaterial, level);
    addRooftopRailings(group, x, frontZ + 0.95, width + 0.75, 1.55, level + 0.34, materials.railMaterial, lists.colliders);
  }

  const floorWidth = Math.max(5, width - 1.2);
  const floorDepth = Math.max(5, depth - 1.2);
  const stairStart = frontZ - 0.6;
  const stairEnd = z + 0.5;
  for (let floorY = 8; floorY < height - 2; floorY += 8) {
    const floor = createPaintPlane(group, x, z, floorWidth, floorDepth, floorY, materials.groundMaterial);
    lists.walls.push(floor);
    lists.walkSurfaces.push({
      minX: x - floorWidth / 2, maxX: x + floorWidth / 2,
      minZ: z - floorDepth / 2, maxZ: z + floorDepth / 2, height: floorY,
    });
    const stairs = addStaircase(
      group, x, stairStart, stairEnd, floorY, materials.wallMaterial,
      floorY - 8, 2.8,
    );
    lists.staircases.push(stairs.stairs);
    lists.colliders.push(stairs.collider);
    lists.walkSurfaces.push(stairs.surface);
    lists.walls.push(...stairs.paintWalls);
  }
}