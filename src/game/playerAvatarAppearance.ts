import * as THREE from 'three';
import type { AvatarAppearance } from '@/game/progression';
import type { AvatarEmote } from '@/game/worldTypes';
import type { AvatarParts } from '@/game/playerAvatarTypes';

const ARM_DOWN = new THREE.Vector3(0, -1, 0);
const THINKING_HAND = new THREE.Vector3(-0.65, 0.58, 0.49).normalize();
const CRY_LEFT_HAND = new THREE.Vector3(0.42, 0.73, 0.47).normalize();
const CRY_RIGHT_HAND = new THREE.Vector3(-0.42, 0.73, 0.47).normalize();

export function applyAvatarAppearance(avatar: THREE.Group, appearance: AvatarAppearance): void {
  const parts = avatar.userData.parts as AvatarParts;
  const outfits: Record<string, { shirt: string; pants: string }> = {
    jax: { shirt: '#a55bdd', pants: '#7e3eb2' },
    pomni: { shirt: '#d7374a', pants: '#315dcc' },
    ringmaster: { shirt: '#b92932', pants: '#76222a' },
    verity: { shirt: '#f1cb36', pants: '#e5b82d' },
  };
  const colors = outfits[appearance.outfit];
  const shirtColor = colors?.shirt ?? appearance.topColor;
  const pantsColor = colors?.pants ?? appearance.bottomColor;
  parts.shirt.forEach((material) => (material as THREE.MeshStandardMaterial).color.set(shirtColor));
  parts.pants.forEach((material) => (material as THREE.MeshStandardMaterial).color.set(pantsColor));
  (parts.headMaterial as THREE.MeshStandardMaterial).color.set(
    appearance.outfit === 'verity' ? '#f1cb36' : '#d6a887',
  );
  parts.hair.visible = appearance.outfit !== 'verity';
  parts.defaultFace.visible = appearance.outfit !== 'verity';
  parts.smileyFace.visible = appearance.outfit === 'verity';
  parts.jaxDetails.visible = appearance.outfit === 'jax';
  parts.pomniDetails.visible = appearance.outfit === 'pomni';
  parts.ringmasterDetails.visible = appearance.outfit === 'ringmaster';
  Object.entries(parts.accessories).forEach(([name, group]) => {
    group.visible = appearance.accessory === name;
  });
}

export function triggerAvatarEmote(avatar: THREE.Group, emote: AvatarEmote): void {
  avatar.userData.activeEmote = { name: emote, elapsed: 0 };
}

export function updatePlayerAvatar(
  avatar: THREE.Group,
  delta: number,
  walking: boolean,
  airborne: boolean,
): void {
  const parts = avatar.userData.parts as AvatarParts;
  const elapsed = (Number(avatar.userData.elapsed) || 0) + delta;
  avatar.userData.elapsed = elapsed;
  const swing = walking ? Math.sin(elapsed * 9) * 0.52 : 0;
  parts.legs.forEach((leg, index) => {
    leg.rotation.x = airborne ? -0.3 : index === 0 ? swing : -swing;
    leg.rotation.z = 0;
  });
  parts.arms.forEach((arm, index) => {
    arm.rotation.x = airborne ? 0.45 : index === 0 ? -swing * 0.72 : swing * 0.72;
    arm.rotation.z = 0;
  });

  avatar.rotation.z = 0;
  parts.headGroup.rotation.set(0, 0, 0);
  parts.questionMarks.visible = false;
  parts.sleepyZs.visible = false;
  parts.sleepyZs.position.y = 2.34;
  parts.tears.forEach((tear) => { tear.visible = false; });
  const active = avatar.userData.activeEmote as { name: AvatarEmote; elapsed: number } | null;
  if (!active) return;
  active.elapsed += delta;
  const duration = active.name === 'spin' ? 1.8 : active.name === 'sleepy' ? 4.6 : 3.2;
  const progress = Math.min(1, active.elapsed / duration);
  if (progress >= 1) {
    avatar.userData.activeEmote = null;
    return;
  }

  if (active.name === 'joy') {
    avatar.position.y += Math.abs(Math.sin(progress * Math.PI * 3)) * 0.55;
    parts.arms.forEach((arm) => { arm.rotation.x = -2.45; });
  } else if (active.name === 'cry') {
    avatar.rotation.z = 0.08 + Math.sin(active.elapsed * 7) * 0.035;
    parts.headGroup.rotation.x = 0.38;
    parts.arms[0]?.quaternion.setFromUnitVectors(ARM_DOWN, CRY_LEFT_HAND);
    parts.arms[1]?.quaternion.setFromUnitVectors(ARM_DOWN, CRY_RIGHT_HAND);
    parts.tears.forEach((tear, index) => {
      const tearPhase = (active.elapsed * 1.8 + index * 0.5) % 1;
      tear.position.y = -0.035 - tearPhase * 0.24;
      tear.visible = active.elapsed > 0.08;
    });
  } else if (active.name === 'think') {
    parts.headGroup.rotation.y = 0.48;
    parts.headGroup.rotation.x = 0.08;
    parts.arms[1]?.quaternion.setFromUnitVectors(ARM_DOWN, THINKING_HAND);
    parts.questionMarks.visible = true;
    parts.questionMarks.scale.setScalar(0.94 + Math.sin(active.elapsed * 4.5) * 0.06);
  } else if (active.name === 'sleepy') {
    const settle = THREE.MathUtils.smoothstep(active.elapsed, 0.08, 0.42);
    avatar.rotation.z = -Math.PI / 2 * settle;
    avatar.position.y += 0.36 * settle;
    parts.headGroup.rotation.x = 0.08;
    parts.sleepyZs.visible = active.elapsed > 0.34;
    parts.sleepyZs.position.y = 2.34 + Math.sin(active.elapsed * 2.4) * 0.07;
  } else {
    avatar.rotation.y += Math.PI * 2 * progress;
    parts.arms.forEach((arm) => { arm.rotation.x = -0.65; });
  }
}