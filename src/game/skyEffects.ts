import * as THREE from 'three';
import type { SkyMode, WorldEngine } from '@/game/worldTypes';
import { drawSky } from '@/game/skyBackdrop';

const LIGHTING: Record<SkyMode, {
  hemisphere: string;
  ground: string;
  hemispherePower: number;
  sun: string;
  sunPower: number;
  clouds: string;
  fog: string;
  rainOpacity: number;
}> = {
  day: {
    hemisphere: '#d8f2ff', ground: '#635d53', hemispherePower: 2.65,
    sun: '#fff1d1', sunPower: 3.1, clouds: '#fffdf6', fog: '#b2bab5', rainOpacity: 0,
  },
  sunset: {
    hemisphere: '#ffc19a', ground: '#65484a', hemispherePower: 2.2,
    sun: '#ff6944', sunPower: 3.2, clouds: '#ffe0cf', fog: '#c08a71', rainOpacity: 0,
  },
  pastel: {
    hemisphere: '#f2d4f4', ground: '#675a70', hemispherePower: 2.5,
    sun: '#ffc9a8', sunPower: 2.7, clouds: '#f9f3ff', fog: '#c2aaba', rainOpacity: 0,
  },
  night: {
    hemisphere: '#91a9d1', ground: '#171a28', hemispherePower: 0.76,
    sun: '#a6c2ef', sunPower: 0.32, clouds: '#7b87a6', fog: '#111b2c', rainOpacity: 0,
  },
  rain: {
    hemisphere: '#b8cbd6', ground: '#414e58', hemispherePower: 1.7,
    sun: '#a8c2d3', sunPower: 0.9, clouds: '#b6c2c7', fog: '#788186', rainOpacity: 0.72,
  },
};

export function applySkyLighting(world: WorldEngine, mode: SkyMode): void {
  const lighting = LIGHTING[mode];
  drawSky(world.skyCanvas, mode);
  world.skyTexture.needsUpdate = true;
  world.hemisphereLight.color.set(lighting.hemisphere);
  world.hemisphereLight.groundColor.set(lighting.ground);
  world.hemisphereLight.intensity = lighting.hemispherePower;
  world.sunLight.color.set(lighting.sun);
  world.sunLight.intensity = lighting.sunPower;
  world.cloudMesh.material.color.set(lighting.clouds);
  world.cloudGroup.visible = mode !== 'night';
  world.rain.visible = mode === 'rain';
  world.rain.material.opacity = lighting.rainOpacity;
  if (world.scene.fog instanceof THREE.FogExp2) world.scene.fog.color.set(lighting.fog);
}

export function advanceWeather(world: WorldEngine, delta: number): void {
  world.cloudGroup.position.set(world.playerPosition.x, 0, world.playerPosition.z);
  world.cloudGroup.rotation.y += delta * 0.0015;
  if (!world.rain.visible) return;
  world.rain.position.set(world.playerPosition.x, 0, world.playerPosition.z);
  const position = world.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
  const positions = position.array as Float32Array;
  for (let index = 0; index < world.rainSpeeds.length; index += 1) {
    const offset = index * 6;
    const fall = world.rainSpeeds[index] * delta;
    positions[offset + 1] -= fall;
    positions[offset + 4] -= fall;
    if (positions[offset + 1] < -0.1) {
      const x = ((index * 37) % 200) / 10 - 10;
      const z = ((index * 61) % 200) / 10 - 10;
      const y = 14 + (index % 7) * 0.55;
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      positions[offset + 3] = x - 0.09;
      positions[offset + 4] = y - 0.78;
      positions[offset + 5] = z + 0.12;
    }
  }
  position.needsUpdate = true;
}