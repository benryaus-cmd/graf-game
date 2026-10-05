import * as THREE from 'three';
import { addTunnel } from '@/game/architectureTunnels';
import { addSkyscraper } from '@/game/citySkyscraper';
import { createChunkGround, addHouse, addConcreteBillboard } from '@/game/cityStructures';
import type { CityMaterials, StructureLists } from '@/game/cityStructures';
import { addConcreteStreetLamp } from '@/game/cityStreetLamps';
import type { Collider, PaintWall, Staircase, WalkSurface } from '@/game/worldTypes';
import { assignSurfaceIds } from '@/multiplayer/surfaces';

export const CITY_CHUNK_SIZE = 48;

export interface CityChunkContent {
  group: THREE.Group;
  walls: PaintWall[];
  colliders: Collider[];
  walkSurfaces: WalkSurface[];
  staircases: Staircase[];
}

export function createCityChunk(
  chunkX: number,
  chunkZ: number,
  materials: CityMaterials,
): CityChunkContent {
  const group = new THREE.Group();
  const centerX = chunkX * CITY_CHUNK_SIZE;
  const centerZ = chunkZ * CITY_CHUNK_SIZE;
  const walls: PaintWall[] = [];
  const colliders: Collider[] = [];
  const walkSurfaces: WalkSurface[] = [];
  const staircases: Staircase[] = [];
  const floor = createChunkGround(group, centerX, centerZ, materials.groundMaterial);
  walls.push(floor);

  let seed = (Math.imul(chunkX, 374761393) ^ Math.imul(chunkZ, 668265263)) >>> 0;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const towerIndex = random() > 0.72 ? Math.floor(random() * 4) : -1;
  const locations = [-15.5, 15.5];
  let buildingIndex = 0;

  locations.forEach((offsetX) => {
    locations.forEach((offsetZ) => {
      const x = centerX + offsetX + (random() - 0.5) * 1.1;
      const z = centerZ + offsetZ + (random() - 0.5) * 1.1;
      const width = 10.8 + random() * 2.1;
      const depth = 10.8 + random() * 2.1;
      if (buildingIndex === towerIndex) {
        addSkyscraper(
          group,
          { walls, colliders, walkSurfaces, staircases },
          materials,
          x,
          z,
          width,
          depth,
          32 + random() * 23,
        );
      } else {
        addHouse(
          group,
          { walls, colliders, walkSurfaces, staircases },
          materials,
          x,
          z,
          width,
          depth,
          buildingIndex % 2 === 0,
        );
      }
      buildingIndex += 1;
    });
  });

  if (chunkX !== 0 || chunkZ !== 0) {
    const tunnel = addTunnel(
      group,
      centerX,
      centerZ,
      (Math.abs(chunkX) + Math.abs(chunkZ)) % 2 === 0,
      materials.wallMaterial,
    );
    walls.push(...tunnel.walls);
    colliders.push(...tunnel.colliders);
  }

  const lists: StructureLists = { walls, colliders, walkSurfaces, staircases };

  if (chunkX === 0 && chunkZ === 0) {
    addConcreteBillboard(group, lists, materials, centerX + 6.8, centerZ - 6.2, 'x', 7.6, 3.8, 1.3);
    addConcreteBillboard(group, lists, materials, centerX - 6.8, centerZ + 6.2, 'z', 7.6, 3.8, 1.3);
  } else {
    const billboardChance = random();
    if (billboardChance > 0.28) {
      const side = random() > 0.5 ? 1 : -1;
      const orientation: 'x' | 'z' = random() > 0.5 ? 'x' : 'z';
      const bx = orientation === 'x' ? centerX + side * 7.2 : centerX + (random() - 0.5) * 5;
      const bz = orientation === 'x' ? centerZ + (random() - 0.5) * 5 : centerZ + side * 7.2;
      addConcreteBillboard(group, lists, materials, bx, bz, orientation, 7.2 + random() * 1.4, 3.6 + random() * 0.6, 1.2);
    }
    if (billboardChance > 0.68) {
      const side = random() > 0.5 ? 1 : -1;
      const orientation: 'x' | 'z' = random() > 0.5 ? 'x' : 'z';
      const bx = orientation === 'z' ? centerX + side * 7.4 : centerX - 6.8;
      const bz = orientation === 'z' ? centerZ + 6.8 : centerZ + side * 7.4;
      addConcreteBillboard(group, lists, materials, bx, bz, orientation, 6.8 + random() * 1.2, 3.4 + random() * 0.5, 1.1);
    }
  }

  addConcreteStreetLamp(
    group,
    centerX + (random() - 0.5) * 14,
    centerZ + (random() - 0.5) * 14,
    colliders,
  );

  assignSurfaceIds(chunkX, chunkZ, walls);
  return { group, walls, colliders, walkSurfaces, staircases };
}
