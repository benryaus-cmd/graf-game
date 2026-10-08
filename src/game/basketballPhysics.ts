import { BASKETBALL_COURT as court } from './basketballCourt';
export type BasketballVector = [number, number, number];
/** Normalize pointer displacement by the shorter viewport dimension; upward dy is positive. */
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
const GRAVITY = 9.81, FIXED_STEP = 1 / 120;
let nextShotId = 0;

/** Shared by the preview and launch; callers validate or clamp their gesture. */
export function basketballFlickSpeed(gesture: Pick<BasketballGesture, 'dy' | 'durationMs'>): number {
    return Math.min(13, 5 + 4 * gesture.dy + .9 * gesture.dy / (gesture.durationMs / 1000));
}

export function launchFromFlick(spotId: number, gesture: BasketballGesture): ShotLaunch | null {
    const spot = court.spots.find(s => s.id === spotId);
    const { dx, dy, durationMs } = gesture;
    if (!spot || ![dx, dy, durationMs].every(Number.isFinite) || Math.abs(dx) > 1 || dy < .06 || dy > 1 || durationMs < 40 || durationMs > 2000) return null;
    const [x, , z] = spot.position;
    const aim = Math.atan2(court.rim.center[0] - x, court.rim.center[2] - z) - dx * .9;
    // Fixed elevation makes length/speed a learnable power control, not a hoop-target solver.
    const speed = basketballFlickSpeed(gesture);
    const elevation = 58 * Math.PI / 180, horizontal = speed * Math.cos(elevation);
    return { courtId: court.id, shotId: `local-${++nextShotId}`, spotId, version: 1,
        origin: [x + Math.sin(aim) * .25, 1.7, z + Math.cos(aim) * .25],
        velocity: [Math.sin(aim) * horizontal, speed * Math.sin(elevation), Math.cos(aim) * horizontal] };
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
function advance(ball: BasketballBall, dt: number): ShotResult | null {
    const p = ball.position, v = ball.velocity, old: BasketballVector = [...p];
    p[0] += v[0] * dt; p[1] += v[1] * dt - GRAVITY * dt * dt / 2; p[2] += v[2] * dt;
    v[1] -= GRAVITY * dt;
    const [rx, ry, rz] = court.rim.center;
    let event: ShotResult | null = null;
    if (!ball.resultEmitted && old[1] > ry && p[1] <= ry && v[1] < 0) {
        const fraction = (old[1] - ry) / (old[1] - p[1]);
        const x = old[0] + (p[0] - old[0]) * fraction, z = old[2] + (p[2] - old[2]) * fraction;
        const clearance = court.rim.radius - court.rim.tubeRadius - court.ballRadius;
        if (Math.hypot(x - rx, z - rz) <= clearance) { ball.scored = true; event = result(ball, 'make'); }
    }
    const board = court.backboard, boardFace = board.center[2] + board.depth / 2 + court.ballRadius;
    const boardBack = board.center[2] - board.depth / 2 - court.ballRadius;
    const frontHit = old[2] > boardFace && p[2] <= boardFace, backHit = old[2] < boardBack && p[2] >= boardBack;
    if (frontHit || backHit) {
        const plane = frontHit ? boardFace : boardBack, t = (plane - old[2]) / (p[2] - old[2]);
        const x = old[0] + (p[0] - old[0]) * t, y = old[1] + (p[1] - old[1]) * t;
        if (Math.abs(x - board.center[0]) <= board.width / 2 + court.ballRadius && Math.abs(y - board.center[1]) <= board.height / 2 + court.ballRadius) {
            p[2] = plane + (frontHit ? 1 : -1) * .00001; v[2] *= -.65; ball.contacted = true;
        }
    }
    // Sphere against a torus centreline; fixed steps bound travel and prevent rim tunnelling.
    const radial = Math.hypot(p[0] - rx, p[2] - rz);
    if (radial > .00001) {
        const qx = rx + (p[0] - rx) * court.rim.radius / radial, qz = rz + (p[2] - rz) * court.rim.radius / radial;
        const nx = p[0] - qx, ny = p[1] - ry, nz = p[2] - qz;
        const length = Math.hypot(nx, ny, nz), contactRadius = court.ballRadius + court.rim.tubeRadius;
        if (length < contactRadius && length > .000001) {
            const normal: BasketballVector = [nx / length, ny / length, nz / length];
            const inward = v[0] * normal[0] + v[1] * normal[1] + v[2] * normal[2];
            for (let axis = 0; axis < 3; axis++) { p[axis] += normal[axis] * (contactRadius - length + .00001); if (inward < 0) v[axis] -= 1.55 * inward * normal[axis]; }
            ball.contacted = true;
        }
    }
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
