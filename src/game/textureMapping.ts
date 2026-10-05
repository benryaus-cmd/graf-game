import * as THREE from 'three';

export function tileBoxGeometry(
  geometry: THREE.BufferGeometry,
  width: number,
  height: number,
  depth: number,
  tileSize = 4,
): void {
  const uv = geometry.getAttribute('uv');
  if (!uv || uv.count < 24) return;
  const faceSizes = [
    [depth, height], [depth, height],
    [width, depth], [width, depth],
    [width, height], [width, height],
  ];
  faceSizes.forEach(([uSize, vSize], face) => {
    const first = face * 4;
    for (let vertex = first; vertex < first + 4; vertex += 1) {
      uv.setXY(
        vertex,
        uv.getX(vertex) * uSize / tileSize,
        uv.getY(vertex) * vSize / tileSize,
      );
    }
  });
  uv.needsUpdate = true;
}

export function tilePlaneGeometry(
  geometry: THREE.BufferGeometry,
  width: number,
  depth: number,
  tileSize = 6,
): void {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    uv.setXY(
      vertex,
      uv.getX(vertex) * width / tileSize,
      uv.getY(vertex) * depth / tileSize,
    );
  }
  uv.needsUpdate = true;
}