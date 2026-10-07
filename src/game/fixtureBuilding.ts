import * as THREE from 'three';
import { loadModel, release, type Model } from '@/game/assetPreview';
import { createPaintSurfaceLayer } from '@/game/paintSurfaceLayer';
import type { Collider, PaintWall, PaintWorkspaceState } from '@/game/worldTypes';
import { FIXTURE_FACES, FIXTURE_SCALE, FIXTURE_HEIGHT, FIXTURE_POSITION, FIXTURE_MODEL_OFFSET } from '@/game/fixtureBuildingFaces';
import { createFixtureGrain, applyFixtureGrain } from '@/game/fixtureBuildingGrain';
export { FIXTURE_DEPTH, FIXTURE_POSITION } from '@/game/fixtureBuildingFaces';

const MODEL_URL = 'https://raw.githubusercontent.com/benryaus-cmd/graf-game/77b8bb73af715da9dbd691dbddae109316e394fd/public/assets/preview/building.glb';
export const FIXTURE_VISIBILITY_DISTANCE = 80;
const GRAIN_DISTANCE = FIXTURE_VISIBILITY_DISTANCE / 4;
type Load = (url: string, signal: AbortSignal) => Promise<Model>;

export function addFixtureBuilding(parent: THREE.Group, load: Load = loadModel) {
  const root = new THREE.Group(); root.name = 'graffciti-fixture-building'; parent.add(root);
  const grain = createFixtureGrain(), detail = { value: 1 };
  let closed = false, loaded = false, pending: Promise<void> | null = null, request: AbortController | null = null, retryAt = 0;
  // A compact solid fallback keeps this permanent location usable while its model downloads.
  const fallback = new THREE.Mesh(new THREE.BoxGeometry(3.4, FIXTURE_HEIGHT, 7.1), new THREE.MeshStandardMaterial({ color: '#92938b', roughness: 1 }));
  fallback.position.set(0, FIXTURE_HEIGHT / 2, FIXTURE_POSITION.z); root.add(fallback);
  const walls: PaintWall[] = FIXTURE_FACES.map((face, index) => {
    const [x, y, z, width, height, qx, qy, qz, qw] = face;
    const geometry = new THREE.PlaneGeometry(width, height); geometry.addGroup(0, 6, 0);
    const target = new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, [target]); mesh.name = `fixture-slab-${index}`;
    mesh.position.set(x, y, z); mesh.quaternion.set(qx, qy, qz, qw).normalize();
    mesh.userData.fixtureSlab = true; mesh.userData.paintWorkspaceContext = root; root.add(mesh);
    const resolutionScale = Math.min(1, 2048 / Math.max(width * 64, height * 64));
    const resolution = [{ width: Math.max(32, Math.round(width * 64 * resolutionScale)), height: Math.max(32, Math.round(height * 64 * resolutionScale)) }];
    const layers: PaintWall['layers'] = [];
    const createLayer = () => {
      const layer = createPaintSurfaceLayer(mesh, geometry, 1, [0], resolution, false, layers.length);
      const material = layer.mesh.material as THREE.Material; material.visible = false;
      const ensure = layer.ensureFace;
      layer.ensureFace = face => { const context = ensure(face); if (context) material.visible = true; return context; };
      layers.push(layer); return layer;
    };
    const first = createLayer();
    return { mesh, uvScales: [{ u: 1, v: 1 }], faceDimensions: [{ width, height }], layers, contexts: first.contexts, textures: first.textures, createLayer };
  });
  // Inset core: raised/recessed exterior faces remain reachable without passing through the building.
  const collider: Collider = { minX: -1.35, maxX: 1.35, minZ: FIXTURE_POSITION.z - 3.15, maxZ: FIXTURE_POSITION.z + 3.15, minY: 0, maxY: FIXTURE_HEIGHT - .8 };

  function ensureVisual(): Promise<void> {
    if (closed || loaded || Date.now() < retryAt) return Promise.resolve();
    if (pending) return pending;
    const controller = new AbortController(); request = controller;
    pending = (async () => {
      let model: Model | undefined;
      try {
        model = await load(MODEL_URL, controller.signal);
        if (closed || controller.signal.aborted) { release(model.scene); return; }
        model.scene.scale.setScalar(FIXTURE_SCALE); model.scene.position.set(...FIXTURE_MODEL_OFFSET); model.scene.name = 'quaternius-building';
        model.scene.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material instanceof THREE.MeshStandardMaterial) applyFixtureGrain(material, grain, detail);
          // If the visual arrives during painting, join the context that is already visible.
          const workspace = root.userData.paintWorkspaceState as PaintWorkspaceState | undefined;
          if (workspace?.active && workspace.savedLayers) {
            workspace.savedLayers.set(object, object.layers.isEnabled(31));
            object.layers.enable(31);
          }
        });
        root.add(model.scene); fallback.visible = false; loaded = true;
      } catch { if (model) release(model.scene); retryAt = Date.now() + 10_000; }
      finally { request = null; pending = null; }
    })();
    return pending;
  }
  fallback.onBeforeRender = () => { void ensureVisual(); };

  function updateDistance(x: number, z: number): void {
    const distanceSq = x * x + (z - FIXTURE_POSITION.z) ** 2;
    root.visible = distanceSq < FIXTURE_VISIBILITY_DISTANCE * FIXTURE_VISIBILITY_DISTANCE;
    detail.value = distanceSq < GRAIN_DISTANCE ** 2 ? 1 : 0;
  }
  function dispose(): void {
    if (closed) return;
    closed = true; request?.abort(); grain.dispose();
    // Chunk disposal owns all attached geometry/materials. Late model results are released above.
  }
  root.userData.updateFixture = updateDistance; root.userData.disposeFixture = dispose;
  return { root, walls, collider, detail, updateDistance, ensureVisual, dispose };
}
