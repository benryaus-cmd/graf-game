import * as THREE from 'three';
import type { PaintWall, PosterArtwork } from '@/game/worldTypes';

export function addPosterOverlay(
  wall: PaintWall,
  artwork: PosterArtwork,
  image: HTMLImageElement,
): THREE.Mesh {
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
  // Saved width/height are world-space metres. The wall may be scaled, so
  // compensate its full world linear transform along the artwork's own axes.
  wall.mesh.updateWorldMatrix(true, false);
  const artworkQuaternion = new THREE.Quaternion().fromArray(artwork.quaternion);
  const linear = new THREE.Matrix3().setFromMatrix4(wall.mesh.matrixWorld);
  const worldUnitsPerLocal = (axis: THREE.Vector3): number =>
    axis.applyQuaternion(artworkQuaternion).applyMatrix3(linear).length();
  const localWidth = artwork.width / Math.max(worldUnitsPerLocal(new THREE.Vector3(1, 0, 0)), 1e-6);
  const localHeight = artwork.height / Math.max(worldUnitsPerLocal(new THREE.Vector3(0, 1, 0)), 1e-6);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(localWidth, localHeight), material);
  mesh.position.fromArray(artwork.position);
  mesh.quaternion.fromArray(artwork.quaternion);
  // Render clear of the wall along the plane normal; keep persisted placement unchanged.
  const worldNormalUnits = worldUnitsPerLocal(new THREE.Vector3(0, 0, 1));
  mesh.translateZ(0.006 / Math.max(worldNormalUnits, 1e-6));
  mesh.renderOrder = 90;
  mesh.userData.posterArtwork = true;
  wall.mesh.add(mesh);
  return mesh;
}
