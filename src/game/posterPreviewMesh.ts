import * as THREE from 'three';
import type { PosterPlacementSession } from '@/game/posterPlacement';
import type { WorldEngine } from '@/game/worldTypes';

export function createPosterPreview(session: PosterPlacementSession, world: WorldEngine): void {
  const texture = new THREE.Texture(session.image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const imageMaterial = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity: 1, side: THREE.DoubleSide,
    depthTest: false, toneMapped: false,
  });
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: '#ff5d51', depthTest: false, toneMapped: false,
  });
  const preview = new THREE.Group();
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  const imagePlane = new THREE.Mesh(planeGeometry, imageMaterial);
  imagePlane.position.z = 0.012;
  imagePlane.renderOrder = 90;
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(planeGeometry), outlineMaterial);
  outline.position.z = 0.025;
  outline.renderOrder = 91;
  preview.add(imagePlane, outline);
  preview.renderOrder = 90;
  world.scene.add(preview);
  session.preview = preview;
  session.texture = texture;
  session.imageMaterial = imageMaterial;
  session.outlineMaterial = outlineMaterial;
}