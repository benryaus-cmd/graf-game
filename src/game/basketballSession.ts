import { BASKETBALL_COURT } from './basketballCourt';
import { BASKETBALL_LIFETIME_SECONDS, createBall, launchFromFlick, stepBall } from './basketballPhysics';
import type { BasketballGesture, ShotLaunch, ShotResult } from './basketballPhysics';

/** Proposal only: the deployed multiplayer service does not advertise this capability. */
export const BASKETBALL_CAPABILITY = 'basketball_court_v1';
export const COURT_PROTOCOL_VERSION = 1;
export const COURT_LIMITS = { idLength: 64, recentShots: 256, messageBytes: 4096, seats: 5 } as const;

export interface CourtScope { roomId: string; mapId: string; courtId: string }
type ScopedRequest = CourtScope & { version: 1; revision: number };
export type CourtRequest = ScopedRequest & (
  | { type: 'court_join' | 'court_leave' | 'court_state' }
  | { type: 'court_shot'; shotId: string; sequence: number; seatEpoch: number; gesture: BasketballGesture }
  | { type: 'horse_invite'; inviteeId: string; spotId: number }
  | { type: 'horse_accept' }
);
export interface CourtSeat { playerId: string; spotId: number; epoch: number; sequence: number; attempts: number; makes: number; readyAt: number }
export interface HorseState extends CourtScope {
  revision: number; serverTime: number; phase: 'invited' | 'set' | 'match' | 'ended';
  inviterId: string; inviteeId: string; setterId: string; matcherId: string; spotId: number;
  occupantId: string | null; letters: Record<string, string>; winnerId: string | null;
  endReason: 'letters' | 'departure' | null;
}
export interface CourtState extends CourtScope {
  version: 1; revision: number; serverTime: number; seats: CourtSeat[]; horse: HorseState | null;
  horseReadyAt: number;
}
export type CourtReason = 'stale' | 'invalid' | 'full' | 'seat' | 'duplicate' | 'sequence' | 'gesture' | 'turn' | 'mark' | 'invitation' | 'ended' | 'busy';
export interface SessionReply<T> { ok: boolean; reason?: CourtReason; state: T; launch?: ShotLaunch; result?: ShotResult; resultServerTime?: number }
export type CourtResponse = CourtScope & { version: 1; revision: number; serverTime: number } & (
  | { type: 'court_state'; state: CourtState }
  | { type: 'court_rejected'; requestType: CourtRequest['type']; reason: CourtReason; state: CourtState }
  | { type: 'court_shot'; playerId: string; seatEpoch: number; sequence: number; launch: ShotLaunch }
  | { type: 'court_result'; playerId: string; seatEpoch: number; sequence: number; result: ShotResult; state: CourtState }
);

const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validTime = (value: unknown): value is number => integer(value) && value <= Number.MAX_SAFE_INTEGER - BASKETBALL_LIFETIME_SECONDS * 1000;
const validSpot = (value: unknown): value is number => integer(value) && value < COURT_LIMITS.seats;
const validScope = (scope: CourtScope) => validId(scope.roomId) && scope.mapId === BASKETBALL_COURT.mapId && scope.courtId === BASKETBALL_COURT.id;
const validGesture = (value: unknown): value is BasketballGesture => {
  if (!value || typeof value !== 'object') return false;
  const g = value as Record<string, unknown>;
  return typeof g.dx === 'number' && Number.isFinite(g.dx) && Math.abs(g.dx) <= 2
    && typeof g.dy === 'number' && Number.isFinite(g.dy) && g.dy >= 0 && g.dy <= 2
    && typeof g.durationMs === 'number' && Number.isFinite(g.durationMs) && g.durationMs > 0 && g.durationMs <= 2000;
};
/** Parse JSON's already-decoded value; the adapter must enforce messageBytes before JSON.parse. */
export function readCourtRequest(value: unknown): CourtRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!validId(data.roomId) || !validId(data.mapId) || !validId(data.courtId) || data.version !== 1 || !integer(data.revision)) return null;
  const base: ScopedRequest = { roomId: data.roomId, mapId: data.mapId, courtId: data.courtId, version: 1, revision: data.revision };
  if (data.type === 'court_join' || data.type === 'court_leave' || data.type === 'court_state' || data.type === 'horse_accept') return { ...base, type: data.type };
  if (data.type === 'horse_invite' && validId(data.inviteeId) && validSpot(data.spotId)) return { ...base, type: data.type, inviteeId: data.inviteeId, spotId: data.spotId };
  if (data.type === 'court_shot' && validId(data.shotId) && integer(data.sequence) && data.sequence > 0 && integer(data.seatEpoch) && data.seatEpoch > 0 && data.shotId === `s${data.seatEpoch}-${data.sequence}` && validGesture(data.gesture)) {
    const { dx, dy, durationMs } = data.gesture;
    return { ...base, type: data.type, shotId: data.shotId, sequence: data.sequence, seatEpoch: data.seatEpoch, gesture: { dx, dy, durationMs } };
  }
  return null;
}
function remember(ids: Set<string>, id: string) {
  ids.add(id);
  if (ids.size > COURT_LIMITS.recentShots) ids.delete(ids.values().next().value!);
}
function scopeCopy(scope: CourtScope): CourtScope { return { roomId: scope.roomId, mapId: scope.mapId, courtId: scope.courtId }; }

/** Two-player pure rules. resolveShot accepts trusted simulation output, never a wire success flag. */
export class HorseSession {
  private state: HorseState;
  private seenShots = new Set<string>();
  constructor(scope: CourtScope, inviterId: string, inviteeId: string, spotId: number, serverTime = 0) {
    if (!validScope(scope) || !validId(inviterId) || !validId(inviteeId) || inviterId === inviteeId || !validSpot(spotId) || !validTime(serverTime)) throw new Error('Invalid HORSE invitation');
    this.state = { ...scopeCopy(scope), revision: 0, serverTime, phase: 'invited', inviterId, inviteeId, setterId: inviterId, matcherId: inviteeId, spotId,
      occupantId: null, letters: { [inviterId]: '', [inviteeId]: '' }, winnerId: null, endReason: null };
  }
  snapshot(): HorseState { return { ...this.state, letters: { ...this.state.letters } }; }
  private reply(reason?: CourtReason): SessionReply<HorseState> { return { ok: !reason, ...(reason ? { reason } : {}), state: this.snapshot() }; }
  private guard(revision: number, serverTime: number): CourtReason | undefined {
    if (!integer(revision) || revision >= Number.MAX_SAFE_INTEGER || !validTime(serverTime) || serverTime < this.state.serverTime) return 'invalid';
    if (revision !== this.state.revision) return 'stale';
    return undefined;
  }
  private advance(serverTime: number) { this.state.revision++; this.state.serverTime = serverTime; }
  accept(playerId: string, revision: number, serverTime: number): SessionReply<HorseState> {
    const error = this.guard(revision, serverTime);
    if (error) return this.reply(error);
    if (this.state.phase !== 'invited' || playerId !== this.state.inviteeId) return this.reply('invitation');
    this.state.phase = 'set'; this.state.occupantId = this.state.setterId; this.advance(serverTime);
    return this.reply();
  }
  resolveShot(playerId: string, result: ShotResult, revision: number, serverTime: number): SessionReply<HorseState> {
    const error = this.guard(revision, serverTime);
    if (error) return this.reply(error);
    if (this.state.phase === 'ended') return this.reply('ended');
    if (this.state.phase === 'invited' || playerId !== this.state.occupantId) return this.reply('turn');
    if (result.spotId !== this.state.spotId || result.courtId !== this.state.courtId || result.version !== 1) return this.reply('mark');
    if (!validId(result.shotId) || (result.outcome !== 'make' && result.outcome !== 'miss')) return this.reply('invalid');
    if (this.seenShots.has(result.shotId)) return this.reply('duplicate');
    remember(this.seenShots, result.shotId);
    if (this.state.phase === 'set') {
      if (result.outcome === 'make') { this.state.phase = 'match'; this.state.occupantId = this.state.matcherId; }
      else {
        [this.state.setterId, this.state.matcherId] = [this.state.matcherId, this.state.setterId];
        this.state.occupantId = this.state.setterId;
      }
    } else {
      if (result.outcome === 'miss') {
        const letters = this.state.letters[this.state.matcherId]!;
        this.state.letters[this.state.matcherId] = 'HORSE'.slice(0, letters.length + 1);
        if (letters.length === 4) {
          this.state.phase = 'ended'; this.state.winnerId = this.state.setterId; this.state.endReason = 'letters'; this.state.occupantId = null;
        }
      }
      if (this.state.phase !== 'ended') { this.state.phase = 'set'; this.state.occupantId = this.state.setterId; }
    }
    this.advance(serverTime); return this.reply();
  }
  leave(playerId: string, revision: number, serverTime: number): SessionReply<HorseState> {
    const error = this.guard(revision, serverTime);
    if (error) return this.reply(error);
    if (playerId !== this.state.inviterId && playerId !== this.state.inviteeId) return this.reply('seat');
    if (this.state.phase === 'ended') return this.reply();
    this.state.phase = 'ended'; this.state.endReason = 'departure'; this.state.occupantId = null;
    this.state.winnerId = playerId === this.state.inviterId ? this.state.inviteeId : this.state.inviterId;
    this.advance(serverTime); return this.reply();
  }
}

/** One instance per isolated (roomId,mapId,courtId); serialize all calls in the existing server. */
export class CourtSession {
  private readonly scope: CourtScope;
  private seats: CourtSeat[] = [];
  private revision = 0;
  private serverTime = 0;
  private nextEpoch = 1;
  private seenShots = new Set<string>();
  private horse: HorseSession | null = null;
  private horseReadyAt = 0;
  constructor(scope: CourtScope) {
    if (!validScope(scope)) throw new Error('Invalid basketball court scope');
    this.scope = scopeCopy(scope);
  }
  snapshot(): CourtState {
    return { ...this.scope, version: 1, revision: this.revision, serverTime: this.serverTime, seats: this.seats.map(seat => ({ ...seat })), horse: this.horse?.snapshot() ?? null, horseReadyAt: this.horseReadyAt };
  }
  /** Bind playerId from the authenticated connection; never from the decoded payload. */
  handleRequest(playerId: string, value: unknown, serverTime: number): SessionReply<CourtState> {
    const request = readCourtRequest(value);
    if (!validId(playerId) || !request || !validTime(serverTime) || request.roomId !== this.scope.roomId || request.mapId !== this.scope.mapId || request.courtId !== this.scope.courtId) return this.reply('invalid');
    switch (request.type) {
      case 'court_state': return this.reply();
      case 'court_join': return this.join(playerId, request.revision, serverTime);
      case 'court_leave': return this.leave(playerId, request.revision, serverTime);
      case 'court_shot': return this.shoot(playerId, request, request.revision, serverTime);
      case 'horse_invite': return this.inviteHorse(playerId, request.inviteeId, request.spotId, request.revision, serverTime);
      case 'horse_accept': return this.acceptHorse(playerId, request.revision, serverTime);
    }
  }
  private reply(reason?: CourtReason): SessionReply<CourtState> { return { ok: !reason, ...(reason ? { reason } : {}), state: this.snapshot() }; }
  private guard(revision: number, serverTime: number): CourtReason | undefined {
    if (!integer(revision) || revision >= Number.MAX_SAFE_INTEGER || !validTime(serverTime) || serverTime < this.serverTime) return 'invalid';
    if (revision !== this.revision) return 'stale';
    return undefined;
  }
  private advance(serverTime: number) { this.revision++; this.serverTime = serverTime; }
  private reservedSpot(): number | null {
    const horse = this.horse?.snapshot();
    return horse && horse.phase !== 'ended' && horse.phase !== 'invited' ? horse.spotId : null;
  }
  join(playerId: string, revision: number, serverTime: number): SessionReply<CourtState> {
    const error = this.guard(revision, serverTime);
    if (error) return this.reply(error);
    if (!validId(playerId)) return this.reply('invalid');
    if (this.seats.some(seat => seat.playerId === playerId)) return this.reply();
    const spot = BASKETBALL_COURT.spots.find(spot => spot.id !== this.reservedSpot() && !this.seats.some(seat => seat.spotId === spot.id));
    if (!spot) return this.reply('full');
    this.seats.push({ playerId, spotId: spot.id, epoch: this.nextEpoch++, sequence: 0, attempts: 0, makes: 0, readyAt: serverTime });
    this.advance(serverTime); return this.reply();
  }
  /** Disconnect handlers call with snapshot().revision, not a departed client's stale revision. */
  leave(playerId: string, revision: number, serverTime: number): SessionReply<CourtState> {
    const error = this.guard(revision, serverTime);
    if (error) return this.reply(error);
    if (!this.seats.some(seat => seat.playerId === playerId)) return this.reply('seat');
    this.seats = this.seats.filter(seat => seat.playerId !== playerId);
    const horse = this.horse?.snapshot();
    if (horse && (playerId === horse.inviterId || playerId === horse.inviteeId)) this.horse!.leave(playerId, horse.revision, serverTime);
    this.advance(serverTime); return this.reply();
  }
  inviteHorse(playerId: string, inviteeId: string, spotId: number, revision: number, serverTime: number): SessionReply<CourtState> {
    const error = this.guard(revision, serverTime);
    if (error) return this.reply(error);
    if (!this.seats.some(seat => seat.playerId === playerId) || !this.seats.some(seat => seat.playerId === inviteeId) || playerId === inviteeId) return this.reply('invitation');
    if (this.horse && this.horse.snapshot().phase !== 'ended') return this.reply('busy');
    if (!validSpot(spotId) || this.seats.some(seat => seat.spotId === spotId)) return this.reply('mark');
    this.horse = new HorseSession(this.scope, playerId, inviteeId, spotId, serverTime);
    this.advance(serverTime); return this.reply();
  }
  acceptHorse(playerId: string, revision: number, serverTime: number): SessionReply<CourtState> {
    const error = this.guard(revision, serverTime);
    if (error) return this.reply(error);
    const horse = this.horse?.snapshot();
    if (!horse || horse.phase !== 'invited') return this.reply('invitation');
    if (this.seats.some(seat => seat.spotId === horse.spotId)) return this.reply('mark');
    const accepted = this.horse!.accept(playerId, horse.revision, serverTime);
    if (!accepted.ok) return this.reply(accepted.reason);
    this.horseReadyAt = serverTime; this.advance(serverTime); return this.reply();
  }
  shoot(playerId: string, shot: { shotId: string; sequence: number; seatEpoch: number; gesture: BasketballGesture }, revision: number, serverTime: number): SessionReply<CourtState> {
    const error = this.guard(revision, serverTime);
    if (error) return this.reply(error);
    const seat = this.seats.find(seat => seat.playerId === playerId);
    if (!seat || shot.seatEpoch !== seat.epoch) return this.reply('seat');
    if (!validId(shot.shotId) || !integer(shot.sequence)) return this.reply('invalid');
    if (this.seenShots.has(shot.shotId)) return this.reply('duplicate');
    if (shot.sequence <= seat.sequence) return this.reply('sequence');
    if (!validGesture(shot.gesture)) return this.reply('gesture');
    const horse = this.horse?.snapshot();
    const participating = horse && horse.phase !== 'ended' && horse.phase !== 'invited' && (playerId === horse.inviterId || playerId === horse.inviteeId);
    if (participating && horse.occupantId !== playerId) return this.reply('turn');
    if (serverTime < seat.readyAt || (participating && serverTime < this.horseReadyAt)) return this.reply('busy');
    if (shot.shotId !== `s${seat.epoch}-${shot.sequence}`) return this.reply('invalid');
    const launch = launchFromFlick(participating ? horse.spotId : seat.spotId, shot.gesture);
    if (!launch) return this.reply('gesture');
    launch.shotId = shot.shotId;
    const ball = createBall(launch);
    let result: ShotResult | null = null;
    // Exact same launch and physics as presentation. At most 360 fixed steps per command.
    for (let step = 0; step < 360 && !result; step++) result = stepBall(ball, 1 / 120);
    if (!result) result = stepBall(ball, 1 / 120);
    if (!result) throw new Error('Basketball simulation produced no terminal result');
    remember(this.seenShots, shot.shotId);
    seat.sequence = shot.sequence; seat.attempts++; if (result.outcome === 'make') seat.makes++;
    seat.readyAt = serverTime + BASKETBALL_LIFETIME_SECONDS * 1000;
    if (participating) {
      this.horse!.resolveShot(playerId, result, horse.revision, serverTime);
      this.horseReadyAt = serverTime + BASKETBALL_LIFETIME_SECONDS * 1000;
    }
    this.advance(serverTime);
    return { ...this.reply(), launch, result, resultServerTime: serverTime + Math.round(ball.ageSeconds * 1000) };
  }
}
