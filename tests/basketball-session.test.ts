import assert from 'node:assert/strict';
import test from 'node:test';
import { CourtSession, HorseSession, readCourtRequest } from '../src/game/basketballSession';

const scope = { roomId: 'map2-local', mapId: 'map2', courtId: 'map2-basketball' };
const gesture = { dx: 0, dy: .2884, durationMs: 140 };
const result = (shotId: string, outcome: 'make' | 'miss', spotId = 2) => ({
  shotId, outcome, spotId, version: 1 as const, courtId: scope.courtId, swish: outcome === 'make',
});
function joined(count = 2) {
  const court = new CourtSession(scope);
  for (let index = 0; index < count; index++) assert.equal(court.join(`p${index}`, court.snapshot().revision, 0).ok, true);
  return court;
}
function acceptedHorse() {
  const horse = new HorseSession(scope, 'setter', 'matcher', 2);
  assert.equal(horse.accept('matcher', 0, 0).ok, true);
  return horse;
}

test('a stationary normal release is an accepted attempted drop, not a reset',()=>{
  const court=joined(1),seat=court.snapshot().seats[0]!;
  const drop={dx:0,dy:0,durationMs:140};
  assert.ok(readCourtRequest({type:'court_shot',...scope,version:1,revision:court.snapshot().revision,shotId:`s${seat.epoch}-1`,sequence:1,seatEpoch:seat.epoch,gesture:drop}));
  const reply=court.shoot('p0',{shotId:`s${seat.epoch}-1`,sequence:1,seatEpoch:seat.epoch,gesture:drop},court.snapshot().revision,0);
  assert.equal(reply.ok,true);assert.deepEqual(reply.launch?.velocity,[0,0,0]);
  assert.equal(reply.result?.outcome,'miss');assert.equal(court.snapshot().seats[0]!.attempts,1);
});

test('sequential server processing of concurrent joins allocates five distinct marks and reports full', () => {
  const court = joined(5);
  assert.deepEqual(court.snapshot().seats.map(seat => seat.spotId), [0, 1, 2, 3, 4]);
  assert.equal(court.join('sixth', court.snapshot().revision, 0).reason, 'full');
});
test('disconnect frees its mark while other free shooters keep their marks', () => {
  const court = joined(5);
  const otherSeats = court.snapshot().seats.filter(seat => seat.playerId !== 'p2');
  assert.equal(court.leave('p2', court.snapshot().revision, 0).ok, true);
  assert.equal(court.join('replacement', court.snapshot().revision, 0).ok, true);
  assert.equal(court.snapshot().seats.find(seat => seat.playerId === 'replacement')?.spotId, 2);
  assert.deepEqual(court.snapshot().seats.filter(seat => seat.playerId !== 'replacement'), otherSeats);
});
test('stale revisions do not change seats and repeated join is idempotent', () => {
  const court = joined(1);
  assert.equal(court.join('p1', 0, 0).reason, 'stale');
  assert.equal(court.join('p0', court.snapshot().revision, 0).ok, true);
  assert.equal(court.snapshot().revision, 1);
  const copied = court.snapshot();
  copied.seats.length = 0;
  assert.equal(court.snapshot().seats.length, 1);
});
test('court scores shots from deterministic simulation and refuses duplicate IDs or old sequences', () => {
  const court = joined(1);
  const seat = court.snapshot().seats[0]!;
  const first = court.shoot('p0', { shotId: `s${seat.epoch}-1`, sequence: 1, seatEpoch: seat.epoch, gesture }, court.snapshot().revision, 1000);
  assert.equal(first.ok, true);
  assert.ok(first.launch);
  assert.equal(first.result?.outcome, 'miss','staged server fallback has no actual raised release position');
  const revision = court.snapshot().revision;
  assert.equal(court.shoot('p0', { shotId: `s${seat.epoch}-1`, sequence: 2, seatEpoch: seat.epoch, gesture }, revision, 5000).reason, 'duplicate');
  assert.equal(court.shoot('p0', { shotId: 'other', sequence: 1, seatEpoch: seat.epoch, gesture }, revision, 5000).reason, 'sequence');
  assert.equal(court.snapshot().revision, revision);
  assert.equal(court.snapshot().seats[0]!.makes, 0);
});
test('old seat epochs and invalid flicks cannot consume a new shot', () => {
  const court = joined(1);
  const oldEpoch = court.snapshot().seats[0]!.epoch;
  court.leave('p0', court.snapshot().revision, 0);
  court.join('p0', court.snapshot().revision, 0);
  const revision = court.snapshot().revision;
  assert.equal(court.shoot('p0', { shotId: 'old', sequence: 1, seatEpoch: oldEpoch, gesture }, revision, 0).reason, 'seat');
  const epoch = court.snapshot().seats[0]!.epoch;
  assert.equal(court.shoot('p0', { shotId: `s${epoch}-1`, sequence: 1, seatEpoch: epoch, gesture: { ...gesture, dy: -1 } }, revision, 0).reason, 'gesture');
  assert.equal(court.snapshot().revision, revision);
});
test('only the invitee accepts, and a setting miss passes the turn without letters', () => {
  const horse = new HorseSession(scope, 'setter', 'matcher', 2);
  assert.equal(horse.accept('setter', 0, 0).reason, 'invitation');
  horse.accept('matcher', 0, 0);
  assert.equal(horse.resolveShot('matcher', result('wrong-turn', 'make'), 1, 0).reason, 'turn');
  assert.equal(horse.resolveShot('setter', result('miss', 'miss'), 1, 3000).ok, true);
  assert.equal(horse.snapshot().setterId, 'matcher');
  assert.equal(horse.snapshot().occupantId, 'matcher');
  assert.deepEqual(horse.snapshot().letters, { setter: '', matcher: '' });
});
test('made setting shot requires matching from the reserved mark and failed match adds one letter', () => {
  const horse = acceptedHorse();
  horse.resolveShot('setter', result('set', 'make'), 1, 1000);
  assert.equal(horse.snapshot().phase, 'match');
  assert.equal(horse.snapshot().occupantId, 'matcher');
  assert.equal(horse.resolveShot('matcher', result('wrong-mark', 'miss', 0), 2, 2000).reason, 'mark');
  assert.equal(horse.resolveShot('matcher', result('match', 'miss'), 2, 4000).ok, true);
  assert.equal(horse.snapshot().letters.matcher, 'H');
  assert.equal(horse.snapshot().phase, 'set');
  assert.equal(horse.snapshot().occupantId, 'setter');
  assert.equal(horse.resolveShot('setter', result('match', 'miss'), 3, 8000).reason, 'duplicate');
  assert.equal(horse.resolveShot('setter', result('stale', 'miss'), 2, 8000).reason, 'stale');
});
test('successful match adds no letter and five failed matches end HORSE', () => {
  const horse = acceptedHorse();
  horse.resolveShot('setter', result('set0', 'make'), horse.snapshot().revision, 0);
  horse.resolveShot('matcher', result('match0', 'make'), horse.snapshot().revision, 0);
  assert.equal(horse.snapshot().letters.matcher, '');
  for (let index = 1; index <= 5; index++) {
    horse.resolveShot('setter', result(`set${index}`, 'make'), horse.snapshot().revision, index * 6000);
    horse.resolveShot('matcher', result(`match${index}`, 'miss'), horse.snapshot().revision, index * 6000 + 3000);
  }
  assert.equal(horse.snapshot().phase, 'ended');
  assert.equal(horse.snapshot().letters.matcher, 'HORSE');
  assert.equal(horse.snapshot().winnerId, 'setter');
  assert.equal(horse.resolveShot('setter', result('later', 'make'), horse.snapshot().revision, 40000).reason, 'ended');
});
test('departure ends a challenge and reserves no mark after a court disconnect', () => {
  const court = joined();
  court.inviteHorse('p0', 'p1', 2, court.snapshot().revision, 0);
  assert.equal(court.acceptHorse('p1', court.snapshot().revision, 0).ok, true);
  assert.equal(court.snapshot().horse?.occupantId, 'p0');
  assert.deepEqual(court.snapshot().seats.map(seat => seat.spotId), [0, 1]);
  court.leave('p0', court.snapshot().revision, 0);
  assert.equal(court.snapshot().horse?.phase, 'ended');
  assert.equal(court.snapshot().horse?.winnerId, 'p1');
  court.join('new', court.snapshot().revision, 0);
  court.join('new2', court.snapshot().revision, 0);
  assert.equal(court.snapshot().seats.find(seat => seat.playerId === 'new2')?.spotId, 2);
});
test('a reserved HORSE mark blocks new allocation and off-turn shots without moving free players', () => {
  const court = joined();
  court.inviteHorse('p0', 'p1', 2, court.snapshot().revision, 0);
  court.acceptHorse('p1', court.snapshot().revision, 0);
  court.join('p2', court.snapshot().revision, 0);
  assert.equal(court.snapshot().seats.find(seat => seat.playerId === 'p2')?.spotId, 3);
  const matcher = court.snapshot().seats.find(seat => seat.playerId === 'p1')!;
  assert.equal(court.shoot('p1', { shotId: 'turn', sequence: 1, seatEpoch: matcher.epoch, gesture }, court.snapshot().revision, 0).reason, 'turn');
});
test('court parser requires bounded scoped versioned commands and never reads a made flag', () => {
  const base = { ...scope, type: 'court_join', version: 1, revision: 0 };
  assert.deepEqual(readCourtRequest(base), base);
  assert.equal(readCourtRequest({ ...base, version: 2 }), null);
  assert.equal(readCourtRequest({ ...base, roomId: 'x'.repeat(65) }), null);
  assert.equal(readCourtRequest({ ...base, revision: -1 }), null);
  const shot = { ...base, type: 'court_shot', shotId: 's1-1', sequence: 1, seatEpoch: 1, gesture, made: true };
  const parsed = readCourtRequest(shot);
  assert.equal(parsed?.type, 'court_shot');
  assert.equal('made' in parsed!, false);
  assert.equal(readCourtRequest({ ...shot, gesture: { ...gesture, dx: Infinity } }), null);
  assert.equal(readCourtRequest({ ...shot, sequence: Number.MAX_SAFE_INTEGER + 1 }), null);
});
test('authenticated command dispatch rejects another room and lets stale clients request current state', () => {
  const court = joined(1);
  const request = { ...scope, version: 1, revision: 0, type: 'court_join', playerId: 'forged' };
  assert.equal(court.handleRequest('real', { ...request, roomId: 'public' }, 0).reason, 'invalid');
  assert.equal(court.handleRequest('real', { ...request, type: 'court_state' }, 0).state.revision, 1);
  assert.equal(court.handleRequest('real', { ...request, revision: 1 }, 0).ok, true);
  assert.equal(court.snapshot().seats[1]!.playerId, 'real');
});
test('simulation misses do not increment makes and the same seat cannot launch again before expiry', () => {
  const court = joined(1);
  const epoch = court.snapshot().seats[0]!.epoch;
  const shot = { shotId: `s${epoch}-1`, sequence: 1, seatEpoch: epoch, gesture: { ...gesture, dy: .2 } };
  assert.equal(court.shoot('p0', shot, court.snapshot().revision, 0).result?.outcome, 'miss');
  assert.equal(court.snapshot().seats[0]!.makes, 0);
  assert.equal(court.shoot('p0', { ...shot, shotId: 'early', sequence: 2 }, court.snapshot().revision, 2000).reason, 'busy');
  assert.equal(court.shoot('p0', { ...shot, shotId: `s${epoch}-2`, sequence: 2 }, court.snapshot().revision, 3000).ok, true);
});
test('invalid server timestamps and parser payload arrays do not change state', () => {
  const court = joined(1);
  assert.equal(court.join('later', court.snapshot().revision, Number.MAX_SAFE_INTEGER).reason, 'invalid');
  assert.equal(court.snapshot().revision, 1);
  assert.equal(readCourtRequest([]), null);
  assert.equal(readCourtRequest({ ...scope, type: 'horse_invite', version: 1, revision: 0, inviteeId: 'p1', spotId: 5 }), null);
});
test('shot IDs are bound to seat epochs and sequences so cache eviction cannot replay an old ID', () => {
  const court = joined(1);
  const epoch = court.snapshot().seats[0]!.epoch;
  assert.equal(court.shoot('p0', { shotId: 'reused-id', sequence: 1, seatEpoch: epoch, gesture }, court.snapshot().revision, 0).reason, 'invalid');
  for (let sequence = 1; sequence <= 257; sequence++) {
    assert.equal(court.shoot('p0', { shotId: `s${epoch}-${sequence}`, sequence, seatEpoch: epoch, gesture }, court.snapshot().revision, sequence * 3000).ok, true);
  }
  const revision = court.snapshot().revision;
  assert.equal(court.shoot('p0', { shotId: `s${epoch}-1`, sequence: 258, seatEpoch: epoch, gesture }, revision, 258 * 3000).reason, 'invalid');
  assert.equal(court.snapshot().seats[0]!.attempts, 257);
});
test('joins racing with the same revision receive stale snapshots and allocate unique seats on retry', () => {
  const court = new CourtSession(scope);
  const replies = Array.from({ length: 5 }, (_, index) => court.join(`race${index}`, 0, 0));
  assert.equal(replies.filter(reply => reply.ok).length, 1);
  for (let index = 1; index < 5; index++) {
    assert.equal(replies[index]!.reason, 'stale');
    assert.equal(court.join(`race${index}`, court.snapshot().revision, 0).ok, true);
  }
  assert.equal(new Set(court.snapshot().seats.map(seat => seat.spotId)).size, 5);
});
test('HORSE invitations and accepts preserve the supplied authoritative server timestamp', () => {
  const court = joined();
  court.inviteHorse('p0', 'p1', 2, court.snapshot().revision, 1200);
  assert.equal(court.snapshot().horse?.serverTime, 1200);
  court.acceptHorse('p1', court.snapshot().revision, 1400);
  assert.equal(court.snapshot().horse?.serverTime, 1400);
});
