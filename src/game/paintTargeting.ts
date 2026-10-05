import * as THREE from 'three';
import type { Collider } from '@/game/worldTypes';

export const PAINT_REACH = 8;
const TARGET_SURFACE_EPSILON = 0.12;
const colliderBounds = new THREE.Box3();
const colliderHit = new THREE.Vector3();

/** A ray hit is paintable only when it is within player reach and no collider
 * clearly lies in front of it. The small tolerance allows a paintable wall's
 * collider and painted mesh to describe the same physical boundary. */
export function isPaintTargetReachable(
  ray: THREE.Ray,
  hitPoint: THREE.Vector3,
  hitDistance: number,
  playerPosition: THREE.Vector3,
  colliders: readonly Collider[],
  reach = PAINT_REACH,
): boolean {
  if (playerPosition.distanceTo(hitPoint) > reach) return false;

  for (const collider of colliders) {
    colliderBounds.min.set(collider.minX, collider.minY, collider.minZ);
    colliderBounds.max.set(collider.maxX, collider.maxY, collider.maxZ);
    const intersection = ray.intersectBox(colliderBounds, colliderHit);
    if (!intersection) continue;
    const distance = ray.origin.distanceTo(intersection);
    if (distance < hitDistance - TARGET_SURFACE_EPSILON) return false;
  }
  return true;
}
