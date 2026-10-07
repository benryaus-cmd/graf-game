import * as THREE from 'three';
import type { PaintSurfaceLayer } from '@/game/worldTypes';

export interface PaintFaceResolution {
  width: number;
  height: number;
}

export function createPaintSurfaceLayer(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  faceCount: number,
  paintFaces: number[],
  resolution: number | readonly PaintFaceResolution[],
  doubleSided: boolean,
  layerIndex: number,
  planeOffset = 0,
): PaintSurfaceLayer {
  const blank = document.createElement('canvas');
  blank.width = 1;
  blank.height = 1;
  const blankTexture = new THREE.CanvasTexture(blank);
  const contexts: Array<CanvasRenderingContext2D | null> = Array(faceCount).fill(null);
  const textures: THREE.Texture[] = Array(faceCount).fill(blankTexture);
  const materials = textures.map((map) => new THREE.MeshBasicMaterial({
    map,
    visible: false,
    transparent: true,
    depthWrite: false,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2 - layerIndex,
    polygonOffsetUnits: -2 - layerIndex,
    toneMapped: false,
  }));
  const vertexCount = geometry.index ? geometry.index.count : geometry.attributes.position.count;
  if (geometry.groups.length === 0) {
    geometry.addGroup(0, vertexCount, 0);
  }
  const layerMaterial = faceCount === 1 ? materials[0] : materials;
  const mesh = new THREE.Mesh(geometry, layerMaterial);
  mesh.position.z = planeOffset;
  mesh.renderOrder = 3 + layerIndex;
  parent.add(mesh);

  const ensureFace = (face: number): CanvasRenderingContext2D | null => {
    const validFace = Number.isFinite(face) ? face : 0;
    if (validFace < 0 || validFace >= faceCount || !paintFaces.includes(validFace)) return null;
    if (contexts[validFace]) return contexts[validFace];
    const faceResolution =
      typeof resolution === 'number'
        ? { width: resolution, height: resolution }
        : (resolution[validFace] ?? { width: 256, height: 256 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(faceResolution.width));
    canvas.height = Math.max(1, Math.round(faceResolution.height));
    const context = canvas.getContext('2d');
    if (!context) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    contexts[validFace] = context;
    textures[validFace] = texture;
    const material = materials[validFace];
    material.visible = true;
    material.map = texture;
    material.needsUpdate = true;
    return context;
  };

  return { contexts, textures, mesh, ensureFace };
}