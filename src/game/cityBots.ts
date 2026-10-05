import * as THREE from 'three';
import type { CityBot, WorldEngine } from '@/game/worldTypes';
import { getGroundHeight } from '@/game/playerPhysics';
import { paintBotWallMotif } from '@/game/botWallArt';

const BOT_COLORS = [
  '#f05b9d', '#39a8f2', '#ffb638', '#46d38b', '#8758df', '#ff733e', '#37c9c8',
  '#cf55d6', '#b6e34e', '#ff4d43', '#e96d47', '#4fc4a6', '#e9c64a', '#7993ef',
  '#e887bd', '#8bc74e', '#56b8d5', '#d9674f', '#aa75d1', '#f39c43',
];
const AIM_DIRECTIONS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0.5, -1.2, 0.5).normalize(),
  new THREE.Vector3(-0.5, -1.2, -0.5).normalize(),
];
const BOT_RAY_ORIGIN = new THREE.Vector3();
const ARTWORK_NORMAL = new THREE.Vector3();
const ARTWORK_NORMAL_MATRIX = new THREE.Matrix3();

export function createCityBots(scene: THREE.Scene): CityBot[] {
  const bodyGeometry = new THREE.CapsuleGeometry(0.23, 0.42, 4, 8);
  const headGeometry = new THREE.SphereGeometry(0.24, 12, 10);
  const legGeometry = new THREE.CapsuleGeometry(0.07, 0.32, 3, 6);
  const eyeGeometry = new THREE.SphereGeometry(0.025, 6, 5);
  return BOT_COLORS.map((color, index) => {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.84 });
    const faceMaterial = new THREE.MeshStandardMaterial({ color: '#18201f', roughness: 0.8 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.92;
    group.add(body);
    const head = new THREE.Mesh(headGeometry, new THREE.MeshStandardMaterial({ color: '#e2bb9a', roughness: 0.86 }));
    head.position.y = 1.56;
    group.add(head);
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(eyeGeometry, faceMaterial);
      eye.position.set(side * 0.075, 1.59, 0.22);
      group.add(eye);
    });
    const legs = [-1, 1].map((side) => {
      const leg = new THREE.Mesh(legGeometry, bodyMaterial);
      leg.position.set(side * 0.12, 0.35, 0);
      group.add(leg);
      return leg;
    });
    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: '#d9d4c8', metalness: 0.32, roughness: 0.5 }),
    );
    can.position.set(0.31, 0.96, 0.12);
    can.rotation.z = -0.3;
    group.add(can);
    group.visible = false;
    group.position.set((index % 10 - 4.5) * 4.2, 0, index < 10 ? -2.6 : 2.6);
    scene.add(group);
    return {
      group,
      body,
      legs,
      index,
      phase: index * 0.73,
      paintTimer: 0.8 + (index % 4) * 0.45,
      paintColor: color,
      targetPosition: new THREE.Vector3(group.position.x, 0, group.position.z),
      wanderTimer: 0,
    };
  });
}

function blockedByBuilding(world: WorldEngine, x: number, z: number, floor: number): boolean {
  return world.colliders.some((box) =>
    x > box.minX - 0.25 && x < box.maxX + 0.25 && z > box.minZ - 0.25 && z < box.maxZ + 0.25 &&
    floor < box.maxY - 0.05 && floor + 1.65 > box.minY + 0.05,
  );
}

function chooseWanderTarget(world: WorldEngine, bot: CityBot, recenter: boolean): void {
  const originX = recenter ? world.playerPosition.x : bot.group.position.x;
  const originZ = recenter ? world.playerPosition.z : bot.group.position.z;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = recenter ? 8 + Math.random() * 13 : 3 + Math.random() * 10;
    const x = originX + Math.cos(angle) * radius;
    const z = originZ + Math.sin(angle) * radius;
    const floor = getGroundHeight(world, x, z);
    if (!blockedByBuilding(world, x, z, floor)) {
      bot.targetPosition.set(x, floor, z);
      bot.wanderTimer = 1.6 + Math.random() * 2.8;
      return;
    }
  }
  bot.targetPosition.set(bot.group.position.x, bot.group.position.y, bot.group.position.z);
  bot.wanderTimer = 0.7;
}

function paintNearbyWall(world: WorldEngine, bot: CityBot, time: number): void {
  const meshes = world.walls.map((wall) => wall.mesh);
  const origin = bot.group.position;
  BOT_RAY_ORIGIN.set(origin.x, origin.y + 1.3, origin.z);
  const start = (bot.index + Math.floor(time / 2)) % AIM_DIRECTIONS.length;
  for (let offset = 0; offset < AIM_DIRECTIONS.length; offset += 1) {
    const direction = AIM_DIRECTIONS[(start + offset) % AIM_DIRECTIONS.length];
    world.botRaycaster.set(BOT_RAY_ORIGIN, direction);
    const hit = world.botRaycaster.intersectObjects(meshes, false)[0];
    if (!hit || hit.distance > 7 || !hit.face || !hit.uv) continue;
    ARTWORK_NORMAL_MATRIX.getNormalMatrix(hit.object.matrixWorld);
    ARTWORK_NORMAL.copy(hit.face.normal).applyMatrix3(ARTWORK_NORMAL_MATRIX);
    if (Math.abs(ARTWORK_NORMAL.y) > 0.42) continue;
    const wall = world.walls.find((surface) => surface.mesh === hit.object);
    if (wall) paintBotWallMotif(wall, hit, bot.paintColor, bot.index, time);
    return;
  }
}

export function paintArtworkNearBot(world: WorldEngine, botIndex: number, image: HTMLImageElement): boolean {
  const bot = world.bots[botIndex];
  if (!bot || !bot.group.visible || !image.complete || !image.naturalWidth) return false;
  const meshes = world.walls.map((wall) => wall.mesh);
  BOT_RAY_ORIGIN.set(bot.group.position.x, bot.group.position.y + 1.3, bot.group.position.z);
  for (let offset = 0; offset < AIM_DIRECTIONS.length; offset += 1) {
    const direction = AIM_DIRECTIONS[(bot.index + offset) % AIM_DIRECTIONS.length];
    world.botRaycaster.set(BOT_RAY_ORIGIN, direction);
    const hits = world.botRaycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      if (hit.distance > 7) break;
      if (!hit.face || !hit.uv) continue;
      ARTWORK_NORMAL_MATRIX.getNormalMatrix(hit.object.matrixWorld);
      ARTWORK_NORMAL.copy(hit.face.normal).applyMatrix3(ARTWORK_NORMAL_MATRIX);
      if (Math.abs(ARTWORK_NORMAL.y) > 0.42) continue;
      const wall = world.walls.find((surface) => surface.mesh === hit.object);
      if (!wall) continue;
      const face = Number.isFinite(hit.face.materialIndex) ? hit.face.materialIndex : 0;
      while (wall.layers.length === 0) wall.createLayer();
      const layer = wall.layers[0];
      const context = layer?.ensureFace(face);
      if (!layer || !context) continue;
      const uvScale = wall.uvScales[face] ?? { u: 1, v: 1 };
      const dimensions = wall.faceDimensions[face] ?? { width: 1, height: 1 };
      const xScale = context.canvas.width / Math.max(0.01, dimensions.width);
      const yScale = context.canvas.height / Math.max(0.01, dimensions.height);
      const imageSize = Math.min(2.2, dimensions.width * 0.64, dimensions.height * 0.58);
      if (imageSize < 0.2) continue;
      const x = THREE.MathUtils.clamp(hit.uv.x / uvScale.u, 0, 1) * context.canvas.width;
      const y = (1 - THREE.MathUtils.clamp(hit.uv.y / uvScale.v, 0, 1)) * context.canvas.height;
      const worldX = THREE.MathUtils.clamp(x / xScale, imageSize / 2, dimensions.width - imageSize / 2);
      const worldY = THREE.MathUtils.clamp(y / yScale, imageSize / 2, dimensions.height - imageSize / 2);
      context.save();
      context.setTransform(xScale, 0, 0, yScale, 0, 0);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.drawImage(image, worldX - imageSize / 2, worldY - imageSize / 2, imageSize, imageSize);
      context.restore();
      layer.textures[face].needsUpdate = true;
      wall.dirty = true;
      return true;
    }
  }
  return false;
}

export function advanceCityBots(world: WorldEngine, delta: number): void {
  const time = performance.now() / 1000;
  world.bots.forEach((bot) => {
    bot.group.visible = world.botsEnabled;
    if (!world.botsEnabled) return;
    const position = bot.group.position;
    const playerDistance = Math.hypot(position.x - world.playerPosition.x, position.z - world.playerPosition.z);
    const targetDistance = Math.hypot(
      bot.targetPosition.x - world.playerPosition.x,
      bot.targetPosition.z - world.playerPosition.z,
    );
    const distance = Math.hypot(bot.targetPosition.x - position.x, bot.targetPosition.z - position.z);
    bot.wanderTimer -= delta;
    if (bot.wanderTimer <= 0 || distance < 0.72 || (playerDistance > 34 && targetDistance > 30)) {
      chooseWanderTarget(world, bot, playerDistance > 34);
    }
    const dx = bot.targetPosition.x - position.x;
    const dz = bot.targetPosition.z - position.z;
    const remaining = Math.hypot(dx, dz);
    if (remaining > 0.02) {
      const step = Math.min((0.95 + (bot.index % 4) * 0.18) * delta, remaining);
      const x = position.x + dx / remaining * step;
      const z = position.z + dz / remaining * step;
      const floor = getGroundHeight(world, x, z);
      if (!blockedByBuilding(world, x, z, floor)) {
        position.set(x, floor, z);
        bot.group.rotation.y = Math.atan2(dx, dz);
      } else {
        bot.wanderTimer = 0;
      }
    }
    bot.body.rotation.z = Math.sin(time * 4 + bot.phase) * 0.045;
    bot.legs[0].rotation.x = Math.sin(time * 8 + bot.phase) * 0.42;
    bot.legs[1].rotation.x = -bot.legs[0].rotation.x;
    bot.paintTimer -= delta;
    if (bot.paintTimer <= 0) {
      bot.paintTimer = 1.5 + (bot.index % 5) * 0.42;
      paintNearbyWall(world, bot, time);
    }
  });
}