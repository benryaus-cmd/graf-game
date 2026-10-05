import * as THREE from 'three';
import type { PaintWall, PosterArtwork } from '@/game/worldTypes';

export function addPosterOverlay(
  wall: PaintWall,
  artwork: PosterArtwork,
  image: HTMLImageElement,
): void {
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(artwork.width, artwork.height),
    material,
  );
  mesh.position.fromArray(artwork.position);
  mesh.quaternion.fromArray(artwork.quaternion);
  mesh.renderOrder = 90;
  mesh.userData.posterArtwork = true;
  (wall.layers[0]?.mesh ?? wall.mesh).add(mesh);
}