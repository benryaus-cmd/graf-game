// Offline extraction only. Runtime uses the fixed table, never traverses model triangles.
import fs from 'node:fs';
import console from 'node:console';
import * as THREE from 'three';
const bytes = fs.readFileSync('public/assets/preview/building.glb');
const jsonLength = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()), binaryStart = 28 + jsonLength;
const accessor = gltf.accessors[0], view = gltf.bufferViews[accessor.bufferView];
const points = Array.from({ length: accessor.count }, (_, i) => new THREE.Vector3(...[0, 1, 2].map(j => bytes.readFloatLE(binaryStart + view.byteOffset + i * 12 + j * 4))));
const round = (n, places = 5) => +n.toFixed(places);
const scale = 4 / (accessor.max[0] - accessor.min[0]);
const depth = (accessor.max[2] - accessor.min[2]) * scale;
const centerZ = -12 - depth * 2, centerX = (accessor.max[0] + accessor.min[0]) / 2;
const groups = new Map();
for (let i = 0; i < points.length; i += 3) {
  const n = new THREE.Triangle(...points.slice(i, i + 3)).getNormal(new THREE.Vector3());
  if (Math.abs(n.y) > .025 || n.lengthSq() < .9) continue;
  const normal = new THREE.Vector3(...n.toArray().map(v => round(v, 5))).normalize();
  const plane = round(normal.dot(points[i]), 4), key = `${normal.toArray().join(',')}:${plane}`;
  if (!groups.has(key)) groups.set(key, { normal, plane, triangles: [] });
  groups.get(key).triangles.push(i);
}
const faces = [];
for (const group of groups.values()) {
  const vertices = new Map(), remaining = new Set(group.triangles);
  const vertexKey = p => p.toArray().map(n => round(n, 4)).join(',');
  for (const i of remaining) for (const p of points.slice(i, i + 3)) { const key = vertexKey(p); if (!vertices.has(key)) vertices.set(key, []); vertices.get(key).push(i); }
  while (remaining.size) {
    const start = remaining.values().next().value, queue = [start], component = []; remaining.delete(start);
    while (queue.length) { const i = queue.pop(); component.push(...points.slice(i, i + 3)); for (const p of points.slice(i, i + 3)) for (const next of vertices.get(vertexKey(p))) if (remaining.delete(next)) queue.push(next); }
    const right = new THREE.Vector3(group.normal.z, 0, -group.normal.x).normalize();
    const up = group.normal.clone().cross(right).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, group.normal));
    const us = component.map(p => right.dot(p)), ys = component.map(p => up.dot(p));
    const loU = Math.min(...us), hiU = Math.max(...us), loY = Math.min(...ys), hiY = Math.max(...ys);
    const projected = component.map(p => new THREE.Vector2(right.dot(p), up.dot(p)));
    let area = 0;
    for (let i = 0; i < projected.length; i += 3) { const [a, b, c] = projected.slice(i, i + 3); area += Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2; }
    let rectangles = [[loU, hiU, loY, hiY]];
    // Large compound facades can surround a door/recess. Partition these instead of covering the opening.
    if (component.length > 6 && area < (hiU - loU) * (hiY - loY) * .94) {
      const xs = [...new Set(projected.map(p => round(p.x, 5)))].sort((a, b) => a - b), ys = [...new Set(projected.map(p => round(p.y, 5)))].sort((a, b) => a - b);
      const inside = (x, y) => {
        for (let i = 0; i < projected.length; i += 3) {
          const [a, b, c] = projected.slice(i, i + 3); const cross = (p, q) => (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
          const values = [cross(a, b), cross(b, c), cross(c, a)]; if (values.every(v => v >= -1e-9) || values.every(v => v <= 1e-9)) return true;
        } return false;
      };
      const cells = Array.from({ length: ys.length - 1 }, (_, y) => Array.from({ length: xs.length - 1 }, (_, x) => inside((xs[x] + xs[x + 1]) / 2, (ys[y] + ys[y + 1]) / 2)));
      rectangles = [];
      for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
        if (!cells[y][x]) continue;
        let toX = x + 1, toY = y + 1; while (toX < cells[y].length && cells[y][toX]) toX++;
        while (toY < cells.length && cells[toY].slice(x, toX).every(Boolean)) toY++;
        for (let cy = y; cy < toY; cy++) for (let cx = x; cx < toX; cx++) cells[cy][cx] = false;
        rectangles.push([xs[x], xs[toX], ys[y], ys[toY]]);
      }
    }
    for (const [u0, u1, y0, y1] of rectangles) {
      const width = (u1 - u0) * scale, height = (y1 - y0) * scale;
      if (width < .008 || height < .008) continue;
      const center = right.clone().multiplyScalar((u0 + u1) / 2).addScaledVector(up, (y0 + y1) / 2).addScaledVector(group.normal, group.plane).multiplyScalar(scale);
      center.x -= centerX * scale; center.y -= accessor.min[1] * scale; center.z += centerZ;
      center.addScaledVector(group.normal, .002);
      faces.push([...center.toArray(), width, height, ...quaternion.toArray()].map(n => round(n)));
    }
  }
}
faces.sort((a, b) => { for (const i of [5, 6, 7, 8, 2, 0, 1, 3, 4]) if (a[i] !== b[i]) return a[i] - b[i]; return 0; });
fs.writeFileSync('src/game/fixtureBuildingFaces.ts', `// Generated from pinned Quaternius building.glb by scripts/generate-fixture-building.mjs.\n// [world X, Y, Z, width, height, quaternion X, Y, Z, W]; connected vertical slabs, fixed ordering.\nexport const FIXTURE_SCALE = ${scale};\nexport const FIXTURE_DEPTH = ${depth};\nexport const FIXTURE_HEIGHT = ${(accessor.max[1] - accessor.min[1]) * scale};\nexport const FIXTURE_POSITION = { x: 0, z: ${centerZ} };\nexport const FIXTURE_MODEL_OFFSET = [${-centerX * scale}, ${-accessor.min[1] * scale}, ${centerZ}] as const;\nexport const FIXTURE_FACES: readonly (readonly number[])[] = [\n${faces.map(f => '  [' + f.join(', ') + '],').join('\n')}\n];\n`);
console.log({ faces: faces.length, width: 4, depth, centerZ });
