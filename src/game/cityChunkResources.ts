import * as THREE from 'three';
import type { CityChunk } from '@/game/cityChunkTypes';

export function disposeChunk(chunk: CityChunk, sharedMaterials: Set<THREE.Material>): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  chunk.group.traverse((object) => {
    object.userData.disposeFixture?.();
    if (!(object instanceof THREE.Mesh)) return;
    if(object.userData.sharedMapAsset)return;
    if (!object.userData.sharedMapGeometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach((material) => {
      if (sharedMaterials.has(material)||object.userData.sharedMapMaterial) return;
      materials.add(material);
      if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map);
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
