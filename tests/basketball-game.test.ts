import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BasketballGame, BASKETBALL_BALL_POOL_SIZE } from '../src/game/basketballGame';
import { launchFromFlick } from '../src/game/basketballPhysics';
import { BASKETBALL_COURT } from '../src/game/basketballCourt';

function setup() {
  let now = 0;
  const world = { scene: new THREE.Scene(), playerPosition: new THREE.Vector3(-53, 0, -34.58), playerYaw: .7, playerPitch: .2, cameraMode: 'third' as 'first' | 'third' | 'map', activityLocked: false, cancelWorldInput: () => { cancellations++; } };
  let cancellations = 0;
  const game = new BasketballGame(world, () => {}, () => now);
  return { world, game, setNow: (value: number) => { now = value; game.update(now); }, cancellations: () => cancellations };
}
function resources(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let objects = 0;
  scene.traverse(object => {
    objects++;
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    }
  });
  return { geometries, materials, objects };
}
const gesture = { dx: 0, dy: .5, durationMs: 300 };

test('overlapping miss then make keeps the newest result and chronological streak when the older miss resolves', () => {
  const { game, setNow } = setup();
  const results: string[] = [];
  game.onResult = result => results.push(result.outcome);
  game.enter(2);
  game.shoot({ dx: 0, dy: .2, durationMs: 450 });
  setNow(500);
  game.shoot({ dx: 0, dy: .54, durationMs: 450 });
  for (let now = 600; now <= 3200; now += 100) setNow(now);
  assert.deepEqual(results, ['make', 'miss']);
  assert.equal(game.getSnapshot().attempts, 2);
  assert.equal(game.getSnapshot().makes, 1);
  assert.equal(game.getSnapshot().streak, 1);
  assert.equal(game.getSnapshot().recentResult?.outcome, 'make');
  game.dispose();
});

test('a swish gives a distinct restrained basket response using the same existing resources', () => {
  const response = (dy: number, swish: boolean) => {
    const { world, game, setNow } = setup();
    const before = resources(world.scene);
    let classification: boolean | undefined;
    game.onResult = result => { classification = result.swish; };
    game.enter(2);
    game.shoot({ dx: 0, dy, durationMs: 450 });
    setNow(3000);
    setNow(3050);
    assert.equal(classification, swish);
    assert.deepEqual(resources(world.scene), before);
    let color = '';
    world.scene.traverse(object => {
      if (object instanceof THREE.Mesh && object.geometry instanceof THREE.TorusGeometry) color = object.material.color.getHexString();
    });
    const netScale = world.scene.getObjectByName('basketball-net')!.scale.y;
    game.dispose();
    return { color, netScale };
  };
  const swish = response(.54, true), contactMake = response(.504, false);
  assert.notEqual(swish.color, contactMake.color);
  assert.ok(swish.netScale > contactMake.netScale);
});

test('net and basket feedback follow the enlarged canonical rim without extra render resources', () => {
  const { world, game } = setup();
  const net = world.scene.getObjectByName('basketball-net') as THREE.LineSegments;
  assert.deepEqual(net.position.toArray(), [...BASKETBALL_COURT.rim.center]);
  const positions = net.geometry.getAttribute('position');
  assert.ok(Math.abs(Math.hypot(positions.getX(0), positions.getZ(0)) - (BASKETBALL_COURT.rim.radius - BASKETBALL_COURT.rim.tubeRadius * .7)) < 1e-6);
  let ringRadius = 0;
  world.scene.traverse(object => { if(object instanceof THREE.Mesh && object.geometry instanceof THREE.TorusGeometry) ringRadius = object.geometry.parameters.radius; });
  assert.equal(ringRadius, BASKETBALL_COURT.rim.radius + BASKETBALL_COURT.rim.tubeRadius);
  game.dispose();
});

test('five shooting marks are visible floor rings in one owned line draw derived from court positions', () => {
  const { world, game } = setup();
  const marks = world.scene.getObjectByName('basketball-shooting-marks');
  assert.ok(marks instanceof THREE.LineSegments);
  const vertices = marks.geometry.getAttribute('position');
  const verticesPerMark = vertices.count / BASKETBALL_COURT.spots.length;
  assert.ok(Number.isInteger(verticesPerMark) && verticesPerMark >= 24);
  for (const [index, spot] of BASKETBALL_COURT.spots.entries()) {
    let x = 0, z = 0;
    for (let i = index * verticesPerMark; i < (index + 1) * verticesPerMark; i++) {
      x += vertices.getX(i); z += vertices.getZ(i);
      assert.ok(vertices.getY(i) > spot.position[1] && vertices.getY(i) < spot.position[1] + .04);
      assert.ok(Math.abs(Math.hypot(vertices.getX(i) - spot.position[0], vertices.getZ(i) - spot.position[2]) - .34) < .001);
    }
    assert.ok(Math.abs(x / verticesPerMark - spot.position[0]) < .001);
    assert.ok(Math.abs(z / verticesPerMark - spot.position[2]) < .001);
  }
  game.dispose();
});

test('the whole held ball projects inside the lower left viewport from every mark in landscape and portrait', () => {
  for (const aspect of [16 / 9, 9 / 16]) {
    const camera = new THREE.PerspectiveCamera(76, aspect, .1, 1200);
    const world = { scene: new THREE.Scene(), camera, playerPosition: new THREE.Vector3(), playerYaw: 0, playerPitch: 0, cameraMode: 'first' as const };
    const game = new BasketballGame(world, () => {});
    for (const spot of BASKETBALL_COURT.spots) {
      game.enter(spot.id);
      world.scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const held = world.scene.getObjectByName('basketball-held')!;
      const projected = held.position.clone().project(camera);
      assert.ok(projected.x > -.5 && projected.x < -.1, `mark ${spot.id} aspect ${aspect}: x ${projected.x}`);
      assert.ok(projected.y > -.8 && projected.y < -.2, `mark ${spot.id} aspect ${aspect}: y ${projected.y}`);
      const body = held.children[0] as THREE.Mesh<THREE.BufferGeometry>;
      const vertices = body.geometry.getAttribute('position');
      for (let i = 0; i < vertices.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(body.matrixWorld).project(camera);
        assert.ok(Math.abs(vertex.x) < .95 && Math.abs(vertex.y) < .95 && Math.abs(vertex.z) < 1, `mark ${spot.id} aspect ${aspect}: held vertex outside viewport`);
      }
    }
    game.dispose();
  }
});

test('idle court transforms remain finite before the first make and after feedback expires', () => {
  const { world, game, setNow } = setup();
  const assertFiniteTransforms = () => world.scene.traverse(object => {
    assert.ok([...object.position.toArray(), ...object.scale.toArray(), object.rotation.x, object.rotation.y, object.rotation.z].every(Number.isFinite), object.name);
  });
  setNow(100);
  assertFiniteTransforms();
  game.enter(2);
  game.shoot({ dx: 0, dy: .54, durationMs: 450 });
  setNow(1900);
  assert.equal(game.getSnapshot().makes, 1);
  setNow(1950);
  assertFiniteTransforms();
  setNow(9000);
  assertFiniteTransforms();
  assert.equal(world.scene.getObjectByName('basketball-net')!.scale.y, 1);
  game.dispose();
});

test('leaving clears live shots and feedback without late results or releasing pooled resources', () => {
  const { world, game, setNow } = setup();
  const results: string[] = [];
  game.onResult = result => results.push(result.outcome);
  game.enter(2);
  const launch = game.shoot({ dx: 0, dy: .54, durationMs: 450 })!;
  const before = resources(world.scene);
  game.leave();
  world.scene.traverse(object => {
    if (object.name.startsWith('basketball-flight-') || object instanceof THREE.Points || object instanceof THREE.Mesh && object.geometry instanceof THREE.TorusGeometry) assert.equal(object.visible, false);
  });
  setNow(4000);
  assert.deepEqual(results, []);
  assert.equal(game.getSnapshot().attempts, 1);
  assert.equal(game.getSnapshot().makes, 0);
  assert.equal(game.receiveShot(launch), false);
  assert.deepEqual(resources(world.scene), before);
  game.enter(2);
  game.shoot({ dx: 0, dy: .54, durationMs: 450 });
  setNow(5800);
  assert.equal(game.getSnapshot().makes, 1);
  game.leave();
  assert.equal(game.getSnapshot().recentResult, null);
  assert.equal(world.scene.getObjectByName('basketball-net')!.scale.y, 1);
  world.scene.traverse(object => {
    if (object instanceof THREE.Points || object instanceof THREE.Mesh && object.geometry instanceof THREE.TorusGeometry) assert.equal(object.visible, false);
  });
  setNow(9000);
  assert.deepEqual(results, ['make']);
  assert.equal(game.receiveShot({ ...launch, shotId: 'remote-after-leave' }), true);
  game.dispose();
});

test('made shots report one bucket and a miss resets the streak while all effects remain unlit', () => {
  const { world, game, setNow } = setup();
  const results: string[] = [];
  game.onResult = result => results.push(result.outcome);
  game.enter(2);
  game.shoot({ dx: 0, dy: .54, durationMs: 450 });
  setNow(1800);
  assert.equal(game.getSnapshot().makes, 1);
  assert.equal(game.getSnapshot().streak, 1);
  assert.equal(game.getSnapshot().recentResult?.outcome, 'make');
  game.shoot({ dx: 0, dy: .2, durationMs: 450 });
  setNow(4800);
  assert.equal(game.getSnapshot().makes, 1);
  assert.equal(game.getSnapshot().streak, 0);
  assert.deepEqual(results, ['make', 'miss']);
  world.scene.traverse(object => {
    assert.equal(object instanceof THREE.Light, false);
    assert.equal(object.castShadow, false);
    assert.equal(object.receiveShadow, false);
  });
  game.dispose();
});

test('basketball preserves the exploring camera, releases input and restores it after repeated entry and leave', () => {
  const { world, game, cancellations } = setup();
  const position = world.playerPosition.clone();
  const before = resources(world.scene);
  for (let i = 0; i < 30; i++) {
    assert.equal(game.enter(2), true);
    assert.equal(game.getSnapshot().active, true);
    assert.equal(world.activityLocked, true);
    assert.equal(world.cameraMode, 'first');
    assert.equal(game.enter(0), true);
    game.leave();
    assert.equal(world.activityLocked, false);
    assert.equal(world.cameraMode, 'third');
    assert.deepEqual(world.playerPosition.toArray(), position.toArray());
    assert.equal(world.playerYaw, .7);
    assert.equal(world.playerPitch, .2);
  }
  assert.ok(cancellations() >= 30);
  assert.equal(resources(world.scene).objects, before.objects);
  game.dispose();
});

test('basketball fades a shot and expires it at three absolute seconds even after a background pause', () => {
  const { world, game, setNow } = setup();
  assert.equal(game.enter(2), true);
  assert.ok(game.shoot(gesture));
  const ball = world.scene.getObjectByName('basketball-flight-0')!;
  assert.equal(ball.visible, true);
  setNow(2750);
  assert.ok(ball.userData.basketballOpacity > 0 && ball.userData.basketballOpacity < 1);
  setNow(31000);
  assert.equal(ball.visible, false);
  assert.equal(game.getSnapshot().attempts, 1);
  game.dispose();
});

test('basketball ignores local network echoes and remote scores do not affect the local score', () => {
  const { game, setNow } = setup();
  const launches: string[] = [];
  const results: string[] = [];
  game.onShot = launch => launches.push(launch.shotId);
  game.onResult = result => results.push(result.shotId);
  game.enter(2);
  const launch = game.shoot(gesture)!;
  assert.equal(game.receiveShot(launch), false);
  const remote = { ...launch, shotId: 'remote-shot' };
  assert.equal(game.receiveShot(remote), true);
  assert.equal(game.receiveShot(remote), false);
  setNow(3000);
  assert.deepEqual(launches, [launch.shotId]);
  assert.deepEqual(results, [launch.shotId]);
  assert.equal(game.getSnapshot().attempts, 1);
  game.dispose();
});

test('hundreds of overlapping shots reuse fixed scene resources and retain all local results', () => {
  const { world, game, setNow } = setup();
  game.enter(2);
  const before = resources(world.scene);
  const results = new Set<string>();
  game.onResult = result => results.add(result.shotId);
  for (let i = 0; i < 500; i++) assert.ok(game.shoot(gesture));
  const after = resources(world.scene);
  assert.equal(after.objects, before.objects);
  assert.deepEqual(after.geometries, before.geometries);
  assert.deepEqual(after.materials, before.materials);
  let visible = 0;
  world.scene.traverse(object => { if (object.name.startsWith('basketball-flight-') && object.visible) visible++; });
  assert.equal(visible, BASKETBALL_BALL_POOL_SIZE);
  setNow(3000);
  assert.equal(results.size, 500);
  assert.equal(game.getSnapshot().attempts, 500);
  game.dispose();
});

test('basketball disposal releases each owned resource once and never disposes the borrowed rim', () => {
  const { world, game } = setup();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.28, .035), new THREE.MeshBasicMaterial());
  rim.name = 'quarter-basketball-rim';
  world.scene.add(rim);
  const owned = resources(world.scene);
  owned.geometries.delete(rim.geometry);
  owned.materials.delete(rim.material);
  assert.ok(owned.geometries.size > 0);
  assert.ok(owned.materials.size > 0);
  const counts = new Map<object, number>();
  [...owned.geometries, ...owned.materials, rim.geometry, rim.material].forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1)));
  game.enter(2);
  game.shoot(gesture);
  game.dispose(); game.dispose(); game.update(9999);
  assert.equal(world.scene.children.length, 1);
  assert.equal(world.activityLocked, false);
  for (const resource of [...owned.geometries, ...owned.materials]) assert.equal(counts.get(resource), 1);
  assert.equal(counts.get(rim.geometry), undefined);
  assert.equal(counts.get(rim.material), undefined);
  assert.equal(game.enter(2), false);
  assert.equal(game.shoot(gesture), null);
  rim.geometry.dispose(); rim.material.dispose();
});

test('basketball rejects expired late arrivals and invalid shots without changing score', () => {
  const { game, setNow } = setup();
  const launch = launchFromFlick(2, gesture)!;
  assert.ok(launch);
  assert.equal(game.receiveShot(launch, 3), false);
  assert.equal(game.receiveShot({ ...launch, courtId: 'other-court' } as typeof launch), false);
  game.enter(2);
  assert.equal(game.shoot({ dx: 0, dy: -.5, durationMs: 200 }), null);
  assert.equal(game.getSnapshot().attempts, 0);
  game.leave();
  setNow(9000);
  assert.equal(game.shoot(gesture), null);
  game.dispose();
});
