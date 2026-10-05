import assetsData from '@/config/assets';
import * as THREE from 'three';

const BUNNY_IMAGE_URL = assetsData.IMAGE_NXJF;

function addMesh<T extends THREE.BufferGeometry>(
  group: THREE.Group,
  geometry: T,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh<T> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

export function createBunnyCompanion(scene: THREE.Scene): THREE.Group {
  const bunny = new THREE.Group();
  bunny.scale.setScalar(0.66);
  const fur = new THREE.MeshStandardMaterial({ color: '#bd8de0', roughness: 0.92 });
  const coral = new THREE.MeshStandardMaterial({ color: '#ff806c', roughness: 0.9 });
  const innerEar = new THREE.MeshStandardMaterial({ color: '#eeb8dc', roughness: 0.9 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#ffd83d', roughness: 0.55 });
  const pupil = new THREE.MeshStandardMaterial({ color: '#17131b', roughness: 0.48 });
  const nose = new THREE.MeshStandardMaterial({ color: '#f29bc4', roughness: 0.72 });
  const white = new THREE.MeshStandardMaterial({ color: '#f8edf9', roughness: 0.65 });
  const body = addMesh(bunny, new THREE.SphereGeometry(0.4, 16, 12), coral, 0, 0.48, 0);
  body.scale.set(0.82, 1, 0.72);
  const head = addMesh(bunny, new THREE.SphereGeometry(0.38, 16, 12), fur, 0, 0.94, 0.08);
  head.scale.set(1.04, 0.92, 0.92);
  const ears = [
    new THREE.CapsuleGeometry(0.085, 0.48, 4, 8),
    new THREE.CapsuleGeometry(0.044, 0.34, 4, 8),
  ];
  const legs: THREE.Mesh[] = [];
  const arms: THREE.Mesh[] = [];
  [-1, 1].forEach((side) => {
    const ear = addMesh(bunny, ears[0], fur, side * 0.17, 1.46, 0.02);
    ear.rotation.z = side * -0.12;
    const inside = addMesh(bunny, ears[1], innerEar, side * 0.17, 1.47, 0.105);
    inside.rotation.z = side * -0.12;
    const eye = addMesh(bunny, new THREE.SphereGeometry(0.088, 12, 10), yellow, side * 0.145, 0.99, 0.398);
    eye.scale.set(1, 1, 0.56);
    addMesh(bunny, new THREE.BoxGeometry(0.052, 0.06, 0.038), pupil, side * 0.145, 0.99, 0.45);
    addMesh(bunny, new THREE.SphereGeometry(0.06, 10, 8), white, side * 0.07, 0.84, 0.42);
    const arm = addMesh(bunny, new THREE.CapsuleGeometry(0.075, 0.28, 4, 8), coral, side * 0.31, 0.47, 0.02);
    arm.rotation.z = side * -0.48;
    arms.push(arm);
    legs.push(addMesh(bunny, new THREE.CapsuleGeometry(0.09, 0.24, 4, 8), coral, side * 0.17, 0.16, 0.02));
    addMesh(bunny, new THREE.SphereGeometry(0.12, 12, 8), coral, side * 0.24, 0.16, 0.14);
  });
  addMesh(bunny, new THREE.SphereGeometry(0.055, 10, 8), nose, 0, 0.89, 0.46);
  addMesh(bunny, new THREE.SphereGeometry(0.11, 12, 8), coral, 0, 0.33, -0.31);

  const badgeTexture = new THREE.TextureLoader().load(
    BUNNY_IMAGE_URL,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    },
    undefined,
    (error) => console.warn('[Aippy] Bunny artwork could not be loaded.', error),
  );
  const badgeMaterial = new THREE.MeshBasicMaterial({
    map: badgeTexture,
    transparent: true,
    alphaTest: 0.08,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const badge = addMesh(bunny, new THREE.PlaneGeometry(0.2, 0.2), badgeMaterial, 0, 0.5, -0.29);
  badge.rotation.y = Math.PI;
  badge.renderOrder = 3;
  badge.visible = false;
  bunny.userData.legs = legs;
  bunny.userData.arms = arms;
  bunny.userData.elapsed = 0;
  scene.add(bunny);
  return bunny;
}