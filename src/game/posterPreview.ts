import * as THREE from 'three';
import type { PaintWall, WorldEngine } from '@/game/worldTypes';
import type { PosterPlacementSession } from '@/game/posterPlacement';
import { isPaintTargetReachable } from '@/game/paintTargeting';
import { createPosterPreview } from '@/game/posterPreviewMesh';

const POSTER_GREEN = new THREE.Color('#55ff91');
const POSTER_RED = new THREE.Color('#ff5d51');
const PLANE_FORWARD = new THREE.Vector3(0, 0, 1);
const FACE_NORMAL = new THREE.Vector3();
const NORMAL_MATRIX = new THREE.Matrix3();
const CAMERA_FORWARD = new THREE.Vector3();
const TARGET_POINT = new THREE.Vector3();
const TARGET_POSITION = new THREE.Vector3();
const LOCAL_NORMAL = new THREE.Vector3();
const LOCAL_ROTATION = new THREE.Quaternion();

function setPreviewSize(session: PosterPlacementSession): number {
  const aspect = session.image.naturalHeight / Math.max(1, session.image.naturalWidth);
  const width = THREE.MathUtils.clamp(session.size, 0.4, 4);
  const height = width * THREE.MathUtils.clamp(aspect, 0.45, 1.8);
  session.preview?.scale.set(width, height, 1);
  return height;
}

export function updatePosterPreview(
  world: WorldEngine,
  session: PosterPlacementSession,
  wallMeshes: THREE.Mesh[],
  wallLookup: Map<THREE.Object3D, PaintWall>,
  raycaster: THREE.Raycaster,
  pointer: THREE.Vector2,
): boolean {
  if (!session.preview) createPosterPreview(session, world);
  const preview = session.preview;
  const outline = session.outlineMaterial;
  if (!preview || !outline) return false;
  const camera = world.cameraMode === 'map' ? world.mapCamera : world.camera;
  raycaster.setFromCamera(pointer.set(0, 0), camera);
  const hit = raycaster.intersectObjects(wallMeshes, false)[0];
  const posterHeight = setPreviewSize(session);
  let valid = false;
  session.target = null;

  if (hit?.face && hit.uv) {
    NORMAL_MATRIX.getNormalMatrix(hit.object.matrixWorld);
    FACE_NORMAL.copy(hit.face.normal).applyMatrix3(NORMAL_MATRIX).normalize();
    preview.position.copy(hit.point).addScaledVector(FACE_NORMAL, 0.035);
    preview.quaternion.setFromUnitVectors(PLANE_FORWARD, FACE_NORMAL);
    const wall = wallLookup.get(hit.object);
    if (wall) {
      const face = Number.isFinite(hit.face.materialIndex) ? hit.face.materialIndex : 0;
      const dimensions = wall.faceDimensions[face] ?? { width: 0, height: 0 };
      const uvScale = wall.uvScales[face] ?? { u: 1, v: 1 };
      const centerX = THREE.MathUtils.clamp(hit.uv.x / uvScale.u, 0, 1) * dimensions.width;
      const centerY = (1 - THREE.MathUtils.clamp(hit.uv.y / uvScale.v, 0, 1)) * dimensions.height;
      const upright = Math.abs(FACE_NORMAL.y) < 0.38;
      const fits = session.size <= dimensions.width && posterHeight <= dimensions.height &&
        centerX >= session.size / 2 && centerX <= dimensions.width - session.size / 2 &&
        centerY >= posterHeight / 2 && centerY <= dimensions.height - posterHeight / 2;
      const selection = world.paintWorkspace?.selection;
      const insideArea = !selection || (selection.wall === wall && selection.face === face &&
        centerX - session.size / 2 >= selection.bounds.minU * dimensions.width &&
        centerX + session.size / 2 <= selection.bounds.maxU * dimensions.width &&
        centerY - posterHeight / 2 >= (1 - selection.bounds.maxV) * dimensions.height &&
        centerY + posterHeight / 2 <= (1 - selection.bounds.minV) * dimensions.height);
      valid = upright && fits && insideArea && isPaintTargetReachable(raycaster.ray, hit.point, hit.distance, world.playerPosition, world.colliders);
      if (valid) {
        wall.mesh.updateWorldMatrix(true, false);
        TARGET_POINT.copy(hit.point).addScaledVector(FACE_NORMAL, 0.035);
        wall.mesh.worldToLocal(TARGET_POSITION.copy(TARGET_POINT));
        LOCAL_NORMAL.copy(hit.face.normal).normalize();
        LOCAL_ROTATION.setFromUnitVectors(PLANE_FORWARD, LOCAL_NORMAL);
        session.target = {
          wall,
          face,
          centerX,
          centerY,
          width: session.size,
          height: posterHeight,
          position: [TARGET_POSITION.x, TARGET_POSITION.y, TARGET_POSITION.z],
          quaternion: [
            LOCAL_ROTATION.x,
            LOCAL_ROTATION.y,
            LOCAL_ROTATION.z,
            LOCAL_ROTATION.w,
          ],
        };
      }
    }
  } else {
    camera.getWorldDirection(CAMERA_FORWARD);
    preview.position.copy(camera.position).addScaledVector(CAMERA_FORWARD, 3.2);
    preview.quaternion.copy(camera.quaternion);
  }

  outline.color.copy(valid ? POSTER_GREEN : POSTER_RED);
  session.valid = valid;
  return valid;
}