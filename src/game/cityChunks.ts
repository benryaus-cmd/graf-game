import * as THREE from 'three';
import type { PaintWall, Collider, Staircase, WalkSurface } from '@/game/worldTypes';
import { FIXTURE_POSITION, FIXTURE_VISIBILITY_DISTANCE } from '@/game/fixtureBuilding';
import { createCityChunk, prepareCityChunk } from '@/game/cityChunkContent';
import { CityAtmosphere, fogVisualDistance } from './cityAtmosphere';
import { CityHorizon } from '@/game/cityHorizon';
import { wantedChunkKeys, keepChunk, distanceToChunk } from '@/game/cityStreamPolicy';
import { getRenderSettings } from '@/game/renderSettings';
import { performanceLog } from '@/game/performanceLog';
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
  let paintSession: 'solo' | 'multiplayer' = 'solo';
  let paintGeneration = 0;
  let retainedFixture = false;
  const horizon = new CityHorizon(scene);
  const atmosphere=new CityAtmosphere(scene);
  const lastWanted = new Map<string, number>();
  const queued = new Map<string, { build: ReturnType<typeof prepareCityChunk>; partial?: CityChunk }>();
  let getPinnedWall: () => PaintWall | undefined = () => undefined;
  let bootstrapped = false, previousX = 0, previousZ = 0;
  let disposed = false;
  const stats = { active: 0, queued: 0, lastBuildMs: 0 };
  scene.userData.cityStreamStats = stats;

  // Match the former preview's camera-based cutoff, including canvas/map views.
  const previousRender = scene.onBeforeRender;
  scene.onBeforeRender = (...args) => {
    previousRender.apply(scene, args);
    const camera = args[2];
    active.get('0:-1')?.group.userData.updateFixture?.(camera.position.x, camera.position.z);
  };

  const saveOneChunk = (key: string, chunk: CityChunk): void => {
    if (paintSession !== 'solo') return;
    performanceLog.measure('chunk.paintReadback',()=>saveChunkPaint(paintCache,key,chunk),key);
    performanceLog.measure('chunk.paintEncodeAndStore',()=>savePersistentChunkPaint(paintCache,key,chunk,failedPaintSaves),key);
    // An unfinished decode needs its encoded base plus current overlay, not a partial ImageData cache.
    chunk.walls.forEach((wall, index) => {
      if (wall.pendingPaintImages?.size) paintCache.delete(`${key}:${index}`);
    });
    performanceLog.measure('chunk.posterStore',()=>savePersistentChunkPosters(key,chunk),key);
  };

  const restoreOneChunk = (key: string, chunk: CityChunk): void => {
    const generation = paintGeneration;
    restoreChunkPaint(paintCache, key, chunk, layerVisibility, () =>
      !disposed && generation === paintGeneration && paintSession === 'solo' && active.get(key) === chunk,
      failedPaintSaves,
    );
  };

  function mount(key: string, chunk: CityChunk): void {
    // Register before asynchronous restoration checks membership.
    active.set(key, chunk);
    chunk.group.userData.updateFixture?.(previousX, previousZ);
    lastWanted.set(key, performance.now());
    if (paintSession === 'solo') performanceLog.measure('chunk.restoreSync',()=>restoreOneChunk(key,chunk),key);
    scene.add(chunk.group);
    walls.push(...chunk.walls); colliders.push(...chunk.colliders);
    walkSurfaces.push(...chunk.walkSurfaces); staircases.push(...chunk.staircases);
    performanceLog.event('Chunk ready: ' + key);
  }
  const updateAt = (x: number, z: number, playerY=1.7, camera?:THREE.Camera): void => {
    if (disposed) return;
    const now = performance.now(), settings = getRenderSettings();
    retainedFixture = x * x + (z - FIXTURE_POSITION.z) ** 2 < (FIXTURE_VISIBILITY_DISTANCE + 8) ** 2;
    const wanted = wantedChunkKeys(x, z);
    if (retainedFixture) wanted.add('0:-1');
    wanted.forEach(key => lastWanted.set(key, now));
    const dx = x - previousX, dz = z - previousZ;
    // Build neighbours before the next boundary instead of waiting until it is crossed.
    const magnitude = Math.hypot(dx, dz);
    const prefetch = magnitude > .001 ? wantedChunkKeys(x + dx / magnitude * settings.prefetchDistance, z + dz / magnitude * settings.prefetchDistance) : wanted;
    const desired = new Set([...wanted, ...prefetch]);
    desired.forEach(key=>lastWanted.set(key,now));
    previousX = x; previousZ = z;
    active.forEach(chunk => { chunk.group.userData.updateFixture?.(x, z); chunk.group.userData.updateScenery?.(); });
    const pin = getPinnedWall();
    // Dispose at most one old chunk per update; dirty data is saved through the proven path first.
    for (const [key, chunk] of active) {
      if (keepChunk({ wanted: desired.has(key), pinned: !!pin && chunk.walls.includes(pin), lastWanted: lastWanted.get(key) ?? now, now, retentionMs: settings.retentionSeconds * 1000 })) continue;
      saveOneChunk(key, chunk); scene.remove(chunk.group);
      removeItems(walls, chunk.walls); removeItems(colliders, chunk.colliders);
      removeItems(walkSurfaces, chunk.walkSurfaces); removeItems(staircases, chunk.staircases);
      performanceLog.measure('chunk.dispose',()=>disposeChunk(chunk,sharedMaterials),key); active.delete(key); lastWanted.delete(key);
      performanceLog.event('Chunk released: ' + key); break;
    }
    for (const [key, job] of queued) if (!desired.has(key)) {
      if (job.partial) disposeChunk(job.partial, sharedMaterials);
      job.build.return(job.partial!); queued.delete(key);
    }
    if (!bootstrapped) {
      // Keep collision-ready bootstrap compatible. Subsequent travel is staged.
      wanted.forEach(key => { const [cx, cz] = key.split(':').map(Number); mount(key, createCityChunk(cx, cz, cityMaterials)); });
      bootstrapped = true;
    } else {
      for (const key of desired) if (!active.has(key) && !queued.has(key)) {
        const [cx, cz] = key.split(':').map(Number); queued.set(key, { build: prepareCityChunk(cx, cz, cityMaterials) });
      }
      // Prioritise missing current neighbours over speculative prefetch jobs.
      const entries = [...queued.entries()].sort(([a], [b]) => Number(wanted.has(b)) - Number(wanted.has(a)));
      const start = performance.now();
      for (const [key, job] of entries) {
        do {
          const step = performanceLog.measure('chunk.buildStep',()=>job.build.next(),key); job.partial = step.value;
          if (step.done) { mount(key, step.value); step.value.group.userData.updateFixture?.(x, z); queued.delete(key); break; }
        } while (performance.now() - start < settings.streamBudgetMs);
        if (performance.now() - start >= settings.streamBudgetMs) break;
      }
      stats.lastBuildMs = performance.now() - start;
      if (stats.lastBuildMs > 12) performanceLog.event('Chunk preparation spike: ' + Math.round(stats.lastBuildMs) + ' ms');
    }
    stats.active = active.size; stats.queued = queued.size;
    const visibleDetails=new Set<string>();
    for(const[key,chunk]of active){const[cx,cz]=key.split(':').map(Number);chunk.group.visible=distanceToChunk(x,z,cx,cz)<=Math.min(settings.detailDistance,fogVisualDistance(settings,camera))||!!pin&&chunk.walls.includes(pin);if(chunk.group.visible)visibleDetails.add(key);}
    horizon.update(x,z,visibleDetails,camera);
    const anchors=[...active.values()].filter(chunk=>chunk.group.visible).flatMap(chunk=>chunk.group.userData.lampAnchors??[]);
    atmosphere.update(x,z,anchors,settings,now,playerY,camera);
    scene.userData.cityStreamStats.visible=visibleDetails.size;
  };
  const dispose = (): void => {
    if (disposed) return; disposed = true; paintGeneration++;
    queued.forEach(job => { if (job.partial) disposeChunk(job.partial, sharedMaterials); job.build.return(job.partial!); }); queued.clear();
    horizon.dispose(); atmosphere.dispose(); scene.onBeforeRender = previousRender;
    delete scene.userData.disposeCity; delete scene.userData.cityStreamStats;
  };
  scene.userData.disposeCity = dispose;

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
    setPaintPin: (resolve: () => PaintWall | undefined) => { getPinnedWall = resolve; },
    setLayerVisibility,
    savePaint,
    clearPaintCache: () => { paintCache.clear(); failedPaintSaves.clear(); },
    setPaintSession,
  };
}
