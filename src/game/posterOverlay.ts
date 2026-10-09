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
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(artwork.width, artwork.height),
    material,
  );
  mesh.position.fromArray(artwork.position);
  mesh.quaternion.fromArray(artwork.quaternion);
  // Render clear of the wall along the plane normal; keep persisted placement unchanged.
  mesh.translateZ(0.006);
  mesh.renderOrder = 90;
  mesh.userData.posterArtwork = true;
  (wall.layers[0]?.mesh ?? wall.mesh).add(mesh);
}
