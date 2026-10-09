import { BASKETBALL_COURT as court } from './basketballCourt';
import type { BasketballVector } from './basketballPhysics';

/** Metres in the canonical assigned mark's horizontal rim-facing frame. */
export interface ReleaseOffset { right: number; up: number; forward: number }

/** Reject malformed or out-of-envelope input; never silently move the release. */
export function readReleaseOffset(value: unknown): ReleaseOffset | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { right, up, forward } = value as Record<string, unknown>;
  if (typeof right !== 'number' || !Number.isFinite(right) || right < -1.75 || right > 1.75
    || typeof up !== 'number' || !Number.isFinite(up) || up < .4 || up > 2.8
    || typeof forward !== 'number' || !Number.isFinite(forward) || forward < .05 || forward > 1.75
    || Math.hypot(right, forward) > 2.1) return null;
  return { right, up, forward };
}

function markFrame(spotId: number) {
  const spot = court.spots.find(spot => spot.id === spotId);
  if (!spot) return null;
  const dx = court.rim.center[0] - spot.position[0], dz = court.rim.center[2] - spot.position[2];
  const length = Math.hypot(dx, dz);
  if (!length) return null;
  return { spot, fx: dx / length, fz: dz / length };
}

function inCourt(origin: BasketballVector): boolean {
  return origin.every(Number.isFinite) && origin[0] >= court.bounds.minX - 2 && origin[0] <= court.bounds.maxX + 2
    && origin[2] >= court.bounds.minZ - 2 && origin[2] <= court.bounds.maxZ + 2;
}

/** Reconstruct only from the server-assigned mark, never a client world-space launch. */
export function releaseOriginFromOffset(spotId: number, offset: ReleaseOffset): BasketballVector | null {
  const frame = markFrame(spotId), bounded = readReleaseOffset(offset);
  if (!frame || !bounded) return null;
  const { spot, fx, fz } = frame, { right, up, forward } = bounded;
  const origin: BasketballVector = [spot.position[0] + fz * right + fx * forward,
    spot.position[1] + up, spot.position[2] - fx * right + fz * forward];
  return inCourt(origin) ? origin : null;
}

/** Encode the actual movable held-ball world position in the same canonical frame. */
export function encodeReleaseOffset(spotId: number, worldOrigin: BasketballVector): ReleaseOffset | null {
  const frame = markFrame(spotId);
  if (!frame || !Array.isArray(worldOrigin) || worldOrigin.length !== 3 || !inCourt(worldOrigin)) return null;
  const { spot, fx, fz } = frame;
  const dx = worldOrigin[0] - spot.position[0], dz = worldOrigin[2] - spot.position[2];
  const offset = readReleaseOffset({ right: dx * fz - dz * fx, up: worldOrigin[1] - spot.position[1], forward: dx * fx + dz * fz });
  return offset && releaseOriginFromOffset(spotId, offset) ? offset : null;
}

/** Authority has already validated raw offsets; allow roundoff from its inverse projection. */
export function isAuthoritativeReleaseOrigin(spotId: number, worldOrigin: BasketballVector): boolean {
  const frame = markFrame(spotId);
  if (!frame || !Array.isArray(worldOrigin) || worldOrigin.length !== 3 || !inCourt(worldOrigin)) return false;
  const { spot, fx, fz } = frame;
  const dx = worldOrigin[0] - spot.position[0], dz = worldOrigin[2] - spot.position[2];
  const right = dx * fz - dz * fx, up = worldOrigin[1] - spot.position[1], forward = dx * fx + dz * fz;
  const epsilon = 1e-9;
  return right >= -1.75 - epsilon && right <= 1.75 + epsilon
    && up >= .4 - epsilon && up <= 2.8 + epsilon
    && forward >= .05 - epsilon && forward <= 1.75 + epsilon
    && Math.hypot(right, forward) <= 2.1 + epsilon;
}
