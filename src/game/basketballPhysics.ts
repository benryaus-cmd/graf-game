import { BASKETBALL_COURT as court } from './basketballCourt';
export type BasketballVector = [number, number, number];
/** Final release movement normalized by .65 of the shorter viewport edge; upward dy is positive. */
export interface BasketballGesture { dx: number; dy: number; durationMs: number }
export interface ShotLaunch {
    courtId: string; shotId: string; spotId: number; version: 1;
    origin: BasketballVector; velocity: BasketballVector;
}
export interface ShotResult {
    courtId: string; shotId: string; spotId: number; version: 1;
    outcome: 'make' | 'miss'; swish: boolean;
}
export interface BasketballBall {
    launch: ShotLaunch; position: BasketballVector; velocity: BasketballVector;
    ageSeconds: number; scored: boolean; expired: boolean; contacted: boolean;
    simulatedSeconds: number; resultEmitted: boolean;
}
export const BASKETBALL_SHOT_VERSION = 1;
export const BASKETBALL_LIFETIME_SECONDS = 3;
export const BASKETBALL_MAX_FLICK_SPEED = 8.1;
const GRAVITY = 9.81, FIXED_STEP = 1 / 120;
let nextShotId = 0;

/** Shared by the preview and launch; callers validate or clamp their gesture. */
export function basketballFlickSpeed(gesture: Pick<BasketballGesture, 'dy' | 'durationMs'>): number {
    const rate = Math.max(0, gesture.dy / (gesture.durationMs / 1000));
    // A broad gentle-release range, then a soft ceiling for deliberate full flicks.
    return BASKETBALL_MAX_FLICK_SPEED * (1 - Math.exp(-Math.pow(rate / 1.57, 1.5)));
}

export function launchFromFlick(spotId: number, gesture: BasketballGesture, releaseOrigin?: BasketballVector): ShotLaunch | null {
    const spot = court.spots.find(s => s.id === spotId);
    const { dx, dy, durationMs } = gesture;
    if (!spot || ![dx, dy, durationMs].every(Number.isFinite) || Math.abs(dx) > 1 || dy < 0 || dy > 1 || durationMs < 40 || durationMs > 2000 || releaseOrigin && !releaseOrigin.every(Number.isFinite)) return null;
    const [x, , z] = releaseOrigin ?? spot.position;
    const aim = Math.atan2(court.rim.center[0] - x, court.rim.center[2] - z) - Math.atan2(dx, dy);
    // Fixed elevation leaves direction and actual release speed as learnable controls.
    const speed = basketballFlickSpeed(gesture);
    const elevation = 58 * Math.PI / 180, horizontal = speed * Math.cos(elevation);
    return { courtId: court.id, shotId: `local-${++nextShotId}`, spotId, version: 1,
        origin: releaseOrigin ? [...releaseOrigin] : [x + Math.sin(aim) * .25, 1.7, z + Math.cos(aim) * .25],
        velocity: speed === 0 ? [0, 0, 0] : [Math.sin(aim) * horizontal, speed * Math.sin(elevation), Math.cos(aim) * horizontal] };
}
export function createBall(launch: ShotLaunch, elapsedSeconds = 0): BasketballBall {
    const ball: BasketballBall = { launch: { ...launch, origin: [...launch.origin], velocity: [...launch.velocity] },
        position: [...launch.origin], velocity: [...launch.velocity], ageSeconds: 0, simulatedSeconds: 0,
        scored: false, expired: false, contacted: false, resultEmitted: false };
    if (elapsedSeconds > 0) stepBall(ball, elapsedSeconds);
    return ball;
}
function result(ball: BasketballBall, outcome: 'make' | 'miss'): ShotResult {
    ball.resultEmitted = true;
    const { courtId, shotId, spotId, version } = ball.launch;
    return { courtId, shotId, spotId, version, outcome, swish: outcome === 'make' && !ball.contacted };
}
type Contact = { distance: number; normal: BasketballVector };
const CONTACT_EPSILON = .00001;
const rimExtent = court.rim.radius + court.rim.tubeRadius + court.ballRadius;
const rimBounds = { min: [court.rim.center[0] - rimExtent, court.rim.center[1] - court.rim.tubeRadius - court.ballRadius, court.rim.center[2] - rimExtent],
    max: [court.rim.center[0] + rimExtent, court.rim.center[1] + court.rim.tubeRadius + court.ballRadius, court.rim.center[2] + rimExtent] };
const boardBounds = { min: [court.backboard.bounds.minX - court.ballRadius, court.backboard.bounds.minY - court.ballRadius, court.backboard.bounds.minZ - court.ballRadius],
    max: [court.backboard.bounds.maxX + court.ballRadius, court.backboard.bounds.maxY + court.ballRadius, court.backboard.bounds.maxZ + court.ballRadius] };
function rimContact(p: BasketballVector): Contact {
    const [rx, ry, rz] = court.rim.center;
    const radial = Math.hypot(p[0] - rx, p[2] - rz);
    const qx = rx + (radial > 1e-10 ? (p[0] - rx) / radial : 1) * court.rim.radius;
    const qz = rz + (radial > 1e-10 ? (p[2] - rz) / radial : 0) * court.rim.radius;
    const offset: BasketballVector = [p[0] - qx, p[1] - ry, p[2] - qz];
    const length = Math.hypot(...offset);
    return { distance: length - court.ballRadius - court.rim.tubeRadius,
        normal: length > 1e-10 ? offset.map(n => n / length) as BasketballVector : [0, 1, 0] };
}
function boardContact(p: BasketballVector): Contact {
    const board = court.backboard;
    const half = [board.width / 2, board.height / 2, board.depth / 2];
    const local = p.map((value, axis) => value - board.center[axis]);
    const offset = local.map((value, axis) => value - Math.max(-half[axis], Math.min(half[axis], value)));
    const length = Math.hypot(...offset);
    if (length > 1e-10) return { distance: length - court.ballRadius, normal: offset.map(n => n / length) as BasketballVector };
    // A malformed/late remote origin inside the board still escapes through its nearest face.
    let axis = 0;
    for (let i = 1; i < 3; i++) if (half[i] - Math.abs(local[i]) < half[axis] - Math.abs(local[axis])) axis = i;
    const normal: BasketballVector = [0, 0, 0]; normal[axis] = local[axis] >= 0 ? 1 : -1;
    return { distance: -(half[axis] - Math.abs(local[axis])) - court.ballRadius, normal };
}
/** Conservative advancement against signed sphere/solid distance. It sweeps the whole
 * segment, so fast and grazing contacts do not depend on an endpoint overlapping. */
function sweep(start: BasketballVector, end: BasketballVector, contact: (p: BasketballVector) => Contact, bounds: typeof rimBounds): { fraction: number; contact: Contact } | null {
    // Most of a flight is far from either prop: reject with six numeric bounds checks.
    for (let axis = 0; axis < 3; axis++) if (Math.min(start[axis], end[axis]) > bounds.max[axis] || Math.max(start[axis], end[axis]) < bounds.min[axis]) return null;
    const movement = end.map((value, axis) => value - start[axis]);
    const length = Math.hypot(...movement);
    if (length < 1e-12) return null;
    let fraction = 0;
    for (let iteration = 0; iteration < 24; iteration++) {
        const p = start.map((value, axis) => value + movement[axis] * fraction) as BasketballVector;
        const hit = contact(p);
        if (hit.distance <= CONTACT_EPSILON) {
            const inward = movement.reduce((sum, value, axis) => sum + value * hit.normal[axis], 0);
            if (inward < -1e-10 || hit.distance < -CONTACT_EPSILON) return { fraction, contact: hit };
            return null;
        }
        fraction += hit.distance / length;
        if (fraction > 1) return null;
    }
    // The bounded sweep can converge slowly near a tangent; an endpoint overlap still resolves.
    const hit = contact(end);
    return hit.distance < 0 ? { fraction: 1, contact: hit } : null;
}
function scoreSegment(ball: BasketballBall, old: BasketballVector, p: BasketballVector): ShotResult | null {
    const [rx, ry, rz] = court.rim.center;
    if (!ball.resultEmitted && old[1] > ry && p[1] <= ry) {
        const fraction = (old[1] - ry) / (old[1] - p[1]);
        const x = old[0] + (p[0] - old[0]) * fraction, z = old[2] + (p[2] - old[2]) * fraction;
        const clearance = court.rim.radius - court.rim.tubeRadius - court.ballRadius;
        if (Math.hypot(x - rx, z - rz) <= clearance) { ball.scored = true; return result(ball, 'make'); }
    }
    return null;
}
function advance(ball: BasketballBall, dt: number): ShotResult | null {
    const p = ball.position, v = ball.velocity;
    // Half-step gravity preserves the original ballistic arc while collisions can consume
    // the remaining part of this fixed step using their reflected velocity.
    v[1] -= GRAVITY * dt / 2;
    let remaining = dt, event: ShotResult | null = null;
    for (let collision = 0; collision < 3 && remaining > 1e-9; collision++) {
        const start: BasketballVector = [...p];
        const end = p.map((value, axis) => value + v[axis] * remaining) as BasketballVector;
        const rim = sweep(start, end, rimContact, rimBounds), board = sweep(start, end, boardContact, boardBounds);
        const hit = rim && (!board || rim.fraction <= board.fraction) ? { ...rim, restitution: .55 } : board ? { ...board, restitution: .65 } : null;
        const fraction = hit?.fraction ?? 1;
        for (let axis = 0; axis < 3; axis++) p[axis] = start[axis] + (end[axis] - start[axis]) * fraction;
        event = scoreSegment(ball, start, p) ?? event;
        if (!hit) break;
        const { normal, distance } = hit.contact;
        const inward = v.reduce((sum, value, axis) => sum + value * normal[axis], 0);
        for (let axis = 0; axis < 3; axis++) {
            p[axis] += normal[axis] * Math.max(CONTACT_EPSILON, CONTACT_EPSILON - distance);
            if (inward < 0) v[axis] -= (1 + hit.restitution) * inward * normal[axis];
        }
        ball.contacted = true;
        remaining *= 1 - fraction;
    }
    v[1] -= GRAVITY * dt / 2;
    if (p[1] < court.ballRadius) { p[1] = court.ballRadius; if (v[1] < 0) v[1] *= -.62; v[0] *= .82; v[2] *= .82; ball.contacted = true; }
    return event;
}
/** Mutates a ball by elapsed wallclock DELTA, independent of animation movement clamping.
 * At most 360 physical substeps ever run for a shot. The first make/miss is emitted once. */
export function stepBall(ball: BasketballBall, wallClockSeconds: number): ShotResult | null {
    if (ball.expired || !Number.isFinite(wallClockSeconds) || wallClockSeconds <= 0) return null;
    ball.ageSeconds += wallClockSeconds;
    const target = Math.min(ball.ageSeconds, BASKETBALL_LIFETIME_SECONDS);
    let event: ShotResult | null = null;
    while (ball.simulatedSeconds + FIXED_STEP <= target + 1e-10) {
        event = advance(ball, FIXED_STEP) ?? event;
        ball.simulatedSeconds += FIXED_STEP;
    }
    if (ball.ageSeconds >= BASKETBALL_LIFETIME_SECONDS - 1e-10) {
        ball.expired = true;
        if (!ball.resultEmitted) event = result(ball, 'miss');
    }
    return event;
}
