import * as THREE from 'three';
import type { Collider, WorldEngine } from '@/game/worldTypes';

export const EYE_HEIGHT = 1.72;
const PLAYER_RADIUS = 0.48;
const PLAYER_HEIGHT = 1.68;

export function getGroundHeight(world: WorldEngine, x: number, z: number): number {
  let height = world.groundLevel;
  const playerFeet = world.playerPosition.y - EYE_HEIGHT;
  for (const surface of world.walkSurfaces) {
    if (surface.height > playerFeet + 0.7) continue;
    if (x >= surface.minX && x <= surface.maxX && z >= surface.minZ && z <= surface.maxZ) {
      height = Math.max(height, surface.height);
    }
  }
  for (const stairs of world.staircases) {
    if (x < stairs.minX || x > stairs.maxX || z < stairs.minZ || z > stairs.maxZ) continue;
    const progress = THREE.MathUtils.clamp(
      (stairs.startZ - z) / (stairs.startZ - stairs.endZ),
      0,
      1,
    );
    const step = Math.min(stairs.steps, Math.floor(progress * stairs.steps));
    const stairHeight = stairs.baseY + (stairs.topY - stairs.baseY) * step / stairs.steps;
    if (stairHeight > playerFeet + 0.7) continue;
    height = Math.max(height, stairHeight);
  }
  return height;
}

function isBlocked(x: number, z: number, feetY: number, colliders: Collider[]): boolean {
  for (const box of colliders) {
    const overlapsXZ =
      x + PLAYER_RADIUS > box.minX && x - PLAYER_RADIUS < box.maxX &&
      z + PLAYER_RADIUS > box.minZ && z - PLAYER_RADIUS < box.maxZ;
    const overlapsY = feetY < box.maxY - 0.045 && feetY + PLAYER_HEIGHT > box.minY + 0.045;
    if (overlapsXZ && overlapsY) return true;
  }
  return false;
}

export function jumpWorld(world: WorldEngine, power: number): void {
  if (world.equippedOutfit === 'jax' || world.equippedOutfit === 'ringmaster') {
    world.abilityActive = !world.abilityActive;
    world.velocityY = 0;
    return;
  }
  const floor = getGroundHeight(world, world.playerPosition.x, world.playerPosition.z);
  if (world.playerPosition.y > floor + EYE_HEIGHT + 0.04) return;
  world.velocityY = power * (world.equippedOutfit === 'pomni' ? 1.85 : 1);
}

export function movePlayer(world: WorldEngine, x: number, z: number): void {
  const currentFloor = getGroundHeight(world, world.playerPosition.x, world.playerPosition.z);
  const nextFloor = getGroundHeight(world, x, z);
  const grounded = world.velocityY <= 0 && world.playerPosition.y <= currentFloor + EYE_HEIGHT + 0.06;
  if (grounded && nextFloor - currentFloor > 0.42) return;
  const feetY = grounded ? nextFloor : world.playerPosition.y - EYE_HEIGHT;
  if (isBlocked(x, z, feetY, world.colliders)) return;
  world.playerPosition.x = x;
  world.playerPosition.z = z;
  if (!grounded) return;
  world.playerPosition.y = nextFloor + EYE_HEIGHT;
  world.velocityY = 0;
}