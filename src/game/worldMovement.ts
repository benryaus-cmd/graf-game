import type { LiveSettings, WorldEngine } from '@/game/worldTypes';
import { updateBunnyCompanion } from '@/game/bunnyMovement';
import { updatePlayerAvatar } from '@/game/playerAvatarAppearance';
import { EYE_HEIGHT, getGroundHeight, jumpWorld as physicsJumpWorld, movePlayer } from '@/game/playerPhysics';
import { advanceCityBots } from '@/game/cityBots';

export { getGroundHeight };

export function jumpWorld(world: WorldEngine, power: number): void {
  if (!world.activityLocked) physicsJumpWorld(world, power);
}

function updateCameras(world: WorldEngine): void {
  const position = world.playerPosition;
  if (world.cameraMode === 'first') {
    world.playerAvatar.visible = false;
    world.camera.position.copy(position);
    world.camera.rotation.order = 'YXZ';
    world.camera.rotation.set(world.playerPitch, world.playerYaw, 0);
  } else {
    world.playerAvatar.visible = true;
    // Closer over-the-shoulder third-person framing; movement and collision stay unchanged.
    const distance = 2.8;
    world.camera.position.set(
      position.x + Math.sin(world.playerYaw) * distance,
      position.y + 1.1 - Math.sin(world.playerPitch) * distance,
      position.z + Math.cos(world.playerYaw) * distance,
    );
    // Aim above the player to frame their avatar in the lower half of the screen.
    world.camera.lookAt(position.x, position.y + 0.25, position.z);
  }
  world.mapCamera.position.set(position.x, position.y + 48, position.z);
  world.mapCamera.lookAt(position.x, position.y - EYE_HEIGHT, position.z);
  world.skyDome.position.copy(world.cameraMode === 'map' ? world.mapCamera.position : world.camera.position);
}

export function advanceWorld(
  world: WorldEngine,
  delta: number,
  settings: LiveSettings,
  keys: Set<string>,
): void {
  if (world.activityLocked) return;
  let forward = settings.movement.y + Number(keys.has('KeyW') || keys.has('ArrowUp'));
  forward -= Number(keys.has('KeyS') || keys.has('ArrowDown'));
  let side = settings.movement.x + Number(keys.has('KeyD') || keys.has('ArrowRight'));
  side -= Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  if (settings.paused) { keys.clear(); forward = 0; side = 0; }
  const magnitude = Math.hypot(forward, side);
  if (magnitude > 1) {
    forward /= magnitude;
    side /= magnitude;
  }

  const yaw = world.playerYaw;
  const distance = settings.moveSpeed * delta;
  const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * distance;
  const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * distance;
  movePlayer(world, world.playerPosition.x + dx, world.playerPosition.z);
  movePlayer(world, world.playerPosition.x, world.playerPosition.z + dz);
  world.updateChunks(world.playerPosition.x, world.playerPosition.z);
  const floor = getGroundHeight(world, world.playerPosition.x, world.playerPosition.z);

  if (world.equippedOutfit === 'jax' && world.abilityActive) {
    world.playerPosition.y = Math.min(world.playerPosition.y + delta * 2.3, floor + EYE_HEIGHT + 14);
    world.velocityY = 0;
  } else if (world.equippedOutfit === 'ringmaster' && world.abilityActive) {
    const hoverHeight = floor + EYE_HEIGHT + 2.4;
    world.playerPosition.y += (hoverHeight - world.playerPosition.y) * Math.min(1, delta * 3.2);
    world.velocityY = 0;
  } else {
    world.velocityY -= 18 * delta;
    world.playerPosition.y += world.velocityY * delta;
    if (world.playerPosition.y < floor + EYE_HEIGHT) {
      world.playerPosition.y = floor + EYE_HEIGHT;
      world.velocityY = 0;
    }
  }

  world.playerAvatar.position.set(
    world.playerPosition.x,
    world.playerPosition.y - EYE_HEIGHT,
    world.playerPosition.z,
  );
  world.playerAvatar.rotation.y = world.playerYaw + Math.PI;
  const airborne = world.abilityActive || Math.abs(world.velocityY) > 0.1 || world.playerPosition.y > floor + EYE_HEIGHT + 0.04;
  updatePlayerAvatar(world.playerAvatar, delta, magnitude > 0.08, airborne);
  updateBunnyCompanion(world.bunnyGroup, world.playerPosition, world.playerYaw, delta, magnitude > 0.08);
  advanceCityBots(world, delta);
  updateCameras(world);
}
