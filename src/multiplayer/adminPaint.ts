import * as THREE from 'three';
import type { PaintWall } from '../game/worldTypes';
import type { PieceBounds } from './pieceSync';
import { pointToHit } from './surfaces';

export interface AdminPaintSample { face: number; point: THREE.Vector3 }
interface ProjectedPoint { u: number; v: number }

const MIN_ROLLER_ROW_SPACING = 0.07;

/**
 * Build clipped, serpentine scanline endpoints for an admin overpaint.
 * PaintSync interpolates between each row's two endpoints, so the network payload
 * stays small even when the selected piece has an eight-metre canvas.
 */
export function adminPaintSamples(wall: PaintWall, bounds: PieceBounds, spacing = MIN_ROLLER_ROW_SPACING, maxSamples = 5_000): AdminPaintSample[] {
  if (!Number.isFinite(spacing) || spacing <= 0 || maxSamples <= 0) return [];
  spacing = Math.max(spacing, MIN_ROLLER_ROW_SPACING);
  wall.mesh.updateWorldMatrix(true, false);
  const geometry = wall.mesh.geometry;
  const positions = geometry.getAttribute('position');
  if (!positions) return [];
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.index?.count ?? positions.count, materialIndex: 0 }];
  const samples: AdminPaintSample[] = [];
  const origin = new THREE.Vector3();
  const axisU = new THREE.Vector3();
  const axisV = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const minBounds = new THREE.Vector3(...bounds.min), maxBounds = new THREE.Vector3(...bounds.max);

  for (let face = 0; face < 6; face++) {
    const triangles: Array<[number, number, number]> = [];
    for (const group of groups) {
      if ((group.materialIndex ?? 0) !== face) continue;
      for (let offset = group.start; offset + 2 < group.start + group.count; offset += 3) {
        triangles.push([0, 1, 2].map(i => geometry.index ? geometry.index.getX(offset + i) : offset + i) as [number, number, number]);
      }
    }
    if (!triangles.length) continue;
    let basisFound = false;
    for (const indices of triangles) {
      a.fromBufferAttribute(positions, indices[0]).applyMatrix4(wall.mesh.matrixWorld);
      b.fromBufferAttribute(positions, indices[1]).applyMatrix4(wall.mesh.matrixWorld);
      c.fromBufferAttribute(positions, indices[2]).applyMatrix4(wall.mesh.matrixWorld);
      axisU.subVectors(b, a);
      normal.crossVectors(axisU, new THREE.Vector3().subVectors(c, a));
      if (axisU.lengthSq() < 1e-10 || normal.lengthSq() < 1e-10) continue;
      origin.copy(a); axisU.normalize(); normal.normalize(); axisV.crossVectors(normal, axisU).normalize();
      basisFound = true; break;
    }
    if (!basisFound) continue;

    const clipped: THREE.Vector3[][] = [];
    let minimumV = Infinity, maximumV = -Infinity;
    for (const indices of triangles) {
      const polygon = indices.map(index => new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(wall.mesh.matrixWorld));
      const clippedPolygon = clipTriangleToBounds(polygon, minBounds, maxBounds);
      if (clippedPolygon.length < 3) continue;
      clipped.push(clippedPolygon);
      for (const point of clippedPolygon) {
        const v = point.clone().sub(origin).dot(axisV);
        minimumV = Math.min(minimumV, v); maximumV = Math.max(maximumV, v);
      }
    }
    if (!clipped.length || !Number.isFinite(minimumV) || maximumV < minimumV) continue;
    const rows = Math.max(1, Math.ceil((maximumV - minimumV) / spacing));
    if (rows + 1 > maxSamples) return [];
    for (let row = 0; row <= rows; row++) {
      const v = minimumV + (maximumV - minimumV) * row / rows;
      const intervals: Array<[number, number]> = [];
      for (const polygon of clipped) {
        const intersections = intersectPolygonAtV(polygon, origin, axisU, axisV, v);
        if (intersections.length < 2) continue;
        const uValues = intersections.map(point => point.u);
        intervals.push([Math.min(...uValues), Math.max(...uValues)]);
      }
      intervals.sort((left, right) => left[0] - right[0]);
      const merged: Array<[number, number]> = [];
      for (const interval of intervals) {
        const previous = merged[merged.length - 1];
        if (previous && interval[0] <= previous[1] + 1e-4) previous[1] = Math.max(previous[1], interval[1]);
        else merged.push([...interval]);
      }
      const rowSamples: AdminPaintSample[] = [];
      for (const [minU, maxU] of merged) {
        for (const u of minU === maxU ? [minU] : [minU, maxU]) {
          const point = origin.clone().addScaledVector(axisU, u).addScaledVector(axisV, v);
          if (!insideBounds(point, minBounds, maxBounds, 1e-4)) continue;
          if (!pointToHit(wall, face, { x: point.x, y: point.y, z: point.z, pressure: 1 })) continue;
          rowSamples.push({ face, point });
        }
      }
      if (row % 2) rowSamples.reverse();
      samples.push(...rowSamples);
      if (samples.length > maxSamples) return [];
    }
  }
  return samples;
}

function insideBounds(point: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3, epsilon: number): boolean {
  return point.x >= min.x - epsilon && point.x <= max.x + epsilon &&
    point.y >= min.y - epsilon && point.y <= max.y + epsilon &&
    point.z >= min.z - epsilon && point.z <= max.z + epsilon;
}

function clipTriangleToBounds(polygon: THREE.Vector3[], min: THREE.Vector3, max: THREE.Vector3): THREE.Vector3[] {
  let clipped = polygon;
  for (let axis = 0; axis < 3 && clipped.length; axis++) {
    clipped = clipPolygon(clipped, axis, min.getComponent(axis), true);
    clipped = clipPolygon(clipped, axis, max.getComponent(axis), false);
  }
  return clipped;
}

function clipPolygon(polygon: THREE.Vector3[], axis: number, bound: number, keepGreater: boolean): THREE.Vector3[] {
  const output: THREE.Vector3[] = [];
  const inside = (point: THREE.Vector3) => keepGreater ? point.getComponent(axis) >= bound - 1e-8 : point.getComponent(axis) <= bound + 1e-8;
  for (let index = 0; index < polygon.length; index++) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = inside(current), previousInside = inside(previous);
    if (currentInside !== previousInside) {
      const from = previous.getComponent(axis), to = current.getComponent(axis);
      const t = (bound - from) / (to - from);
      output.push(previous.clone().lerp(current, t));
    }
    if (currentInside) output.push(current.clone());
  }
  return output;
}

function intersectPolygonAtV(
  polygon: THREE.Vector3[], origin: THREE.Vector3, axisU: THREE.Vector3, axisV: THREE.Vector3, v: number,
): ProjectedPoint[] {
  const projected = polygon.map(point => {
    const relative = point.clone().sub(origin);
    return { u: relative.dot(axisU), v: relative.dot(axisV) };
  });
  const intersections: ProjectedPoint[] = [];
  for (let index = 0; index < projected.length; index++) {
    const current = projected[index], next = projected[(index + 1) % projected.length];
    if (Math.abs(current.v - next.v) < 1e-8) {
      if (Math.abs(v - current.v) < 1e-6) intersections.push(current, next);
      continue;
    }
    if (v < Math.min(current.v, next.v) - 1e-8 || v > Math.max(current.v, next.v) + 1e-8) continue;
    const t = (v - current.v) / (next.v - current.v);
    intersections.push({ u: current.u + (next.u - current.u) * t, v });
  }
  return intersections;
}
