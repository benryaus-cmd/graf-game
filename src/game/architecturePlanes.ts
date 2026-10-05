import * as THREE from 'three';
import type { PaintWall } from '@/game/worldTypes';
import { createPaintSurfaceLayer } from '@/game/paintSurfaceLayer';
import { tilePlaneGeometry } from '@/game/textureMapping';

export function createPaintPlane(
  group: THREE.Object3D,
  x: number,
  z: number,
  width: number,
  depth: number,
  y: number,
  material: THREE.MeshStandardMaterial,
  faceDown = false,
  resolution = 768,
): PaintWall {
  const paintGeometry = new THREE.PlaneGeometry(width, depth);
  const geometry = paintGeometry.clone();
  tilePlaneGeometry(geometry, width, depth);
  const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
  geometry.addGroup(0, count, 0);
  paintGeometry.addGroup(0, count, 0);
  const mesh = new THREE.Mesh(geometry, [material]);
  mesh.rotation.x = faceDown ? Math.PI / 2 : -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const layers: PaintWall['layers'] = [];
  const createLayer = () => {
    const offset = (faceDown ? -1 : 1) * (0.018 + layers.length * 0.003);
    const layer = createPaintSurfaceLayer(mesh, paintGeometry, 1, [0], resolution, true, layers.length, offset);
    layers.push(layer);
    return layer;
  };
  const firstLayer = createLayer();
  group.add(mesh);
  return {
    mesh,
    uvScales: [{ u: width / 6, v: depth / 6 }],
    faceDimensions: [{ width, height: depth }],
    layers,
    createLayer,
    contexts: firstLayer.contexts,
    textures: firstLayer.textures,
  };
}