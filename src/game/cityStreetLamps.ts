import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider } from '@/game/worldTypes';

export function addConcreteStreetLamp(
  group: THREE.Group,
  x: number,
  z: number,
  colliders: Collider[],
): void {
  const concrete = new THREE.MeshStandardMaterial({ color: '#8d8a80', roughness: 0.96 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.62), concrete);
  base.position.set(x, 0.15, z);


  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 5.55, 9), concrete);
  pole.position.set(x, 2.95, z);


  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.12, 8), concrete);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(x + 0.48, 5.62, z);


  const shade = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.5), concrete);
  shade.position.set(x + 0.86, 5.64, z);
  const parts=[base,pole,arm,shade];
  const geometries=parts.map(mesh=>{mesh.updateMatrix();mesh.geometry.applyMatrix4(mesh.matrix);mesh.geometry.clearGroups();return mesh.geometry;});
  const merged=mergeGeometries(geometries,false)!;geometries.forEach(geometry=>geometry.dispose());
  group.add(new THREE.Mesh(merged,concrete));

  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: '#fff1c4',
    emissive: '#ffc86f',
    emissiveIntensity: 2.8,
    roughness: 0.35,
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), bulbMaterial);
  bulb.position.set(x + 0.82, 5.46, z);
  group.add(bulb);

  group.userData.lampAnchors ??= [];
  group.userData.lampAnchors.push({position:new THREE.Vector3(x+.82,5.35,z),bulbMaterial});

  colliders.push({
    minX: x - 0.34,
    maxX: x + 0.34,
    minZ: z - 0.34,
    maxZ: z + 0.34,
    minY: 0,
    maxY: 5.9,
  });
}