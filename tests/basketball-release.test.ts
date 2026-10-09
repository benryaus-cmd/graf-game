import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { BASKETBALL_COURT as court } from '../src/game/basketballCourt';
import { BasketballGame } from '../src/game/basketballGame';
import { createBall, stepBall } from '../src/game/basketballPhysics';
import { encodeReleaseOffset, isAuthoritativeReleaseOrigin, readReleaseOffset, releaseOriginFromOffset } from '../src/game/basketballRelease';
import { flickDy } from './basketball-calibration';
import { CourtSession, readCourtRequest } from '../src/game/basketballSession';

const scope = { roomId: 'morning-quarter-v1', mapId: 'map2', courtId: 'map2-basketball' };
const offset = { right: -.32, up: 1.48, forward: .81 };
const gesture = { dx: 0, dy: .28, durationMs: 140 };
const malformed: unknown[] = [undefined, null, [], 'offset', {}, { ...offset, right: NaN }, { ...offset, right: Infinity },
  { ...offset, right: -1.75001 }, { ...offset, right: 1.75001 }, { ...offset, up: .39999 }, { ...offset, up: 2.80001 },
  { ...offset, forward: .04999 }, { ...offset, forward: 1.75001 }, { right: 1.75, up: 1.48, forward: 1.75 },
  { ...offset, up: '1.48' }, { ...offset, up: -Infinity }, { ...offset, up: NaN }, { ...offset, forward: NaN }, { ...offset, forward: Infinity }];

test('authority inverse projection accepts boundary roundoff without widening raw request bounds', () => {
  for (const spot of court.spots) {
    for (const edge of [{ right: -1.75, up: .4, forward: .05 }, { right: 1.75, up: 2.8, forward: .05 }, { right: 0, up: 1, forward: 1.75 }]) {
      const origin = releaseOriginFromOffset(spot.id, edge)!;
      assert.ok(origin);
      assert.equal(isAuthoritativeReleaseOrigin(spot.id, origin), true);
      assert.equal(isAuthoritativeReleaseOrigin(spot.id, [origin[0], 2.80001, origin[2]]), false);
    }
  }
  assert.equal(readReleaseOffset({ right: 1.75 + 1e-10, up: 1, forward: .05 }), null);
});

test('release offsets reject every malformed and out-of-envelope input without clamping', () => {
  for (const value of malformed) assert.equal(readReleaseOffset(value), null, JSON.stringify(value));
  for (const value of [{ right: -1.75, up: .4, forward: .05 }, { right: 1.75, up: 2.8, forward: .05 }, { right: 0, up: 1, forward: 1.75 }]) {
    assert.deepEqual(readReleaseOffset(value), value);
  }
  assert.deepEqual(readReleaseOffset({ ...offset, velocity: [1, 2, 3] }), offset);
  assert.notEqual(readReleaseOffset(offset), offset);
});

test('canonical mark-to-rim forward and perpendicular right round trip every shooting mark', () => {
  for (const spot of court.spots) {
    const length = Math.hypot(court.rim.center[0] - spot.position[0], court.rim.center[2] - spot.position[2]);
    const fx = (court.rim.center[0] - spot.position[0]) / length, fz = (court.rim.center[2] - spot.position[2]) / length;
    const origin: [number, number, number] = [spot.position[0] + fz * offset.right + fx * offset.forward, offset.up, spot.position[2] - fx * offset.right + fz * offset.forward];
    assert.deepEqual(releaseOriginFromOffset(spot.id, offset), origin);
    const encoded = encodeReleaseOffset(spot.id, origin)!;
    for (const key of ['right', 'up', 'forward'] as const) assert.ok(Math.abs(encoded[key] - offset[key]) < 1e-12);
  }
  for (const spotId of [-1, 5, NaN, .5]) {
    assert.equal(releaseOriginFromOffset(spotId, offset), null);
    assert.equal(encodeReleaseOffset(spotId, [-53, 1.48, -35]), null);
  }
  for (const origin of [[NaN, 1, -35], [-100, 1, -35], [-53, .1, -35], [-53, 1, -100]]) assert.equal(encodeReleaseOffset(2, origin as [number, number, number]), null);
});

test('required v1 offsets are checked by both the wire decoder and direct session callers without consuming state', () => {
  const session = new CourtSession(scope);
  session.join('p', 0, 0);
  const seat = session.snapshot().seats[0]!;
  const request = { ...scope, version: 1, revision: 1, type: 'court_shot', shotId: `s${seat.epoch}-1`, sequence: 1, seatEpoch: seat.epoch, gesture, releaseOffset: offset };
  for (const value of malformed) {
    const shot = { ...request, releaseOffset: value };
    assert.equal(readCourtRequest(shot), null);
    const before = session.snapshot();
    assert.equal(session.shoot('p', shot as never, 1, 0).reason, 'invalid');
    assert.deepEqual(session.snapshot(), before);
  }
  const { releaseOffset: _omitted, ...missing } = request;
  assert.equal(readCourtRequest(missing), null);
  assert.equal(session.shoot('p', missing as never, 1, 0).reason, 'invalid');
  assert.ok(readCourtRequest(request));
  assert.equal(session.shoot('p', request, 1, 0).ok, true);
});

test('actual movable held-ball origins and local physics match authoritative launches and outcomes at every mark', () => {
  for (const aspect of [384 / 606, 606 / 384, 16 / 9]) {
    const world = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(76, aspect, .1, 1200), playerPosition: new THREE.Vector3(), playerYaw: 0, playerPitch: 0, cameraMode: 'first' as const };
    const game = new BasketballGame(world, () => {});
    const session = new CourtSession(scope);
    for (let id = 0; id < 5; id++) session.join(`p${id}`, session.snapshot().revision, 0);
    for (const spot of court.spots) {
      game.enter(spot.id);
      const seat = session.snapshot().seats[spot.id]!;
      for (const [index, flick] of [{ dx: 0, dy: flickDy(7.6), durationMs: 140 }, { dx: 0, dy: 0, durationMs: 140 }, { dx: .00001, dy: .00001, durationMs: 140 }].entries()) {
        game.setHeldBallScreenPosition(index === 0 ? { x: .5, y: .4 } : null);
        const actual = world.scene.getObjectByName('basketball-held')!.position.toArray() as [number, number, number];
        const releaseOffset = encodeReleaseOffset(spot.id, actual);
        assert.ok(releaseOffset, `mark ${spot.id}, aspect ${aspect}, ${JSON.stringify(actual)}`);
        const local = game.shoot(flick)!;
        assert.deepEqual(local.origin, actual);
        const response = session.shoot(`p${spot.id}`, { shotId: `s${seat.epoch}-${index + 1}`, seatEpoch: seat.epoch, sequence: index + 1, gesture: flick, releaseOffset }, session.snapshot().revision, spot.id * 9000 + index * 3000);
        assert.equal(response.ok, true, response.reason);
        local.shotId = response.launch!.shotId;
        for (const field of ['origin', 'velocity'] as const) for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(local[field][axis] - response.launch![field][axis]) < 1e-12);
        assert.deepEqual(stepBall(createBall(local), 3), response.result);
        assert.equal(response.result?.outcome, index === 0 ? 'make' : 'miss');
        if (index === 1) assert.deepEqual(response.launch?.velocity, [0, 0, 0]);
      }
    }
    game.dispose();
  }
});


test('HORSE releases use the reserved challenge mark and retain the seat epoch and turn', () => {
  const session = new CourtSession(scope);
  session.join('setter', 0, 0);
  session.join('matcher', 1, 0);
  session.inviteHorse('setter', 'matcher', 2, 2, 0);
  session.acceptHorse('matcher', 3, 0);
  const seat = session.snapshot().seats[0]!;
  const launch = session.shoot('setter', { shotId: `s${seat.epoch}-1`, sequence: 1, seatEpoch: seat.epoch, releaseOffset: offset, gesture: { dx: 0, dy: 0, durationMs: 140 } }, session.snapshot().revision, 0);
  assert.equal(launch.ok, true);
  assert.equal(launch.launch?.spotId, 2);
  assert.deepEqual(launch.launch?.origin, releaseOriginFromOffset(2, offset));
  assert.notDeepEqual(launch.launch?.origin, releaseOriginFromOffset(seat.spotId, offset));
  assert.equal(launch.result?.outcome, 'miss');
  assert.equal(session.snapshot().horse?.occupantId, 'matcher');
  assert.deepEqual(session.snapshot().horse?.letters, { setter: '', matcher: '' });
  assert.equal(session.snapshot().seats[0]!.epoch, seat.epoch);
});
