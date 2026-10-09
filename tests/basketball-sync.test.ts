import assert from 'node:assert/strict';
import test from 'node:test';
import { BasketballSync, readBasketballCourtState, type BasketballSyncEvent, type CourtConnection, type CourtListener, type CourtTransport } from '../src/multiplayer/basketballSync';
import { CourtSession, type SessionReply, type CourtState } from '../src/game/basketballSession';
import { MultiplayerConnection, type SocketLike } from '../src/multiplayer/connection';
import { launchFromFlick } from '../src/game/basketballPhysics';
import { releaseOriginFromOffset } from '../src/game/basketballRelease';
import type { Message } from '../src/multiplayer/protocol';

const scope = { roomId: 'morning-quarter-v1', mapId: 'map2', courtId: 'map2-basketball', version: 1 as const };
const gesture = { dx: .08, dy: .54, durationMs: 92 };
const releaseOffset = { right: -.32, up: 1.48, forward: .81 };

test('HORSE requires explicit support and authority allocates invitation and reserved turn mark', () => {
  const { clients, drain } = serverHarness(3);
  for (const client of clients) client.sync.enter(); drain();
  assert.equal(clients[0].sync.inviteHorse('p1', 4), false);
  for (const client of clients) { client.capabilities.push('basketball_horse_v1'); client.receive(null); }
  assert.equal(clients[0].sync.inviteHorse('p0', 4), false);
  assert.equal(clients[0].sync.inviteHorse('p1', 1), false);
  assert.equal(clients[0].sync.inviteHorse('p1', 4), true);
  assert.equal(clients[0].sync.state.court?.horse, null);
  drain(); assert.equal(clients[0].sync.state.court?.horse?.phase, 'invited');
  assert.equal(clients[0].sync.acceptHorse(), false);
  assert.equal(clients[1].sync.acceptHorse(), true); drain();
  assert.equal(clients[0].sync.state.shootingSpotId, 4);
  assert.equal(clients[1].sync.state.shootingSpotId, 1);
  assert.equal(clients[1].sync.shoot(gesture, releaseOffset), null);
  for (const client of clients) client.sync.dispose();
});

test('HORSE shooter uses reserved release frame, bystander shoots freely, and only authority changes turns', () => {
  const { clients, drain, shots, finish } = serverHarness(3);
  for (const client of clients) { client.capabilities.push('basketball_horse_v1'); client.receive(null); client.sync.enter(); } drain();
  clients[0].sync.inviteHorse('p1', 4); drain(); clients[1].sync.acceptHorse(); drain();
  const before = clients[0].sync.state.court!.horse!;
  const launch = clients[0].sync.shoot({ dx: 0, dy: 0, durationMs: 100 }, releaseOffset)!;
  assert.equal(launch.spotId, 4); assert.deepEqual(launch.origin, releaseOriginFromOffset(4, releaseOffset));
  assert.deepEqual(clients[0].sync.state.court!.horse, before);
  drain(); assert.deepEqual(shots[0].reply.launch, launch);
  assert.ok(clients[0].events.some(e => e.type === 'launch' && e.reconcile));
  assert.ok(clients[2].sync.shoot(gesture, releaseOffset)); drain();
  assert.equal(shots[1].reply.launch?.spotId, 2);
  finish(0); assert.equal(clients[0].sync.state.court?.horse?.occupantId, 'p1');
  assert.equal(clients[0].sync.state.shootingSpotId, 0); assert.equal(clients[1].sync.state.shootingSpotId, 4);
  for (const client of clients) client.now += 3000;
  assert.equal(clients[0].sync.shoot(gesture, releaseOffset), null);
  assert.equal(clients[1].sync.shoot(gesture, releaseOffset)?.spotId, 4);
  for (const client of clients) client.sync.dispose();
});

test('stale HORSE invitation reconciles and retries only if authority still permits its target and mark', () => {
  const { clients, drain, server } = serverHarness();
  for (const client of clients) { client.capabilities.push('basketball_horse_v1'); client.receive(null); client.sync.enter(); } drain();
  server.join('late', server.snapshot().revision, clients[0].now);
  assert.equal(clients[0].sync.inviteHorse('p1', 4), true); drain();
  assert.equal(clients[0].sync.state.court?.horse?.inviteeId, 'p1');
  assert.equal(clients[0].outgoing.filter(m => m.type === 'horse_invite').length, 2);
  for (const client of clients) client.sync.dispose();
});
class Transport implements CourtTransport {
  now = 10000;
  connected = true;
  capabilities = ['basketball_court_v1'];
  listeners = new Set<CourtListener>();
  outgoing: Message[] = [];
  events: BasketballSyncEvent[] = [];
  sync: BasketballSync;
  constructor(public playerId = 'p0', private send?: (message: Message) => void) {
    this.sync = new BasketballSync(this); this.sync.subscribe((_view, event) => { if (event) this.events.push(event); });
  }
  get courtConnection(): CourtConnection { return { connected: this.connected, playerId: this.connected ? this.playerId : null, capabilities: this.capabilities, roomId: scope.roomId, worldId: 'map2-v1', serverTime: this.now }; }
  subscribeCourt(listener: CourtListener) { this.listeners.add(listener); listener(null, this.courtConnection); return () => { this.listeners.delete(listener); }; }
  sendCourt(message: Message) { if (!this.connected) return false; this.outgoing.push(message); this.send?.(message); return true; }
  receive(message: Message | null) { for (const listener of this.listeners) listener(message, this.courtConnection); }
  state(state: CourtState, extras = {}) { this.receive({ ...scope, type: 'court_state', revision: state.revision, serverTime: this.now, state: { ...state, ...extras } }); }
}
test('late snapshot retains an authoritative free-shot flight accepted before HORSE starts', () => {
  const server = new CourtSession(scope), now = 10000;
  server.join('p0', 0, now); server.join('p1', server.snapshot().revision, now);
  const seat = server.snapshot().seats[0];
  const shot = server.handleRequest('p0', { ...scope, type: 'court_shot', revision: server.snapshot().revision,
    seatEpoch: seat.epoch, sequence: 1, shotId: `s${seat.epoch}-1`, gesture, releaseOffset }, now);
  assert.ok(shot.launch);
  server.inviteHorse('p0', 'p1', 4, server.snapshot().revision, now);
  server.acceptHorse('p1', server.snapshot().revision, now);
  const client = new Transport('p1'); client.capabilities.push('basketball_horse_v1'); client.receive(null); client.sync.enter();
  client.state(server.snapshot(), { liveShots: [{ playerId: 'p0', seatEpoch: seat.epoch, sequence: 1, launch: shot.launch, serverTime: now }] });
  assert.ok(client.events.some(e => e.type === 'launch' && e.launch.spotId === seat.spotId));
  assert.equal(client.sync.state.court?.horse?.spotId, 4);
  client.sync.dispose();
});
function serverHarness(count = 2) {
  const server = new CourtSession(scope), queue: Array<{ client: Transport; request: Message }> = [], clients: Transport[] = [];
  const shots: Array<{ client: Transport; request: Message; reply: SessionReply<CourtState> }> = [];
  for (let i = 0; i < count; i++) clients.push(new Transport(`p${i}`, request => queue.push({ client: clients[i], request })));
  const drain = () => {
    while (queue.length) {
      const { client, request } = queue.shift()!, reply = server.handleRequest(client.playerId, request, client.now);
      const base = { ...scope, revision: reply.state.revision, serverTime: client.now };
      if (!reply.ok) { client.receive({ ...base, type: 'court_rejected', requestType: request.type, reason: reply.reason, state: reply.state }); continue; }
      if (reply.launch) {
        shots.push({ client, request, reply });
        for (const transport of clients) transport.receive({ ...base, type: 'court_shot', playerId: client.playerId, seatEpoch: request.seatEpoch, sequence: request.sequence, launch: reply.launch });
      } else for (const transport of clients) transport.state(reply.state);
    }
  };
  const finish = (index: number) => {
    const { client, request, reply } = shots[index];
    for (const transport of clients) {
      transport.now = Math.max(transport.now, reply.resultServerTime!);
      transport.receive({ ...scope, type: 'court_result', revision: reply.state.revision, serverTime: reply.resultServerTime, playerId: client.playerId, seatEpoch: request.seatEpoch, sequence: request.sequence, result: reply.result, state: reply.state });
    }
  };
  return { server, clients, drain, shots, finish };
}

test('admitted protocol-2 snapshot gates court messages on the existing socket', () => {
  const socket: SocketLike = { readyState: 1, bufferedAmount: 0, onopen: null, onmessage: null, onerror: null, onclose: null, send() {}, close() {} };
  const received: Message[] = [];
  const connection = new MultiplayerConnection('ws://mock', () => {}, message => received.push(message), () => socket);
  connection.connect('PLAYER', scope.roomId, {}, [0, 1.72, 5], 'map2-v1');
  const receive = (message: Message) => socket.onmessage?.({ data: JSON.stringify(message) });
  receive({ type: 'hello', protocol: 2, playerId: 'p0', capabilities: ['basketball_court_v1'] });
  receive({ type: 'court_state', ...scope }); assert.equal(received.length, 0); assert.equal(connection.connected, false);
  receive({ type: 'world_snapshot', roomId: scope.roomId, worldId: 'map2-v1', playerId: 'p0', strokes: [] });
  receive({ type: 'court_state', ...scope }); assert.equal(received.length, 2);
  assert.equal(connection.admittedRoomId, scope.roomId); assert.equal(connection.admittedWorldId, 'map2-v1');
  const oldHandler = socket.onmessage!; connection.disconnect(); oldHandler({ data: JSON.stringify({ type: 'court_state', ...scope }) });
  assert.equal(received.length, 2); assert.equal(connection.admittedRoomId, null); assert.deepEqual(connection.capabilities, []);
});
test('unsupported servers, solo, and occupied marks send no court requests', () => {
  const transport = new Transport(); transport.capabilities = []; transport.receive(null);
  assert.equal(transport.sync.enter(), false); assert.equal(transport.outgoing.length, 0);
  transport.capabilities = ['basketball_court_v1']; transport.connected = false; transport.receive(null);
  assert.equal(transport.sync.enter(), false); transport.sync.dispose();
  const { clients, drain } = serverHarness(); for (const client of clients) client.sync.enter(); drain();
  clients[1].sync.leave(); drain(); assert.equal(clients[1].sync.enter(0), false);
  for (const client of clients) client.sync.dispose();
});
test('five clients receive unique server marks; stale joins retry at most five times and stale leave releases reservation', () => {
  const { clients, drain, server } = serverHarness(5); for (const client of clients) client.sync.enter(); drain();
  assert.equal(server.snapshot().seats.length, 5);
  assert.equal(new Set(clients.map(client => client.sync.state.ownSeat?.spotId)).size, 5);
  clients[2].sync.leave(); drain(); assert.equal(server.snapshot().seats.some(seat => seat.playerId === 'p2'), false);
  for (const client of clients) client.sync.dispose();
  const stalled = new Transport(); stalled.sync.enter(); const empty = new CourtSession(scope).snapshot();
  for (let i = 0; i < 8; i++) stalled.receive({ ...scope, type: 'court_rejected', revision: 0, serverTime: stalled.now, requestType: 'court_join', reason: 'stale', state: empty });
  assert.equal(stalled.outgoing.length, 6); assert.equal(stalled.sync.state.entered, false); stalled.sync.dispose();
});
test('own prediction reconciles one echo with canonical ID and counters only arrive with delayed authority', () => {
  const { clients, drain, shots, finish } = serverHarness(); for (const client of clients) client.sync.enter(); drain();
  const own = clients[0], seat = own.sync.state.ownSeat!, launch = own.sync.shoot(gesture, releaseOffset)!;
  assert.equal(launch.shotId, `s${seat.epoch}-1`); assert.deepEqual(launch.origin, releaseOriginFromOffset(seat.spotId, releaseOffset));
  assert.equal(own.sync.shoot(gesture, releaseOffset), null); assert.equal(own.sync.state.ownSeat?.attempts, 0);
  drain(); assert.deepEqual(shots[0].reply.launch, launch);
  assert.deepEqual(own.events.filter(event => event.type === 'launch').map(event => event.type === 'launch' && event.reconcile), [false, true]);
  assert.equal(own.sync.state.ownSeat?.attempts, 0); finish(0); finish(0);
  assert.equal(own.sync.state.ownSeat?.attempts, 1); assert.equal(own.events.filter(event => event.type === 'result').length, 1);
  assert.equal(own.sync.state.pendingShotId, null);
  // The transport clock keeps progressing without another message.
  own.now = seat.readyAt + 3000 + 10000; assert.ok(own.sync.shoot(gesture, releaseOffset));
  for (const client of clients) client.sync.dispose();
});
test('out of order results clear earlier pending shots without rolling newer authority back', () => {
  const { clients, drain, finish } = serverHarness(); for (const client of clients) client.sync.enter(); drain();
  for (const client of clients) { client.sync.shoot(gesture, releaseOffset); drain(); }
  finish(1); const revision = clients[0].sync.state.court!.revision; finish(0);
  assert.equal(clients[0].sync.state.court?.revision, revision); assert.equal(clients[0].sync.state.pendingShotId, null);
  assert.equal(clients[0].events.filter(event => event.type === 'result').length, 2);
  for (const client of clients) client.sync.dispose();
});
test('rejection resets prediction and restores authoritative counters; disconnect and leave ignore late output', () => {
  const { clients, drain, shots, finish } = serverHarness(); for (const client of clients) client.sync.enter(); drain();
  const own = clients[0]; own.sync.shoot(gesture, releaseOffset);
  const state = own.sync.state.court!;
  own.receive({ ...scope, type: 'court_rejected', revision: state.revision, serverTime: own.now, requestType: 'court_shot', reason: 'busy', state });
  assert.equal(own.sync.state.pendingShotId, null); assert.equal(own.sync.state.ownSeat?.attempts, 0); assert.ok(own.events.some(event => event.type === 'reset' && event.shotId));
  drain(); own.sync.leave(); const count = own.events.length; finish(0); assert.equal(own.events.length, count);
  own.connected = false; own.receive(null); const afterDisconnect = own.events.length; finish(0); assert.equal(own.events.length, afterDisconnect);
  assert.equal(own.sync.state.court, null); assert.equal(shots.length, 1);
  for (const client of clients) client.sync.dispose();
});
test('scoped bounded state and launches reject invalid versions, IDs, numbers, sequence, epochs and stale revisions', () => {
  const { clients, drain, server } = serverHarness(); for (const client of clients) client.sync.enter(); drain();
  const own = clients[0], state = server.snapshot(), seat = state.seats[0];
  for (const patch of [{ version: 2 }, { mapId: 'map2-v1' }, { seats: [...state.seats, state.seats[0]] }, { revision: NaN }, { seats: [{ ...seat, readyAt: Infinity }] }, { horse: { phase: 'set' } }]) assert.equal(readBasketballCourtState({ ...state, ...patch }), null);
  const launch = launchFromFlick(seat.spotId, gesture, releaseOriginFromOffset(seat.spotId, releaseOffset)!)!; launch.shotId = `s${seat.epoch}-1`;
  const message = { ...scope, type: 'court_shot', revision: state.revision + 1, serverTime: own.now, playerId: seat.playerId, seatEpoch: seat.epoch, sequence: 1, launch };
  const count = own.events.length;
  for (const patch of [{ mapId: 'map2-v1' }, { playerId: 'unknown' }, { seatEpoch: seat.epoch + 1 }, { sequence: 4 }, { launch: { ...launch, velocity: [100, 0, 0] } }, { launch: { ...launch, origin: [-53, 1.48, -40] } }, { serverTime: own.now + 251 }, { revision: state.revision - 1 }]) own.receive({ ...message, ...patch });
  assert.equal(own.events.length, count); own.receive(message); own.receive(message); assert.equal(own.events.length, count + 1);
  for (const client of clients) client.sync.dispose();
});
test('optional bounded liveShots reconstruct elapsed flight once; missing list remains valid and future or expired shots stay hidden', () => {
  const { clients, drain, server } = serverHarness(); for (const client of clients) client.sync.enter(); drain();
  const own = clients[1], state = server.snapshot(), seat = state.seats[0];
  const launch = launchFromFlick(seat.spotId, gesture, releaseOriginFromOffset(seat.spotId, releaseOffset)!)!; launch.shotId = `s${seat.epoch}-1`;
  const live = { playerId: seat.playerId, seatEpoch: seat.epoch, sequence: 1, launch, serverTime: own.now - 1200 };
  own.state(state, { liveShots: [live] }); own.state(state, { liveShots: [live] });
  const events = own.events.filter(event => event.type === 'launch'); assert.equal(events.length, 1); assert.equal(events[0].type === 'launch' && events[0].elapsedSeconds, 1.2);
  own.state(state, { liveShots: [{ ...live, serverTime: own.now + 100 }] }); own.state(state, { liveShots: Array(6).fill(live) }); assert.equal(own.events.filter(event => event.type === 'launch').length, 1);
  const newcomer = new Transport('p3'); newcomer.sync.enter(); newcomer.state(state, { liveShots: [{ ...live, serverTime: newcomer.now - 3000 }] }); assert.equal(newcomer.events.filter(event => event.type === 'launch').length, 0);
  newcomer.sync.dispose(); for (const client of clients) client.sync.dispose();
});
test('a future scheduled result cannot change score before physical time and is canceled on leave', async () => {
  const { clients, drain, shots } = serverHarness(); for (const client of clients) client.sync.enter(); drain();
  const own = clients[0]; own.sync.shoot(gesture, releaseOffset); drain(); const shot = shots[0];
  own.receive({ ...scope, type: 'court_result', revision: shot.reply.state.revision, serverTime: own.now + 20, playerId: own.playerId, seatEpoch: shot.request.seatEpoch, sequence: shot.request.sequence, result: shot.reply.result, state: shot.reply.state });
  assert.equal(own.sync.state.ownSeat?.attempts, 0); own.sync.leave(); const count = own.events.length;
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(own.events.length, count);
  for (const client of clients) client.sync.dispose();
});
test('leave contention beyond the immediate retry cap recovers at a bounded rate and frees the reservation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const own = new Transport(), server = new CourtSession(scope);
  const joined = server.join(own.playerId, 0, own.now).state;
  own.sync.enter(); own.state(joined); own.sync.leave();
  for (let i = 0; i < 12; i++) own.receive({ ...scope, type: 'court_rejected', requestType: 'court_leave', reason: 'stale', revision: joined.revision, serverTime: own.now, state: joined });
  assert.equal(own.outgoing.filter(message => message.type === 'court_leave').length, 6);
  t.mock.timers.tick(1999); assert.equal(own.outgoing.filter(message => message.type === 'court_leave').length, 6);
  t.mock.timers.tick(1); assert.equal(own.outgoing.filter(message => message.type === 'court_leave').length, 7);
  const departed = server.leave(own.playerId, joined.revision, own.now).state; own.state(departed);
  assert.equal(own.sync.state.ownSeat, null); assert.equal(own.sync.enter(), true);
  own.sync.dispose(); const sent = own.outgoing.length; t.mock.timers.tick(10000); assert.equal(own.outgoing.length, sent);
});
test('expired authoritative launch still correlates its result and never recreates an old ball', () => {
  const { clients, drain, shots, finish } = serverHarness(); for (const client of clients) client.sync.enter(); drain();
  const own = clients[0]; own.sync.shoot(gesture, releaseOffset); drain();
  // A new explicit entrant receives the same events after a suspended-tab delay.
  const delayed = new Transport('p0'); delayed.now = own.now + 4000; delayed.sync.enter(); delayed.state(own.sync.state.court!);
  const { reply, request } = shots[0];
  delayed.receive({ ...scope, type: 'court_shot', revision: reply.state.revision, serverTime: own.now, playerId: 'p0', seatEpoch: request.seatEpoch, sequence: request.sequence, launch: reply.launch });
  assert.equal(delayed.events.filter(event => event.type === 'launch').length, 0);
  delayed.receive({ ...scope, type: 'court_result', revision: reply.state.revision, serverTime: reply.resultServerTime, playerId: 'p0', seatEpoch: request.seatEpoch, sequence: request.sequence, result: reply.result, state: reply.state });
  assert.equal(delayed.events.filter(event => event.type === 'result').length, 1); assert.equal(delayed.sync.state.ownSeat?.attempts, 1);
  finish(0); delayed.sync.dispose(); for (const client of clients) client.sync.dispose();
});
test('scheduled future authority credits exactly when the event clock arrives', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { clients, drain, shots } = serverHarness(); for (const client of clients) client.sync.enter(); drain();
  const own = clients[0]; own.sync.shoot(gesture, releaseOffset); drain(); const { reply, request } = shots[0];
  own.receive({ ...scope, type: 'court_result', revision: reply.state.revision, serverTime: own.now + 500, playerId: own.playerId, seatEpoch: request.seatEpoch, sequence: request.sequence, result: reply.result, state: reply.state });
  assert.equal(own.sync.state.ownSeat?.attempts, 0); t.mock.timers.tick(499); assert.equal(own.sync.state.ownSeat?.attempts, 0);
  own.now += 500; t.mock.timers.tick(1); assert.equal(own.sync.state.ownSeat?.attempts, 1);
  assert.equal(own.events.filter(event => event.type === 'result').length, 1);
  for (const client of clients) client.sync.dispose();
});


for (const horse of [false,true]) test(`${horse ? 'HORSE' : 'free shooting'} accepts current result revision after another player shoots`, () => {
 const {clients,drain,shots,server}=serverHarness(3);
 try {
  for(const client of clients){if(horse)client.capabilities.push('basketball_horse_v1');client.receive(null);client.sync.enter();}drain();
  if(horse){clients[0].sync.inviteHorse('p1',4);drain();clients[1].sync.acceptHorse();drain();}
  const own=clients[0]; own.sync.shoot(gesture,releaseOffset);drain();
  clients[2].sync.shoot(gesture,releaseOffset);drain();
  const {reply,request}=shots[0];const state=server.snapshot(); assert.ok(state.revision>reply.state.revision);
  own.now=Math.max(own.now,reply.resultServerTime!);state.serverTime=own.now;
  const result={...scope,type:'court_result',revision:state.revision,serverTime:own.now,playerId:own.playerId,seatEpoch:request.seatEpoch,sequence:request.sequence,result:reply.result,state};
  own.receive(result);own.receive(result);
  assert.equal(own.events.filter(e=>e.type==='result').length,1);assert.equal(own.sync.state.pendingShotId,null);
  assert.equal(own.sync.state.court?.revision,state.revision);assert.equal(own.sync.state.ownSeat?.attempts,1);
  if(horse)assert.deepEqual(own.sync.state.court?.horse,state.horse);
 }finally{clients.forEach(c=>c.sync.dispose());}
});

test('result seat may have a newer sequence but backwards revision and mismatched correlation remain rejected',()=>{
 const {clients,drain,shots}=serverHarness();clients.forEach(c=>c.sync.enter());drain();const own=clients[0];
 try{
 own.sync.shoot(gesture,releaseOffset);drain();const {reply,request}=shots[0];own.now=reply.resultServerTime!;
 const state=structuredClone(reply.state);state.serverTime=own.now;state.revision++;state.seats[0].sequence++;
 const result={...scope,type:'court_result',revision:state.revision,serverTime:own.now,playerId:own.playerId,seatEpoch:request.seatEpoch,sequence:request.sequence,result:reply.result,state};
 for(const bad of [
 {...result,revision:reply.state.revision-1,state:{...state,revision:reply.state.revision-1}},
 {...result,state:{...state,revision:state.revision+1}},
 {...result,playerId:'p1'}, {...result,seatEpoch:Number(request.seatEpoch)+1}, {...result,sequence:Number(request.sequence)+1},
 {...result,result:{...reply.result!,shotId:'s999-1'}}, {...result,result:{...reply.result!,spotId:4}},
 {...result,state:{...state,seats:state.seats.map(s=>s.playerId===own.playerId?{...s,sequence:0,attempts:0,makes:0}:s)}},
 ]){own.receive(bad);assert.equal(own.events.filter(e=>e.type==='result').length,0);}
 own.receive(result);own.receive(result);assert.equal(own.events.filter(e=>e.type==='result').length,1);
 assert.equal(own.sync.state.ownSeat?.sequence,2);assert.equal(own.sync.state.pendingShotId,null);
 }finally{clients.forEach(c=>c.sync.dispose());}
});

test('delayed own echo confirms with zero visual elapsed while remote echoes keep server age',()=>{
 const own=new Transport(),server=new CourtSession(scope);own.sync.enter();own.state(server.join(own.playerId,0,own.now).state);
 const launch=own.sync.shoot(gesture,releaseOffset)!;const request=own.outgoing.at(-1)!;
 const reply=server.handleRequest(own.playerId,request,own.now);const launchTime=own.now;
 const newcomer=new Transport('p1');
 try{
 own.now+=800;
 const echo={...scope,type:'court_shot',revision:reply.state.revision,serverTime:launchTime,playerId:own.playerId,seatEpoch:request.seatEpoch,sequence:request.sequence,launch:reply.launch};
 own.receive(echo);own.receive(echo);
 const events=own.events.filter(e=>e.type==='launch');assert.equal(events.length,2);
 const confirmation=events[1];assert.equal(confirmation.type==='launch'&&confirmation.reconcile,true);
 assert.equal(confirmation.type==='launch'&&confirmation.elapsedSeconds,0);
 newcomer.now=launchTime+1100;newcomer.sync.enter();newcomer.state(reply.state);newcomer.receive(echo);
 const event=newcomer.events.find(e=>e.type==='launch');assert.equal(event?.type==='launch'&&event.elapsedSeconds,1.1);
 }finally{own.sync.dispose();newcomer.sync.dispose();}
});
