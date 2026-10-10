import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourtyardPortals, COURTYARD_PORTALS, BASKETBALL_PORTAL_LANDING } from '../src/game/courtyardPortals';
import { BASKETBALL_COURT } from '../src/game/basketballCourt';
import { isInsideBuilding, QUARTER_TREES, QUARTER_LAMPS, QUARTER_SPAWN } from '../src/game/morningQuarterLayout';

test('four courtyard destinations are on paving, clear of spawn, buildings, trees and poles', () => {
  assert.deepEqual(COURTYARD_PORTALS.map(portal => portal.action), ['characters', 'basketball', 'multiplayer', 'zombies']);
  for (const portal of COURTYARD_PORTALS) {
    const [x, , z] = portal.position;
    assert.ok(Math.abs(x) + 1.7 < 12 && Math.abs(z) + 1.7 < 12);
    assert.equal(isInsideBuilding(x, z, 2), false);
    assert.ok(Math.hypot(x - QUARTER_SPAWN.x, z - QUARTER_SPAWN.z) > 3);
    for (const [obstacleX, obstacleZ] of [...QUARTER_TREES, ...QUARTER_LAMPS]) assert.ok(Math.hypot(x - obstacleX, z - obstacleZ) > 2.5);
  }
  const [x, , z] = BASKETBALL_PORTAL_LANDING;
  assert.ok(x > BASKETBALL_COURT.bounds.maxX + 1);
  assert.ok(Math.abs(z + 32) < 2);
  assert.equal(isInsideBuilding(x, z, 1), false);
});

test('walking into a portal fires once and rearms only after leaving its footprint', () => {
  const scene = new THREE.Scene(), actions: string[] = [];
  const portals = new CourtyardPortals(scene, action => actions.push(action));
  const position = new THREE.Vector3().fromArray(COURTYARD_PORTALS[0].position);
  const active = { enabled: true, solo: true };
  portals.update(position, active); portals.update(position, active);
  assert.deepEqual(actions, ['characters']);
  portals.update(new THREE.Vector3(0, 1.72, 5), active);
  portals.update(position, active);
  assert.deepEqual(actions, ['characters', 'characters']);
  position.fromArray(COURTYARD_PORTALS[1].position);
  portals.update(position, active);
  assert.equal(actions.at(-1), 'basketball');
  portals.dispose();
});

test('disabled entry cannot launch after a menu closes until the player exits', () => {
  const actions: string[] = [], portals = new CourtyardPortals(new THREE.Scene(), action => actions.push(action));
  const position = new THREE.Vector3().fromArray(COURTYARD_PORTALS[0].position);
  portals.update(position, { enabled: false, solo: true });
  portals.update(position, { enabled: true, solo: true });
  assert.deepEqual(actions, []);
  portals.update(new THREE.Vector3(0, 1.72, 5), { enabled: false, solo: true });
  portals.update(position, { enabled: true, solo: true });
  assert.deepEqual(actions, ['characters']);
  portals.dispose();
});

test('jumping above an occupied pad does not rearm it before a horizontal exit', () => {
  const actions: string[] = [], portals = new CourtyardPortals(new THREE.Scene(), action => actions.push(action));
  const position = new THREE.Vector3().fromArray(COURTYARD_PORTALS[0].position);
  const active = { enabled: true, solo: true };
  position.y = 1.72;
  portals.update(position, active);
  position.y = 4;
  portals.update(position, active);
  position.y = 1.72;
  portals.update(position, active);
  assert.deepEqual(actions, ['characters']);
  portals.dispose();
});

test('multiplayer is hidden and inactive outside solo mode and does not launch on reconnecting visibility', () => {
  const scene = new THREE.Scene(), actions: string[] = [];
  const portals = new CourtyardPortals(scene, action => actions.push(action));
  const position = new THREE.Vector3().fromArray(COURTYARD_PORTALS[2].position);
  portals.update(position, { enabled: true, solo: false });
  assert.equal(scene.getObjectByName('courtyard-portal-multiplayer')!.visible, false);
  portals.update(position, { enabled: true, solo: true });
  assert.equal(scene.getObjectByName('courtyard-portal-multiplayer')!.visible, true);
  assert.deepEqual(actions, []);
  portals.update(new THREE.Vector3(0, 1.72, 5), { enabled: true, solo: true });
  portals.update(position, { enabled: true, solo: true });
  assert.deepEqual(actions, ['multiplayer']);
  portals.dispose();
});

test('zombies portal prompts once per entry, remains visible in multiplayer, and has a label', () => {
  const scene = new THREE.Scene(), actions: string[] = [];
  const portals = new CourtyardPortals(scene, action => actions.push(action));
  const position = new THREE.Vector3().fromArray(COURTYARD_PORTALS[3].position);
  assert.equal(scene.getObjectByName('courtyard-label-zombies')!.userData.label, 'ZOMBIES');
  portals.update(position, { enabled: true, solo: true });
  portals.update(position, { enabled: true, solo: true });
  assert.deepEqual(actions, ['zombies']);
  portals.update(new THREE.Vector3(0, 1.72, 5), { enabled: true, solo: false });
  portals.update(position, { enabled: true, solo: false });
  assert.equal(scene.getObjectByName('courtyard-portal-zombies')!.visible, true);
  assert.deepEqual(actions, ['zombies', 'zombies']);
  portals.dispose();
});

test('rendering has readable labels, no lights or shadows and disposal frees resources exactly once', () => {
  const scene = new THREE.Scene(), actions: string[] = [];
  const portals = new CourtyardPortals(scene, action => actions.push(action));
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  for (const portal of COURTYARD_PORTALS) assert.equal(scene.getObjectByName(`courtyard-label-${portal.action}`)!.userData.label, portal.label);
  scene.traverse(object => {
    assert.equal(object instanceof THREE.Light, false);
    assert.equal(object.castShadow, false);
    if (object instanceof THREE.Mesh) {
      resources.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        resources.add(material);
        if (material instanceof THREE.MeshBasicMaterial && material.map) resources.add(material.map);
      }
    }
  });
  let disposals = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => { disposals++; });
  portals.dispose(); portals.dispose();
  assert.equal(disposals, resources.size);
  assert.equal(scene.children.length, 0);
  portals.update(new THREE.Vector3().fromArray(COURTYARD_PORTALS[0].position), { enabled: true, solo: true });
  assert.deepEqual(actions, []);
});
