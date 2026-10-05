import * as THREE from 'three';

export function addAvatarMesh<T extends THREE.BufferGeometry>(
  parent: THREE.Object3D,
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
  parent.add(mesh);
  return mesh;
}

export function makeAvatarGroup(parent: THREE.Object3D): THREE.Group {
  const group = new THREE.Group();
  parent.add(group);
  return group;
}