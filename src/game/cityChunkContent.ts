import * as THREE from 'three';
import { addTunnel } from '@/game/architectureTunnels';
import { addSkyscraper } from '@/game/citySkyscraper';
import { createChunkGround, addHouse, addConcreteBillboard } from '@/game/cityStructures';
import type { CityMaterials, StructureLists } from '@/game/cityStructures';
import { addConcreteStreetLamp } from '@/game/cityStreetLamps';
import type { Collider, PaintWall, Staircase, WalkSurface } from '@/game/worldTypes';
import { addFixtureBuilding } from '@/game/fixtureBuilding';
import { assignSurfaceIds } from '@/multiplayer/surfaces';
import { createCityBlockLayout } from '@/game/cityBlockLayout';
import { addUrbanCourtyard } from '@/game/urbanCourtyard';

export const CITY_CHUNK_SIZE = 48;

export interface CityChunkContent {
  group: THREE.Group;
  walls: PaintWall[];
  colliders: Collider[];
  walkSurfaces: WalkSurface[];
  staircases: Staircase[];
}

export function* prepareCityChunk(
  chunkX: number,
  chunkZ: number,
  materials: CityMaterials,
): Generator<CityChunkContent, CityChunkContent, void> {
  const group = new THREE.Group();
  const centerX = chunkX * CITY_CHUNK_SIZE;
  const centerZ = chunkZ * CITY_CHUNK_SIZE;
  const walls: PaintWall[] = [];
  const colliders: Collider[] = [];
  const walkSurfaces: WalkSurface[] = [];
  const staircases: Staircase[] = [];
  const floor = createChunkGround(group, centerX, centerZ, materials.groundMaterial);
  walls.push(floor);

  yield { group, walls, colliders, walkSurfaces, staircases };
  const { buildings, random } = createCityBlockLayout(chunkX, chunkZ);
  for (const building of buildings) {
    if (building.tower) {
      addSkyscraper(group, { walls, colliders, walkSurfaces, staircases }, materials, building.x, building.z, building.width, building.depth, building.height);
    } else {
      addHouse(group, { walls, colliders, walkSurfaces, staircases }, materials, building.x, building.z, building.width, building.depth, building.stairs);
    }
    yield { group, walls, colliders, walkSurfaces, staircases };
  }

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

  if (chunkX === 0 && chunkZ === -1) {
    const fixture = addFixtureBuilding(group);
    walls.push(...fixture.walls); colliders.push(fixture.collider);
    group.userData.updateFixture = fixture.updateDistance;
  }

  assignSurfaceIds(chunkX, chunkZ, walls);
  if (chunkX === 1 && chunkZ === 0) { const courtyard = addUrbanCourtyard(group, colliders, buildings); group.userData.updateScenery = courtyard.userData.updateScenery; }
  return { group, walls, colliders, walkSurfaces, staircases };
}

/** Synchronous entry retained for bootstrap, tests and compatible callers. */
export function createCityChunk(chunkX: number, chunkZ: number, materials: CityMaterials): CityChunkContent {
  const build = prepareCityChunk(chunkX, chunkZ, materials);
  let result = build.next();
  while (!result.done) result = build.next();
  return result.value;
}
