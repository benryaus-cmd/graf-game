import * as THREE from 'three';
import type {
  PaintWall,
  PaintWorkspaceBounds,
  PaintWorkspaceSelection,
  PaintWorkspaceState,
  WorldEngine,
} from '@/game/worldTypes';

const LOCAL_POINTS = Array.from({ length: 4 }, () => new THREE.Vector3());
const WORLD_POINTS = Array.from({ length: 4 }, () => new THREE.Vector3());
const LOCAL_NORMAL = new THREE.Vector3();
const EDGE_RIGHT = new THREE.Vector3();
const EDGE_UP = new THREE.Vector3();
const CAMERA_TARGET = new THREE.Vector3();
const CAMERA_RIGHT = new THREE.Vector3();

export const PAINT_WORKSPACE_LAYER = 31;
export const PAINT_WORKSPACE_MAX_METRES = 2;

export function isPaintWorkspaceHitAllowed(
  selection: PaintWorkspaceSelection | null | undefined,
  wall: PaintWall,
  face: number,
  uv: THREE.Vector2,
): boolean {
  if (!selection) return true;
  if (selection.wall !== wall || selection.face !== face) return false;
  const scale = wall.uvScales[face] ?? { u: 1, v: 1 };
  const u = uv.x / scale.u;
  const v = uv.y / scale.v;
  const bounds = selection.bounds;
  return u >= bounds.minU && u <= bounds.maxU && v >= bounds.minV && v <= bounds.maxV;
}

export function selectPaintWorkspaceFace(
  world: WorldEngine,
  wall: PaintWall,
  face: number,
  bounds: PaintWorkspaceBounds,
): PaintWorkspaceState {
  if (world.paintWorkspace?.active) exitPaintWorkspace(world);
  clearSelection(world.paintWorkspace);
  const state = world.paintWorkspace ?? createState();
  const normalized = normalizeBounds(bounds);
  const selection = createSelection(wall, face, normalized);
  if (!selection) throw new Error('Unable to create a workspace for this paint face.');
  state.selection = selection;
  state.pan = new THREE.Vector2();
  world.paintWorkspace = state;
  world.onPaintWorkspaceChange?.(state);
  return state;
}

export function centeredPaintWorkspaceBounds(wall: PaintWall, face: number, uv: THREE.Vector2): PaintWorkspaceBounds {
  return paintWorkspaceBoundsAtSize(wall, face, uv, PAINT_WORKSPACE_MAX_METRES);
}

function paintWorkspaceBoundsAtSize(wall: PaintWall, face: number, uv: THREE.Vector2, size: number): PaintWorkspaceBounds {
  const scale = wall.uvScales[face] ?? { u: 1, v: 1 };
  const dimensions = wall.faceDimensions[face] ?? { width: 1, height: 1 };
  const halfU = Math.min(1, size / dimensions.width) / 2;
  const halfV = Math.min(1, size / dimensions.height) / 2;
  const centerU = THREE.MathUtils.clamp(uv.x / scale.u, halfU, 1 - halfU);
  const centerV = THREE.MathUtils.clamp(uv.y / scale.v, halfV, 1 - halfV);
  return { minU: centerU - halfU, minV: centerV - halfV, maxU: centerU + halfU, maxV: centerV + halfV };
}

export function enterPaintWorkspace(world: WorldEngine): PaintWorkspaceState | undefined {
  const state = world.paintWorkspace;
  if (!state?.selection || state.active) return state;
  state.camera.layers.set(PAINT_WORKSPACE_LAYER);
  state.savedLayers = new Map();
  world.scene.traverse((object) => {
    if ((object as THREE.Object3D & { isLight?: boolean }).isLight) enableWorkspaceLayer(state, object);
  });
  enableSelectedWallLayers(state);
  state.active = true;
  updatePaintWorkspaceCamera(state, world.renderer.domElement.clientWidth, world.renderer.domElement.clientHeight);
  world.onPaintWorkspaceChange?.(state);
  return state;
}

export function exitPaintWorkspace(world: WorldEngine): void {
  const state = world.paintWorkspace;
  if (!state) return;
  if (state.savedLayers) {
    state.savedLayers.forEach((hadLayer, object) => {
      if (!hadLayer) object.layers.disable(PAINT_WORKSPACE_LAYER);
    });
  }
  state.savedLayers = null;
  state.active = false;
  if (state.selection) state.selection.preview.visible = true;
  world.onPaintWorkspaceChange?.(state);
}

export function setPaintWorkspaceSize(world: WorldEngine, sizeMetres: number): PaintWorkspaceState | undefined {
  const state = world.paintWorkspace;
  const old = state?.selection;
  if (!state || !old) return state;
  const size = THREE.MathUtils.clamp(sizeMetres, 0.1, 4);
  const oldBounds = old.bounds;
  const center = new THREE.Vector2((oldBounds.minU + oldBounds.maxU) / 2, (oldBounds.minV + oldBounds.maxV) / 2);
  const scale = old.wall.uvScales[old.face] ?? { u: 1, v: 1 };
  const newBounds = paintWorkspaceBoundsAtSize(old.wall, old.face, new THREE.Vector2(center.x * scale.u, center.y * scale.v), size);
  const selection = createSelection(old.wall, old.face, newBounds);
  if (!selection) return state;
  clearSelection(state);
  state.selection = selection;
  if (state.active) {
    enableSelectedWallLayers(state);
    updatePaintWorkspaceCamera(state, world.renderer.domElement.clientWidth, world.renderer.domElement.clientHeight);
  }
  world.onPaintWorkspaceChange?.(state);
  return state;
}

export function clearPaintWorkspace(world: WorldEngine): void {
  const state = world.paintWorkspace;
  if (!state) return;
  exitPaintWorkspace(world);
  clearSelection(state);
  world.paintWorkspace = undefined;
  world.onPaintWorkspaceChange?.(undefined);
}

export function updatePaintWorkspaceCamera(state: PaintWorkspaceState, width: number, height: number): void {
  const selection = state.selection;
  if (!selection || !width || !height) return;
  enableSelectedWallLayers(state);
  const camera = state.camera;
  const aspect = width / height;
  const faceAspect = selection.width / selection.height;
  let spanX = selection.width;
  let spanY = selection.height;
  if (aspect > faceAspect) spanX = selection.height * aspect;
  else spanY = selection.width / aspect;
  camera.left = -spanX / 2;
  camera.right = spanX / 2;
  camera.top = spanY / 2;
  camera.bottom = -spanY / 2;
  camera.up.copy(selection.up);
  CAMERA_RIGHT.crossVectors(selection.up, selection.normal).normalize();
  CAMERA_TARGET.copy(selection.center)
    .addScaledVector(CAMERA_RIGHT, state.pan?.x ?? 0)
    .addScaledVector(selection.up, state.pan?.y ?? 0);
  camera.position.copy(CAMERA_TARGET).addScaledVector(selection.normal, Math.max(selection.width, selection.height) * 1.5 + 2);
  camera.lookAt(CAMERA_TARGET);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function createState(): PaintWorkspaceState {
  return {
    active: false,
    camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000),
    selection: null,
    savedLayers: null,
  };
}

function normalizeBounds(bounds: PaintWorkspaceBounds): PaintWorkspaceBounds {
  return {
    minU: THREE.MathUtils.clamp(Math.min(bounds.minU, bounds.maxU), 0, 1),
    minV: THREE.MathUtils.clamp(Math.min(bounds.minV, bounds.maxV), 0, 1),
    maxU: THREE.MathUtils.clamp(Math.max(bounds.minU, bounds.maxU), 0, 1),
    maxV: THREE.MathUtils.clamp(Math.max(bounds.minV, bounds.maxV), 0, 1),
  };
}

function createSelection(wall: PaintWall, face: number, bounds: PaintWorkspaceBounds): PaintWorkspaceSelection | null {
  const uvScale = wall.uvScales[face];
  if (!uvScale) return null;
  const u0 = bounds.minU * uvScale.u;
  const u1 = bounds.maxU * uvScale.u;
  const v0 = bounds.minV * uvScale.v;
  const v1 = bounds.maxV * uvScale.v;
  const geometry = wall.mesh.geometry;
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!position || !uv) return null;
  const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as const;
  for (let i = 0; i < corners.length; i += 1) {
    if (!findPositionForUv(geometry, face, corners[i][0], corners[i][1], LOCAL_POINTS[i])) return null;
  }
  const right = EDGE_RIGHT.subVectors(LOCAL_POINTS[1], LOCAL_POINTS[0]);
  const up = EDGE_UP.subVectors(LOCAL_POINTS[3], LOCAL_POINTS[0]);
  const width = right.length();
  const height = up.length();
  if (width < 0.001 || height < 0.001) return null;
  LOCAL_NORMAL.crossVectors(right, up).normalize();
  wall.mesh.updateWorldMatrix(true, false);
  const center = new THREE.Vector3();
  for (let i = 0; i < 4; i += 1) {
    WORLD_POINTS[i].copy(LOCAL_POINTS[i]).addScaledVector(LOCAL_NORMAL, 0.018);
    wall.mesh.localToWorld(WORLD_POINTS[i]);
    center.add(WORLD_POINTS[i]);
  }
  center.multiplyScalar(0.25);
  const worldRight = WORLD_POINTS[1].clone().sub(WORLD_POINTS[0]);
  const worldUp = WORLD_POINTS[3].clone().sub(WORLD_POINTS[0]);
  const worldNormal = worldRight.clone().cross(worldUp).normalize();
  const localOutlinePoints = LOCAL_POINTS.map((point) => point.clone().addScaledVector(LOCAL_NORMAL, 0.018));
  const outline = new THREE.BufferGeometry().setFromPoints(localOutlinePoints);
  const preview = new THREE.LineLoop(outline, new THREE.LineBasicMaterial({ color: '#ffd166', depthTest: false }));
  preview.renderOrder = 100;
  preview.frustumCulled = false;
  wall.mesh.add(preview);
  return {
    wall,
    face,
    bounds,
    center,
    normal: worldNormal,
    up: worldUp.normalize(),
    width,
    height,
    preview,
  };
}

function findPositionForUv(geometry: THREE.BufferGeometry, materialIndex: number, targetU: number, targetV: number, result: THREE.Vector3): boolean {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!position || !uv) return false;
  const index = geometry.index;
  const vertexCount = index ? index.count : position.count;
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: vertexCount, materialIndex: 0 }];
  for (const group of groups) {
    if (group.materialIndex !== materialIndex) continue;
    const end = Math.min(group.start + group.count, vertexCount);
    for (let offset = group.start; offset + 2 < end; offset += 3) {
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      const ax = uv.getX(ia), ay = uv.getY(ia);
      const bx = uv.getX(ib), by = uv.getY(ib);
      const cx = uv.getX(ic), cy = uv.getY(ic);
      const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(denominator) < 1e-10) continue;
      const wa = ((by - cy) * (targetU - cx) + (cx - bx) * (targetV - cy)) / denominator;
      const wb = ((cy - ay) * (targetU - cx) + (ax - cx) * (targetV - cy)) / denominator;
      const wc = 1 - wa - wb;
      if (wa < -1e-5 || wb < -1e-5 || wc < -1e-5 || wa > 1.00001 || wb > 1.00001 || wc > 1.00001) continue;
      result.set(
        position.getX(ia) * wa + position.getX(ib) * wb + position.getX(ic) * wc,
        position.getY(ia) * wa + position.getY(ib) * wb + position.getY(ic) * wc,
        position.getZ(ia) * wa + position.getZ(ib) * wb + position.getZ(ic) * wc,
      );
      return true;
    }
  }
  return false;
}

function clearSelection(state: PaintWorkspaceState | undefined): void {
  const selection = state?.selection;
  if (!selection) return;
  selection.preview.parent?.remove(selection.preview);
  selection.preview.geometry.dispose();
  (selection.preview.material as THREE.Material).dispose();
  state!.selection = null;
}

function enableWorkspaceLayer(state: PaintWorkspaceState, object: THREE.Object3D): void {
  if (!state.savedLayers?.has(object)) state.savedLayers?.set(object, object.layers.isEnabled(PAINT_WORKSPACE_LAYER));
  object.layers.enable(PAINT_WORKSPACE_LAYER);
}

function enableSelectedWallLayers(state: PaintWorkspaceState): void {
  state.selection?.wall.mesh.traverse((object) => enableWorkspaceLayer(state, object));
}
