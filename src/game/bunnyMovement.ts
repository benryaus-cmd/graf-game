import * as THREE from 'three';

export function updateBunnyCompanion(
  bunny: THREE.Group,
  playerPosition: THREE.Vector3,
  yaw: number,
  delta: number,
  playerWalking: boolean,
): void {
  let targetX = Number(bunny.userData.roamTargetX);
  let targetZ = Number(bunny.userData.roamTargetZ);
  if (playerWalking) {
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    targetX = playerPosition.x + rightX * 0.82 - forwardX * 1.05;
    targetZ = playerPosition.z + rightZ * 0.82 - forwardZ * 1.05;
    bunny.userData.roamTimer = 0.8;
  } else {
    let timer = Number(bunny.userData.roamTimer) || 0;
    timer -= delta;
    const targetDistanceFromPlayer = Math.hypot(targetX - playerPosition.x, targetZ - playerPosition.z);
    if (timer <= 0 || !Number.isFinite(targetX) || !Number.isFinite(targetZ) || targetDistanceFromPlayer > 5.5) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.2 + Math.random() * 3;
      targetX = playerPosition.x + Math.cos(angle) * radius;
      targetZ = playerPosition.z + Math.sin(angle) * radius;
      timer = 2.4 + Math.random() * 2.4;
    }
    bunny.userData.roamTimer = timer;
  }
  bunny.userData.roamTargetX = targetX;
  bunny.userData.roamTargetZ = targetZ;
  const blend = 1 - Math.exp(-(playerWalking ? 4.2 : 2.3) * delta);
  const dx = targetX - bunny.position.x;
  const dz = targetZ - bunny.position.z;
  const distance = Math.hypot(dx, dz);
  bunny.position.x += dx * blend;
  bunny.position.z += dz * blend;
  const elapsed = (Number(bunny.userData.elapsed) || 0) + delta;
  bunny.userData.elapsed = elapsed;
  bunny.position.y = playerPosition.y - 1.72 + Math.sin(elapsed * 4.2) * 0.025;
  if (distance > 0.05) bunny.rotation.y = Math.atan2(dx, dz);
  const moving = distance > 0.08;
  const legs = bunny.userData.legs as THREE.Mesh[];
  const arms = bunny.userData.arms as THREE.Mesh[];
  legs.forEach((leg, index) => {
    leg.rotation.x = moving ? Math.sin(elapsed * 8 + index * Math.PI) * 0.48 : 0;
  });
  arms.forEach((arm, index) => {
    arm.rotation.x = moving ? Math.sin(elapsed * 8 + index * Math.PI + Math.PI) * 0.36 : 0;
  });
}