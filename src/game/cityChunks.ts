import * as THREE from 'three';
import type { PaintWall, Collider, Staircase, WalkSurface } from '@/game/worldTypes';
import { CITY_CHUNK_SIZE, createCityChunk } from '@/game/cityChunkContent';
import type { CityMaterials } from '@/game/cityStructures';
import type { CityChunk, PaintCache } from '@/game/cityChunkTypes';
import { clearChunkPaint, restoreChunkPaint, saveChunkPaint, syncPaintVisibility } from '@/game/cityChunkPaint';
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
  const failedPaintSaves = new Map<string, string>();
  const sharedMaterials = new Set<THREE.Material>(Object.values(cityMaterials));
  let layerVisibility = [true];
  let centerX: number | null = null;
  let centerZ: number | null = null;
  let paintSession: 'solo' | 'multiplayer' = 'solo';
  let paintGeneration = 0;

  const saveOneChunk = (key: string, chunk: CityChunk): void => {
    if (paintSession !== 'solo') return;
    saveChunkPaint(paintCache, key, chunk);
    savePersistentChunkPaint(paintCache, key, chunk, failedPaintSaves);
    // An unfinished decode needs its encoded base plus current overlay, not a partial ImageData cache.
    chunk.walls.forEach((wall, index) => {
      if (wall.pendingPaintImages?.size) paintCache.delete(`${key}:${index}`);
    });
    savePersistentChunkPosters(key, chunk);
  };

  const restoreOneChunk = (key: string, chunk: CityChunk): void => {
    const generation = paintGeneration;
    restoreChunkPaint(paintCache, key, chunk, layerVisibility, () =>
      generation === paintGeneration && paintSession === 'solo' && active.get(key) === chunk,
      failedPaintSaves,
    );
  };

  const updateAt = (x: number, z: number): void => {
    active.forEach(chunk => chunk.group.userData.updateFixture?.(x, z));
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
      if (paintSession === 'solo') restoreOneChunk(key, chunk);
      chunk.group.userData.updateFixture?.(x, z);
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

  const setPaintSession = (session: 'solo' | 'multiplayer'): void => {
    if (session === paintSession) return;
    savePaint();
    paintGeneration++;
    paintSession = session;
    active.forEach((chunk, key) => {
      clearChunkPaint(chunk);
      if (session === 'solo') restoreOneChunk(key, chunk);
    });
  };

  return {
    walls,
    colliders,
    walkSurfaces,
    staircases,
    updateAt,
    setLayerVisibility,
    savePaint,
    clearPaintCache: () => { paintCache.clear(); failedPaintSaves.clear(); },
    setPaintSession,
  };
}
