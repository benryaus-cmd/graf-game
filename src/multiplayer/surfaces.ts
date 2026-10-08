import * as THREE from 'three';
import type { PaintWall } from '../game/worldTypes';
import type { StrokePoint } from './protocol';

// Geometry identity, not array position or a random Three.js UUID. Version when city layout changes.
export function assignSurfaceIds(chunkX: number, chunkZ: number, walls: PaintWall[], namespace?:string): void {
  const duplicates = new Map<string, number>();
  for (const wall of walls) {
    const mesh = wall.mesh;
    const geometry = mesh.geometry;
    const signature = [
      geometry.type, ...mesh.position.toArray(), ...mesh.quaternion.toArray(),
      ...wall.faceDimensions.flatMap(d => [d.width, d.height]),
    ].map(v => typeof v === 'number' ? Math.round(v * 100_000) / 100_000 : v).join(',');
    // Two hashes avoid long addresses; collisions checked through the geometry signature in tests.
    let a = 2166136261; let b = 5381;
    for (let i = 0; i < signature.length; i++) {
      a = Math.imul(a ^ signature.charCodeAt(i), 16777619);
      b = Math.imul(b, 33) ^ signature.charCodeAt(i);
    }
    const key = (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36);
    const occurrence = duplicates.get(key) ?? 0; duplicates.set(key, occurrence + 1);
    wall.surfaceId = 'ss1:' + (namespace?namespace+':':'') + chunkX + ':' + chunkZ + ':' + key + (occurrence ? ':' + occurrence : '');
  }
}
export function encodeSurface(wallId: string, face: number, layer: number): string {
  return wallId + '/f' + face + '/l' + layer;
}
export function decodeSurface(id: string): { wallId: string; face: number; layer: number } | null {
  const match = /^(ss1:[^/]+)\/f([0-5])\/l([0-7])$/.exec(id);
  return match ? { wallId: match[1], face: Number(match[2]), layer: Number(match[3]) } : null;
}

// Reconstruct the original tiled UV using triangle barycentrics, including rotated planes/boxes.
export function pointToHit(wall: PaintWall, face: number, point: StrokePoint): THREE.Intersection | null {
  wall.mesh.updateWorldMatrix(true, false);
  const local = wall.mesh.worldToLocal(new THREE.Vector3(point.x, point.y, point.z));
  const geometry = wall.mesh.geometry;
  const positions = geometry.getAttribute('position'); const uvs = geometry.getAttribute('uv');
  if (!positions || !uvs) return null;
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.index?.count ?? positions.count, materialIndex: 0 }];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const triangle = new THREE.Triangle(); const closest = new THREE.Vector3(); const bary = new THREE.Vector3();
  for (const group of groups) {
    if ((group.materialIndex ?? 0) !== face) continue;
    for (let offset = group.start; offset < group.start + group.count; offset += 3) {
      const indices = [0, 1, 2].map(i => geometry.index ? geometry.index.getX(offset + i) : offset + i);
      a.fromBufferAttribute(positions, indices[0]); b.fromBufferAttribute(positions, indices[1]); c.fromBufferAttribute(positions, indices[2]);
      triangle.set(a, b, c); triangle.closestPointToPoint(local, closest);
      if (closest.distanceToSquared(local) > 0.000001) continue;
      triangle.getBarycoord(closest, bary);
      const uv = new THREE.Vector2(
        uvs.getX(indices[0]) * bary.x + uvs.getX(indices[1]) * bary.y + uvs.getX(indices[2]) * bary.z,
        uvs.getY(indices[0]) * bary.x + uvs.getY(indices[1]) * bary.y + uvs.getY(indices[2]) * bary.z,
      );
      return { object: wall.mesh, uv, point: new THREE.Vector3(point.x, point.y, point.z), distance: 0,
        face: { a: indices[0], b: indices[1], c: indices[2], normal: triangle.getNormal(new THREE.Vector3()), materialIndex: face } };
    }
  }
  return null;
}
