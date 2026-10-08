import type { MapId } from './mapPreference';
import assetsData from '@/config/assets';
import * as THREE from 'three';
import { createCityChunkStream } from '@/game/cityChunks';
import type { CityMaterials } from '@/game/cityStructures';

export const WALL_TEXTURE_URL = assetsData.IMAGE_YNIR;

export function createArchitecture(scene: THREE.Scene, wallTexture: THREE.Texture,map:MapId='original') {
  wallTexture.colorSpace = THREE.SRGBColorSpace;
  wallTexture.wrapS = THREE.RepeatWrapping;
  wallTexture.wrapT = THREE.RepeatWrapping;
  wallTexture.repeat.set(1, 1);

  const groundTexture = wallTexture.clone();
  groundTexture.wrapS = THREE.RepeatWrapping;
  groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(1, 1);
  groundTexture.colorSpace = THREE.SRGBColorSpace;

  const materials: CityMaterials = {
    wallMaterial: new THREE.MeshStandardMaterial({
      map: wallTexture,
      color: '#e6e0d3',
      roughness: 0.98,
      metalness: 0,
    }),
    groundMaterial: new THREE.MeshStandardMaterial({
      map: groundTexture,
      color: '#8b8982',
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    railMaterial: new THREE.MeshStandardMaterial({
      color: '#925b42',
      roughness: 0.88,
      metalness: 0.18,
    }),
    glassMaterial: new THREE.MeshStandardMaterial({
      color: '#536a70',
      roughness: 0.48,
      metalness: 0.18,
    }),
  };
  const city = createCityChunkStream(scene, materials,map);
  city.updateAt(0, 0);
  return city;
}