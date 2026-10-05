import * as THREE from 'three';
import { drawSky } from '@/game/skyBackdrop';

export function createSkyDome(): {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  cloudGroup: THREE.Group;
  cloudMesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  rainSpeeds: Float32Array;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  drawSky(canvas, 'day');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const skyMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 20), skyMaterial);
  mesh.renderOrder = -1;
  const cloudGroup = new THREE.Group();
  const cloudGeometry = new THREE.SphereGeometry(1, 10, 8);
  const cloudMaterial = new THREE.MeshLambertMaterial({
    color: '#fffdf6',
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const cloudMesh = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 64);
  const puff = new THREE.Object3D();
  for (let index = 0; index < 64; index += 1) {
    const cluster = Math.floor(index / 4);
    const piece = index % 4;
    const angle = cluster * (Math.PI * 2 / 16);
    const distance = 48 + (cluster % 4) * 11;
    const offset = piece - 1.5;
    puff.position.set(
      Math.cos(angle) * distance + Math.cos(angle + 1.4) * offset * 4.2,
      31 + (cluster % 4) * 6 + (piece % 2) * 1.2,
      Math.sin(angle) * distance + Math.sin(angle + 1.4) * offset * 4.2,
    );
    const size = 6.2 + ((cluster + piece) % 4) * 1.1;
    puff.scale.set(size * 1.55, size * 0.52, size * 0.78);
    puff.rotation.y = angle;
    puff.updateMatrix();
    cloudMesh.setMatrixAt(index, puff.matrix);
  }
  cloudMesh.instanceMatrix.needsUpdate = true;
  cloudMesh.frustumCulled = false;
  cloudGroup.add(cloudMesh);
  const weather = createRain();
  return { mesh, canvas, texture, cloudGroup, cloudMesh, ...weather };
}

function createRain(): { rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>; rainSpeeds: Float32Array } {
  const dropCount = 140;
  const positions = new Float32Array(dropCount * 6);
  const rainSpeeds = new Float32Array(dropCount);
  for (let index = 0; index < dropCount; index += 1) {
    const offset = index * 6;
    const x = Math.random() * 20 - 10;
    const y = Math.random() * 19 - 1;
    const z = Math.random() * 20 - 10;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    positions[offset + 3] = x - 0.09;
    positions[offset + 4] = y - 0.78;
    positions[offset + 5] = z + 0.12;
    rainSpeeds[index] = 12 + Math.random() * 8;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: '#d6eefa',
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(geometry, material);
  rain.frustumCulled = false;
  rain.visible = false;
  return { rain, rainSpeeds };
}