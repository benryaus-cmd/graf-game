import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { isPaintTargetReachable, PAINT_REACH } from '../src/game/paintTargeting';
import type { Collider } from '../src/game/worldTypes';

const ray = new THREE.Ray(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -1));
const player = new THREE.Vector3(0, 1.6, 0);
const box = (minZ: number, maxZ: number): Collider => ({
  minX: -1, maxX: 1, minY: 0, maxY: 3, minZ, maxZ,
});

test('paint reach is eight metres from the player, independent of camera ray origin', () => {
  assert.equal(PAINT_REACH, 8);
  assert.equal(isPaintTargetReachable(ray, new THREE.Vector3(0, 1.6, -7.99), 7.99, player, []), true);
  assert.equal(isPaintTargetReachable(ray, new THREE.Vector3(0, 1.6, -8.01), 8.01, player, []), false);
  // Map view camera may be far above the player; only player-to-hit range applies.
  const mapRay = new THREE.Ray(new THREE.Vector3(0, 30, 0), new THREE.Vector3(0, -1, 0));
  assert.equal(isPaintTargetReachable(mapRay, new THREE.Vector3(0, 1.6, 0), 28.4, player, []), true);
});

test('a nearer solid collider blocks painting, while the target wall boundary does not', () => {
  const targetPoint = new THREE.Vector3(0, 1.6, -4);
  assert.equal(isPaintTargetReachable(ray, targetPoint, 4, player, [box(-2.1, -1.9)]), false);
  assert.equal(isPaintTargetReachable(ray, targetPoint, 4, player, [box(-4.1, -3.9)]), true);
});
