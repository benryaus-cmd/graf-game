import * as THREE from 'three';
import type { Collider, PaintWall } from '@/game/worldTypes';
import { createPaintSurfaceLayer } from '@/game/paintSurfaceLayer';
import { tileBoxGeometry } from '@/game/textureMapping';

export interface CreatedWall {
  wall: PaintWall;
  collider: Collider;
}

const PAINT_FACES = [0, 1, 2, 3, 4, 5];

const PAINT_REFERENCE_WORLD_SIZE = 4;
const MAX_PAINT_FACE_RESOLUTION = 2048;
const MIN_PAINT_FACE_RESOLUTION = 32;

function paintFaceResolutions(
  faceSizes: number[][],
  referenceResolution: number,
): Array<{ width: number; height: number }> {
  const pixelsPerWorldUnit =
    referenceResolution / PAINT_REFERENCE_WORLD_SIZE;

  return faceSizes.map(([worldWidth, worldHeight]) => {
    let width =
      Math.max(0.01, worldWidth) *
      pixelsPerWorldUnit;

    let height =
      Math.max(0.01, worldHeight) *
      pixelsPerWorldUnit;

    const largest = Math.max(width, height);

    if (largest > MAX_PAINT_FACE_RESOLUTION) {
      const scale =
        MAX_PAINT_FACE_RESOLUTION / largest;

      width *= scale;
      height *= scale;
    }

    return {
      width: Math.max(
        MIN_PAINT_FACE_RESOLUTION,
        Math.round(width),
      ),
      height: Math.max(
        MIN_PAINT_FACE_RESOLUTION,
        Math.round(height),
      ),
    };
  });
}

export function createPaintWall(
  group: THREE.Object3D,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  wallMaterial: THREE.MeshStandardMaterial,
  baseY = 0,
  resolution = 256,
): CreatedWall {
  const paintGeometry = new THREE.BoxGeometry(width, height, depth);
  const geometry = paintGeometry.clone();
  tileBoxGeometry(geometry, width, height, depth);
  // Keep canonical grouped geometry for raycasts/face IDs. Draw the opaque background once.
  const targetMaterial = new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, Array(6).fill(targetMaterial));
  const visualGeometry = geometry.clone(); visualGeometry.clearGroups();
  const baseVisual = new THREE.Mesh(visualGeometry, wallMaterial);
  mesh.add(baseVisual); mesh.userData.baseVisual = baseVisual;
  mesh.position.set(x, baseY + height / 2, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const faceSizes = [
    [depth, height], [depth, height], [width, depth],
    [width, depth], [width, height], [width, height],
  ];
  const uvScales = faceSizes.map(([u, v]) => ({ u: u / 4, v: v / 4 }));
  const faceResolutions = paintFaceResolutions(faceSizes, resolution);
  const layers: PaintWall['layers'] = [];
  const createLayer = () => {
    const layer = createPaintSurfaceLayer(mesh, paintGeometry, 6, PAINT_FACES, faceResolutions, false, layers.length);
    layers.push(layer);
    return layer;
  };
  const firstLayer = createLayer();
  group.add(mesh);
  return {
    wall: {
      mesh,
      uvScales,
      faceDimensions: faceSizes.map(([faceWidth, faceHeight]) => ({
        width: faceWidth,
        height: faceHeight,
      })),
      layers,
      createLayer,
      contexts: firstLayer.contexts,
      textures: firstLayer.textures,
      dirty: false,
    },
    collider: {
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      minY: baseY,
      maxY: baseY + height,
    },
  };
}