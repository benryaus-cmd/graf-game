import { BASKETBALL_COURT } from '../game/basketballCourt';
import { BASKETBALL_MAX_FLICK_SPEED, launchFromFlick } from '../game/basketballPhysics';
import type { BasketballGesture, ShotLaunch, ShotResult } from '../game/basketballPhysics';
import { isAuthoritativeReleaseOrigin, readReleaseOffset, releaseOriginFromOffset, type ReleaseOffset } from '../game/basketballRelease';
import { BASKETBALL_CAPABILITY, type CourtState, type CourtSeat, type HorseState, type CourtRequest } from '../game/basketballSession';
import { MAIN_ROOM_ID, MAIN_WORLD_ID } from './config';
import type { Message } from './protocol';

export interface CourtConnection { connected: boolean; playerId: string | null; capabilities: readonly string[]; roomId: string | null; worldId: string | null; serverTime: number }
export type CourtListener = (message: Message | null, connection: CourtConnection) => void;
export interface CourtTransport { readonly courtConnection: CourtConnection; subscribeCourt(listener: CourtListener): () => void; sendCourt(message: Message): boolean }
export interface BasketballSyncView { connected: boolean; available: boolean; entered: boolean; court: CourtState | null; ownSeat: CourtSeat | null; pendingShotId: string | null; notice: string | null }
export type BasketballSyncEvent =
  | { type: 'launch'; launch: ShotLaunch; elapsedSeconds: number; own: boolean; reconcile: boolean }
  | { type: 'result'; playerId: string; result: ShotResult }
  | { type: 'reset'; shotId?: string };
export interface CourtLiveShot { playerId: string; seatEpoch: number; sequence: number; launch: ShotLaunch; serverTime: number }
const scope = { roomId: MAIN_ROOM_ID, mapId: BASKETBALL_COURT.mapId, courtId: BASKETBALL_COURT.id, version: 1 as const };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER - 6000;
const spot = (v: unknown): v is number => integer(v) && v < 5;
const scoped = (v: Record<string, unknown>) => v.roomId === scope.roomId && v.mapId === scope.mapId && v.courtId === scope.courtId;
const header = (v: Record<string, unknown>) => scoped(v) && v.version === 1 && integer(v.revision) && integer(v.serverTime);
const canonical = (epoch: number, sequence: number) => `s${epoch}-${sequence}`;

function readHorse(value: unknown, revision: number, serverTime: number): HorseState | null | undefined {
  if (value === null) return null;
  if (!object(value) || !scoped(value) || !integer(value.revision) || value.revision > revision || !integer(value.serverTime) || value.serverTime > serverTime ||
      !['invited', 'set', 'match', 'ended'].includes(String(value.phase)) || !spot(value.spotId)) return undefined;
  const fields = ['inviterId', 'inviteeId', 'setterId', 'matcherId'] as const;
  if (fields.some(field => !id(value[field])) || value.inviterId === value.inviteeId) return undefined;
  const members = [value.inviterId, value.inviteeId];
  if (!members.includes(value.setterId) || !members.includes(value.matcherId) || value.setterId === value.matcherId ||
      value.occupantId !== null && !members.includes(value.occupantId) || value.winnerId !== null && !members.includes(value.winnerId) ||
      ![null, 'letters', 'departure'].includes(value.endReason as null) || !object(value.letters) || Object.keys(value.letters).length !== 2 ||
      members.some(member => !['', 'H', 'HO', 'HOR', 'HORS', 'HORSE'].includes(String((value.letters as Record<string, unknown>)[member as string])))) return undefined;
  return { ...value, letters: { ...value.letters } } as unknown as HorseState;
}

/** Decode authority before any state is exposed to presentation. Missing liveShots is compatible. */
export function readBasketballCourtState(value: unknown): CourtState | null {
  if (!object(value) || !header(value) || !Array.isArray(value.seats) || value.seats.length > 5 || !integer(value.horseReadyAt)) return null;
  const seats: CourtSeat[] = [], players = new Set<string>(), spots = new Set<number>(), epochs = new Set<number>();
  for (const seat of value.seats) {
    if (!object(seat) || !id(seat.playerId) || !spot(seat.spotId) || !integer(seat.epoch) || seat.epoch === 0 || !integer(seat.sequence) ||
        !integer(seat.attempts) || !integer(seat.makes) || seat.makes > seat.attempts || seat.attempts > seat.sequence || !integer(seat.readyAt) ||
        seat.readyAt > (value.serverTime as number) + 3000 || players.has(seat.playerId) || spots.has(seat.spotId) || epochs.has(seat.epoch)) return null;
    players.add(seat.playerId); spots.add(seat.spotId); epochs.add(seat.epoch);
    seats.push({ playerId: seat.playerId, spotId: seat.spotId, epoch: seat.epoch, sequence: seat.sequence, attempts: seat.attempts, makes: seat.makes, readyAt: seat.readyAt });
  }
  const horse = readHorse(value.horse, value.revision as number, value.serverTime as number);
  if (horse === undefined || (value.horseReadyAt as number) > (value.serverTime as number) + 3000) return null;
  return { ...scope, revision: value.revision as number, serverTime: value.serverTime as number, seats, horse, horseReadyAt: value.horseReadyAt };
}
function readLaunch(value: unknown, seat: CourtSeat, sequence: number): ShotLaunch | null {
  if (!object(value) || value.version !== 1 || value.courtId !== scope.courtId || value.shotId !== canonical(seat.epoch, sequence) || value.spotId !== seat.spotId ||
      !Array.isArray(value.origin) || value.origin.length !== 3 || !value.origin.every(n => typeof n === 'number' && Number.isFinite(n)) ||
      !Array.isArray(value.velocity) || value.velocity.length !== 3 || !value.velocity.every(n => typeof n === 'number' && Number.isFinite(n)) ||
      Math.hypot(...value.velocity) > BASKETBALL_MAX_FLICK_SPEED + .00001) return null;
  const [x, y, z] = value.origin;
  const bounds = BASKETBALL_COURT.bounds;
  if (x < bounds.minX - 2 || x > bounds.maxX + 2 || z < bounds.minZ - 2 || z > bounds.maxZ + 2 || y < .4 || y > 2.8) return null;
  if (!isAuthoritativeReleaseOrigin(seat.spotId, [...value.origin] as ShotLaunch['origin'])) return null;
  return { courtId: scope.courtId, version: 1, shotId: value.shotId as string, spotId: seat.spotId,
    origin: [...value.origin] as ShotLaunch['origin'], velocity: [...value.velocity] as ShotLaunch['velocity'] };
}
function readShot(value: Record<string, unknown>, state: CourtState): CourtLiveShot | null {
  if (!id(value.playerId) || !integer(value.seatEpoch) || !integer(value.sequence) || value.sequence === 0 || !integer(value.serverTime)) return null;
  const seat = state.seats.find(seat => seat.playerId === value.playerId && seat.epoch === value.seatEpoch);
  if (!seat || value.sequence < seat.sequence || value.sequence > seat.sequence + 1) return null;
  const launch = readLaunch(value.launch, seat, value.sequence);
  return launch ? { playerId: value.playerId, seatEpoch: seat.epoch, sequence: value.sequence, serverTime: value.serverTime, launch } : null;
}
function readResult(value: unknown, seat: CourtSeat, sequence: number): ShotResult | null {
  if (!object(value) || value.version !== 1 || value.courtId !== scope.courtId || value.shotId !== canonical(seat.epoch, sequence) || value.spotId !== seat.spotId ||
      !['make', 'miss'].includes(String(value.outcome)) || typeof value.swish !== 'boolean' || value.outcome === 'miss' && value.swish) return null;
  return { courtId: scope.courtId, version: 1, shotId: value.shotId as string, spotId: seat.spotId, outcome: value.outcome as 'make' | 'miss', swish: value.swish };
}

/** One adapter on the admitted world's existing connection; no independent socket. */
export class BasketballSync {
  private connection: CourtConnection;
  private court: CourtState | null = null;
  private requestRevision = 0;
  private entered = false;
  private pendingShotId: string | null = null;
  private notice: string | null = null;
  private joinRetries = 0;
  private leaving = false;
  private leaveRetries = 0;
  private leaveRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private listeners = new Set<(view: BasketballSyncView, event?: BasketballSyncEvent) => void>();
  private launches = new Map<string, { sequence: number; serverTime: number; revision: number | null }>();
  private results = new Set<string>();
  private scheduled = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: () => void;
  constructor(private transport: CourtTransport) {
    this.connection = transport.courtConnection;
    this.unsubscribe = transport.subscribeCourt((message, connection) => this.accept(message, connection));
  }
  get state(): BasketballSyncView {
    return { connected: this.connection.connected, available: this.available(), entered: this.entered,
      court: this.court ? structuredClone(this.court) : null, ownSeat: this.ownSeat() ? { ...this.ownSeat()! } : null, pendingShotId: this.pendingShotId, notice: this.notice };
  }
  subscribe(listener: (view: BasketballSyncView, event?: BasketballSyncEvent) => void): () => void {
    this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener);
  }
  private available() { return !this.disposed && this.connection.connected && !!this.connection.playerId && this.connection.roomId === MAIN_ROOM_ID && this.connection.worldId === MAIN_WORLD_ID && this.connection.capabilities.includes(BASKETBALL_CAPABILITY); }
  private ownSeat() { return this.court?.seats.find(seat => seat.playerId === this.connection.playerId) ?? null; }
  private now() { return this.transport.courtConnection.serverTime; }
  private send(type: 'court_join' | 'court_leave' | 'court_state') { return this.available() && this.transport.sendCourt({ ...scope, type, revision: this.requestRevision }); }
  enter(spotId?: number): boolean {
    if (!this.available() || this.leaving || spotId !== undefined && (!spot(spotId) || this.court?.seats.some(seat => seat.spotId === spotId && seat.playerId !== this.connection.playerId) || this.court?.horse && !['ended', 'invited'].includes(this.court.horse.phase) && this.court.horse.spotId === spotId)) return false;
    if (this.entered) return true;
    this.entered = true; this.joinRetries = 0; this.notice = null;
    if (!this.send('court_join')) { this.entered = false; this.emit(); return false; }
    this.emit(); return true;
  }
  leave(): void {
    if (this.entered || this.ownSeat()) { this.leaving = true; this.leaveRetries = 0; this.send('court_leave'); }
    this.entered = false; this.pendingShotId = null; this.clearFlight(); this.emit({ type: 'reset' });
  }
  shoot(gesture: BasketballGesture, releaseOffset: ReleaseOffset): ShotLaunch | null {
    const seat = this.ownSeat(), offset = readReleaseOffset(releaseOffset);
    if (!this.available() || !this.entered || !seat || !offset || this.pendingShotId || this.now() < seat.readyAt || this.court?.horse && this.court.horse.phase !== 'ended') return null;
    const origin = releaseOriginFromOffset(seat.spotId, offset);
    const launch = origin && launchFromFlick(seat.spotId, gesture, origin);
    if (!launch) return null;
    const sequence = seat.sequence + 1; launch.shotId = canonical(seat.epoch, sequence);
    const request: CourtRequest = { ...scope, type: 'court_shot', revision: this.requestRevision, seatEpoch: seat.epoch, sequence, shotId: launch.shotId, gesture: { ...gesture }, releaseOffset: offset };
    this.pendingShotId = launch.shotId;
    // Emit before send: mocked or in-process transports may echo synchronously.
    this.emit({ type: 'launch', launch, elapsedSeconds: 0, own: true, reconcile: false });
    if (!this.transport.sendCourt({ ...request })) { const shotId = this.pendingShotId; this.pendingShotId = null; this.emit({ type: 'reset', ...(shotId ? { shotId } : {}) }); return null; }
    if (this.pendingShotId === launch.shotId) this.pendingTimer = setTimeout(() => {
      if (!this.entered || !this.available() || this.pendingShotId !== launch.shotId) return;
      this.pendingShotId = null; this.pendingTimer = null; this.notice = 'Shot confirmation timed out';
      this.emit({ type: 'reset', shotId: launch.shotId }); this.send('court_state');
    }, 6000);
    return launch;
  }
  dispose(): void { if (this.disposed) return; this.leave(); this.disposed = true; this.clearLeaveRecovery(); this.unsubscribe(); this.listeners.clear(); }
  private clearLeaveRecovery() { if (this.leaveRecoveryTimer) clearTimeout(this.leaveRecoveryTimer); this.leaveRecoveryTimer = null; }
  private recoverLeave() {
    if (this.leaveRecoveryTimer || !this.leaving || !this.available()) return;
    // Contention must not abandon a reserved seat. One paced retry is retained until
    // authority confirms departure or the owning world connection goes away.
    this.leaveRecoveryTimer = setTimeout(() => {
      this.leaveRecoveryTimer = null;
      if (this.leaving && this.available()) { this.send('court_state'); this.send('court_leave'); }
    }, 2000);
  }
  private clearPendingTimer() { if (this.pendingTimer) clearTimeout(this.pendingTimer); this.pendingTimer = null; }
  private clearFlight() { this.clearPendingTimer(); for (const timer of this.scheduled.values()) clearTimeout(timer); this.scheduled.clear(); this.launches.clear(); this.results.clear(); }
  private emit(event?: BasketballSyncEvent) { if (!this.disposed) for (const listener of this.listeners) listener(this.state, event); }
  private adopt(state: CourtState) {
    if (this.court && (state.revision < this.court.revision || state.serverTime < this.court.serverTime)) return false;
    const oldSeat = this.ownSeat(); this.court = state; this.requestRevision = Math.max(this.requestRevision, state.revision);
    if (this.leaving && !this.ownSeat()) { this.leaving = false; this.clearLeaveRecovery(); }
    if (oldSeat && oldSeat.epoch !== this.ownSeat()?.epoch) { this.pendingShotId = null; this.clearFlight(); this.emit({ type: 'reset' }); }
    return true;
  }
  private accept(message: Message | null, connection: CourtConnection) {
    if (this.disposed) return;
    const changed = connection.playerId !== this.connection.playerId;
    const wasConnected = this.connection.connected;
    this.connection = connection;
    if (changed || !this.available()) {
      const hadCourt = this.entered || this.leaving || !!this.court || !!this.pendingShotId;
      this.entered = false; this.leaving = false; this.court = null; this.requestRevision = 0; this.pendingShotId = null; this.notice = null; this.clearLeaveRecovery(); this.clearFlight();
      if (changed || wasConnected !== connection.connected || hadCourt) this.emit({ type: 'reset' }); return;
    }
    if (!message) { this.emit(); return; }
    if (!object(message) || !header(message)) return;
    // No court event is visible until this client explicitly enters this court.
    if (!this.entered && !this.leaving) return;
    if (message.type === 'court_state' || message.type === 'court_rejected') {
      const state = readBasketballCourtState(message.state);
      if (!state || state.revision !== message.revision || state.serverTime > (message.serverTime as number) || (message.serverTime as number) > connection.serverTime + 1000) return;
      const live: CourtLiveShot[] = [];
      const raw = (message.state as Record<string, unknown>).liveShots;
      if (raw !== undefined) {
        if (!Array.isArray(raw) || raw.length > 5) return;
        const liveIds = new Set<string>();
        for (const item of raw) {
          if (!object(item)) return;
          const shot = readShot(item, state);
          if (!shot || shot.serverTime > (message.serverTime as number) || liveIds.has(shot.launch.shotId)) return;
          liveIds.add(shot.launch.shotId); live.push(shot);
        }
      }
      if (message.type === 'court_rejected' && (!['court_join', 'court_leave', 'court_state', 'court_shot'].includes(String(message.requestType)) || !['stale', 'invalid', 'full', 'seat', 'duplicate', 'sequence', 'gesture', 'turn', 'mark', 'invitation', 'ended', 'busy'].includes(String(message.reason)))) return;
      if (!this.adopt(state)) return;
      if (message.type === 'court_rejected') {
        this.notice = String(message.reason);
        if (message.requestType === 'court_shot' && this.pendingShotId) { const shotId = this.pendingShotId; this.pendingShotId = null; this.clearPendingTimer(); this.launches.delete(shotId); this.emit({ type: 'reset', shotId }); }
        if (message.requestType === 'court_join') {
          if (message.reason === 'stale' && this.entered && !this.ownSeat() && this.joinRetries++ < 5) this.send('court_join');
          else if (!this.ownSeat()) this.entered = false;
        }
        if (message.requestType === 'court_leave' && message.reason === 'stale' && this.leaving) {
          if (this.leaveRetries++ < 5) this.send('court_leave');
          else { this.notice = 'Leaving court…'; this.recoverLeave(); }
        }
      }
      if (this.entered) for (const shot of live) this.launch(shot, null);
      this.emit(); return;
    }
    if (!this.entered || !this.court) return;
    if (message.type === 'court_shot') {
      if ((message.revision as number) < this.court.revision) return;
      const shot = readShot(message, this.court);
      if (shot && shot.serverTime <= connection.serverTime + 250) this.launch(shot, message.revision as number);
    } else if (message.type === 'court_result') {
      const state = readBasketballCourtState(message.state);
      if (!state || state.revision !== message.revision || state.serverTime > (message.serverTime as number) || !id(message.playerId) || !integer(message.sequence) || !integer(message.seatEpoch)) return;
      const seat = this.court.seats.find(seat => seat.playerId === message.playerId && seat.epoch === message.seatEpoch);
      const resultSeat = state.seats.find(seat => seat.playerId === message.playerId && seat.epoch === message.seatEpoch);
      const result = seat && readResult(message.result, seat, message.sequence);
      const accepted = result && this.launches.get(result.shotId);
      if (!seat || !resultSeat || resultSeat.sequence !== message.sequence || !result || !accepted || accepted.sequence !== message.sequence || accepted.revision !== null && accepted.revision !== message.revision || this.results.has(result.shotId) || this.scheduled.has(result.shotId)) return;
      const delay = (message.serverTime as number) - connection.serverTime;
      if (delay < 0 && (message.serverTime as number) < accepted.serverTime || delay > 3000) return;
      const apply = () => {
        this.scheduled.delete(result.shotId);
        if (!this.entered || !this.available() || this.results.has(result.shotId) || !this.court?.seats.some(s => s.playerId === message.playerId && s.epoch === message.seatEpoch)) return;
        this.results.add(result.shotId); this.adopt(state);
        if (this.pendingShotId === result.shotId) { this.pendingShotId = null; this.clearPendingTimer(); }
        this.emit({ type: 'result', playerId: message.playerId as string, result });
      };
      if (delay > 0) this.scheduled.set(result.shotId, setTimeout(apply, delay)); else apply();
    }
  }
  private launch(shot: CourtLiveShot, revision: number | null) {
    const elapsedSeconds = Math.max(0, (this.now() - shot.serverTime) / 1000);
    if (this.launches.has(shot.launch.shotId) || this.results.has(shot.launch.shotId)) return;
    if (revision !== null) this.requestRevision = Math.max(this.requestRevision, revision);
    this.launches.set(shot.launch.shotId, { sequence: shot.sequence, serverTime: shot.serverTime, revision });
    while (this.launches.size > 256) { const oldest = this.launches.keys().next().value!; this.launches.delete(oldest); this.results.delete(oldest); }
    if (elapsedSeconds >= 3) return;
    this.emit({ type: 'launch', launch: shot.launch, elapsedSeconds, own: shot.playerId === this.connection.playerId,
      reconcile: shot.playerId === this.connection.playerId && this.pendingShotId === shot.launch.shotId });
  }
}
