import * as THREE from 'three';
import type { PaintWall, Collider, Staircase, WalkSurface } from '@/game/worldTypes';
import { CITY_CHUNK_SIZE, createCityChunk } from '@/game/cityChunkContent';
import type { CityMaterials } from '@/game/cityStructures';
import type { CityChunk, PaintCache } from '@/game/cityChunkTypes';
import { restoreChunkPaint, saveChunkPaint, syncPaintVisibility } from '@/game/cityChunkPaint';
import { disposeChunk } from '@/game/cityChunkResources';
import { savePersistentChunkPaint, savePersistentChunkPosters } from '@/game/paintPersistence';

function removeItems<T>(target: T[], items: T[]): void {
  const removed = new Set(items);
  for (let index = target.length - 1; index >= 0; index -= 1) {
    if (removed.has(target[index])) target.splice(index, 1);
  }
}

export function createCityChunkStream(scene: THREE.Scene, cityMaterials: CityMaterials) {
  const walls: PaintWall[] = [];
  const colliders: Collider[] = [];
  const walkSurfaces: WalkSurface[] = [];
  const staircases: Staircase[] = [];
  const active = new Map<string, CityChunk>();
  const paintCache: PaintCache = new Map();
  const sharedMaterials = new Set<THREE.Material>(Object.values(cityMaterials));
  let layerVisibility = [true];
  let centerX: number | null = null;
  let centerZ: number | null = null;

  const saveOneChunk = (key: string, chunk: CityChunk): void => {
    saveChunkPaint(paintCache, key, chunk);
    savePersistentChunkPaint(paintCache, key);
    savePersistentChunkPosters(key, chunk);
  };

  const updateAt = (x: number, z: number): void => {
    const nextX = Math.floor(x / CITY_CHUNK_SIZE + 0.5);
    const nextZ = Math.floor(z / CITY_CHUNK_SIZE + 0.5);
    if (nextX === centerX && nextZ === centerZ) return;
    centerX = nextX;
    centerZ = nextZ;
    const wanted = new Set<string>();
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        wanted.add(`${nextX + offsetX}:${nextZ + offsetZ}`);
      }
    }
    active.forEach((chunk, key) => {
      if (wanted.has(key)) return;
      saveOneChunk(key, chunk);
      scene.remove(chunk.group);
      removeItems(walls, chunk.walls);
      removeItems(colliders, chunk.colliders);
      removeItems(walkSurfaces, chunk.walkSurfaces);
      removeItems(staircases, chunk.staircases);
      disposeChunk(chunk, sharedMaterials);
      active.delete(key);
    });
    wanted.forEach((key) => {
      if (active.has(key)) return;
      const [chunkX, chunkZ] = key.split(':').map(Number);
      const chunk = createCityChunk(chunkX, chunkZ, cityMaterials);
      restoreChunkPaint(paintCache, key, chunk, layerVisibility);
      scene.add(chunk.group);
      active.set(key, chunk);
      walls.push(...chunk.walls);
      colliders.push(...chunk.colliders);
      walkSurfaces.push(...chunk.walkSurfaces);
      staircases.push(...chunk.staircases);
    });
  };

  const setLayerVisibility = (visibility: boolean[]): void => {
    layerVisibility = [...visibility];
    active.forEach((chunk) => chunk.walls.forEach((wall) => syncPaintVisibility(wall, layerVisibility)));
  };

  const savePaint = (): void => {
    active.forEach((chunk, key) => saveOneChunk(key, chunk));
  };

  return {
    walls,
    colliders,
    walkSurfaces,
    staircases,
    updateAt,
    setLayerVisibility,
    savePaint,
    clearPaintCache: () => paintCache.clear(),
  };
}