import * as THREE from 'three';
import { createPaintWall } from '@/game/architectureWalls';
import type { Collider, PaintWall } from '@/game/worldTypes';

interface RoundedTunnel {
  walls: PaintWall[];
  colliders: Collider[];
}

export function addTunnel(
  group: THREE.Group,
  centerX: number,
  centerZ: number,
  alongX: boolean,
  wallMaterial: THREE.MeshStandardMaterial,
): RoundedTunnel {
  const walls: PaintWall[] = [];
  const colliders: Collider[] = [];
  const length = 14;
  const supportOffset = 5;
  const supportThickness = 1.4;
  const springHeight = 4.3;
  const supports = alongX
    ? [
      createPaintWall(
        group,
        centerX,
        centerZ - supportOffset,
        length,
        springHeight,
        supportThickness,
        wallMaterial,
      ),
      createPaintWall(
        group,
        centerX,
        centerZ + supportOffset,
        length,
        springHeight,
        supportThickness,
        wallMaterial,
      ),
    ]
    : [
      createPaintWall(
        group,
        centerX - supportOffset,
        centerZ,
        supportThickness,
        springHeight,
        length,
        wallMaterial,
      ),
      createPaintWall(
        group,
        centerX + supportOffset,
        centerZ,
        supportThickness,
        springHeight,
        length,
        wallMaterial,
      ),
    ];
  supports.forEach(({ wall, collider }) => {
    walls.push(wall);
    colliders.push(collider);
  });

  const segments = 8;
  const innerRadius = 4.3;
  const ringRadius = innerRadius + supportThickness / 2;
  const angleMargin = 0.24;
  const angleStep = (Math.PI - angleMargin * 2) / segments;
  const lateral = alongX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const axis = alongX ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, 1);

  for (let index = 0; index < segments; index += 1) {
    const angle = angleMargin + (index + 0.5) * angleStep;
    const radial = new THREE.Vector3(
      lateral.x * Math.cos(angle),
      Math.sin(angle),
      lateral.z * Math.cos(angle),
    );
    const tangent = new THREE.Vector3(
      -lateral.x * Math.sin(angle),
      Math.cos(angle),
      -lateral.z * Math.sin(angle),
    );
    const wall = createPaintWall(
      group,
      centerX,
      centerZ,
      supportThickness,
      ringRadius * angleStep + 0.08,
      length,
      wallMaterial,
    ).wall;
    wall.mesh.position.set(
      centerX + lateral.x * Math.cos(angle) * ringRadius,
      springHeight + Math.sin(angle) * ringRadius,
      centerZ + lateral.z * Math.cos(angle) * ringRadius,
    );
    wall.mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(radial, tangent, axis),
    );
    walls.push(wall);
  }
  return { walls, colliders };
}