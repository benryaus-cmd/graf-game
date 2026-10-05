import * as THREE from 'three';
import type { Collider } from '@/game/worldTypes';

export function addRooftopRailings(
  group: THREE.Group,
  x: number,
  z: number,
  width: number,
  depth: number,
  baseY: number,
  material: THREE.MeshStandardMaterial,
  colliders: Collider[],
): void {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const rails = new THREE.InstancedMesh(geometry, material, 40);
  const marker = new THREE.Object3D();
  let count = 0;
  const add = (px: number, py: number, pz: number, sx: number, sy: number, sz: number): void => {
    marker.position.set(px, py, pz);
    marker.scale.set(sx, sy, sz);
    marker.rotation.set(0, 0, 0);
    marker.updateMatrix();
    rails.setMatrixAt(count, marker.matrix);
    count += 1;
  };
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const postHeight = 0.96;
  const lineCount = Math.max(3, Math.floor(width / 1.8));

  for (let index = 0; index <= lineCount; index += 1) {
    const px = x - halfWidth + (width * index) / lineCount;
    for (const pz of [z - halfDepth, z + halfDepth]) {
      add(px, baseY + postHeight / 2, pz, 0.11, postHeight, 0.11);
    }
  }
  const sideCount = Math.max(3, Math.floor(depth / 1.8));
  for (let index = 0; index <= sideCount; index += 1) {
    const pz = z - halfDepth + (depth * index) / sideCount;
    add(x - halfWidth, baseY + postHeight / 2, pz, 0.11, postHeight, 0.11);
  }
  const barY = [baseY + 0.42, baseY + 0.93];
  barY.forEach((py) => {
    add(x, py, z - halfDepth, width + 0.08, 0.11, 0.11);
    add(x, py, z + halfDepth, width + 0.08, 0.11, 0.11);
    add(x - halfWidth, py, z, 0.11, 0.11, depth + 0.08);
  });
  rails.count = count;
  rails.instanceMatrix.needsUpdate = true;
  rails.castShadow = false;
  rails.receiveShadow = false;
  group.add(rails);

  colliders.push(
    {
      minX: x - halfWidth - 0.08,
      maxX: x - halfWidth + 0.08,
      minZ: z - halfDepth,
      maxZ: z + halfDepth,
      minY: baseY,
      maxY: baseY + 1.02,
    },
    {
      minX: x - halfWidth,
      maxX: x + halfWidth,
      minZ: z - halfDepth - 0.08,
      maxZ: z - halfDepth + 0.08,
      minY: baseY,
      maxY: baseY + 1.02,
    },
    {
      minX: x - halfWidth,
      maxX: x + halfWidth,
      minZ: z + halfDepth - 0.08,
      maxZ: z + halfDepth + 0.08,
      minY: baseY,
      maxY: baseY + 1.02,
    },
  );
}

export function addTowerWindows(
  group: THREE.Group,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  material: THREE.MeshStandardMaterial,
): void {
  const geometry = new THREE.BoxGeometry(1.25, 1.45, 0.14);
  const windows = new THREE.InstancedMesh(geometry, material, 96);
  const marker = new THREE.Object3D();
  let count = 0;
  const levels = Math.min(7, Math.max(3, Math.floor(height / 5.5)));
  const add = (px: number, py: number, pz: number, rotation: number): void => {
    marker.position.set(px, py, pz);
    marker.rotation.set(0, rotation, 0);
    marker.updateMatrix();
    windows.setMatrixAt(count, marker.matrix);
    count += 1;
  };

  for (let level = 0; level < levels; level += 1) {
    const y = 4.2 + level * ((height - 7) / levels);
    for (const offset of [-3.2, 0, 3.2]) {
      add(x + offset, y, z + depth / 2 + 0.08, 0);
      add(x + offset, y, z - depth / 2 - 0.08, Math.PI);
      add(x + width / 2 + 0.08, y, z + offset, Math.PI / 2);
      add(x - width / 2 - 0.08, y, z + offset, -Math.PI / 2);
    }
  }
  windows.count = count;
  windows.instanceMatrix.needsUpdate = true;
  windows.castShadow = false;
  windows.receiveShadow = false;
  group.add(windows);
}