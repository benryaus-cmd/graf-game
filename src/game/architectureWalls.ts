import * as THREE from 'three';
import type { Collider, PaintWall } from '@/game/worldTypes';
import { createPaintSurfaceLayer } from '@/game/paintSurfaceLayer';
import { tileBoxGeometry } from '@/game/textureMapping';

export interface CreatedWall {
  wall: PaintWall;
  collider: Collider;
}

const PAINT_FACES = [0, 1, 2, 3, 4, 5];

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
  const mesh = new THREE.Mesh(geometry, Array(6).fill(wallMaterial));
  mesh.position.set(x, baseY + height / 2, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const faceSizes = [
    [depth, height], [depth, height], [width, depth],
    [width, depth], [width, height], [width, height],
  ];
  const uvScales = faceSizes.map(([u, v]) => ({ u: u / 4, v: v / 4 }));
  const layers: PaintWall['layers'] = [];
  const createLayer = () => {
    const layer = createPaintSurfaceLayer(mesh, paintGeometry, 6, PAINT_FACES, resolution, false, layers.length);
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