export interface BrushPoint { x: number; y: number }
export interface BrushPathState { distanceToNext: number; stampIndex: number }
export interface BrushStamp extends BrushPoint { angle: number; index: number }

/** Evenly spaces stamps along straight input samples while retaining the gap between events. */
export function sampleBrushPath(
  from: BrushPoint,
  to: BrushPoint,
  spacing: number,
  state: BrushPathState,
): { stamps: BrushStamp[]; state: BrushPathState } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const step = Math.max(0.5, spacing);
  if (length === 0) return { stamps: [], state };

  const angle = Math.atan2(dy, dx);
  const stamps: BrushStamp[] = [];
  let nextDistance = Math.max(0.001, state.distanceToNext);
  let stampIndex = state.stampIndex;
  while (nextDistance <= length + 1e-6) {
    const t = Math.min(1, nextDistance / length);
    stamps.push({ x: from.x + dx * t, y: from.y + dy * t, angle, index: stampIndex });
    stampIndex += 1;
    nextDistance += step;
  }
  return { stamps, state: { distanceToNext: Math.max(0.001, nextDistance - length), stampIndex } };
}
