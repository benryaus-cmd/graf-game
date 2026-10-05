import * as THREE from 'three';
import type { PaintWall } from '@/game/worldTypes';

const MOTIF_COLORS = ['#fff2c7', '#f4e8cc', '#c8ffda', '#d3ecff', '#fff4e2'];
const STAR_POINTS = Array.from({ length: 10 }, (_, index) => {
  const angle = -Math.PI / 2 + index * Math.PI / 5;
  const radius = index % 2 === 0 ? 0.48 : 0.22;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
});

function polygon(context: CanvasRenderingContext2D, points: ReadonlyArray<readonly [number, number]>): void {
  const first = points[0];
  if (!first) return;
  context.beginPath();
  context.moveTo(first[0], first[1]);
  points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
  context.closePath();
}

export function paintBotWallMotif(
  wall: PaintWall,
  hit: THREE.Intersection,
  paintColor: string,
  botIndex: number,
  time: number,
): void {
  if (!hit.face || !hit.uv) return;
  const face = Number.isFinite(hit.face.materialIndex) ? hit.face.materialIndex : 0;
  while (wall.layers.length === 0) wall.createLayer();
  const context = wall.layers[0]?.ensureFace(face);
  if (!context) return;
  const uvScale = wall.uvScales[face] ?? { u: 1, v: 1 };
  const dimensions = wall.faceDimensions[face] ?? { width: 1, height: 1 };
  const pixelsPerWorldX = context.canvas.width / Math.max(0.01, dimensions.width);
  const pixelsPerWorldY = context.canvas.height / Math.max(0.01, dimensions.height);
  const x = THREE.MathUtils.clamp(hit.uv.x / uvScale.u, 0, 1) * dimensions.width;
  const y = (1 - THREE.MathUtils.clamp(hit.uv.y / uvScale.v, 0, 1)) * dimensions.height;
  context.save();
  context.setTransform(pixelsPerWorldX, 0, 0, pixelsPerWorldY, 0, 0);
  context.translate(x, y);
  context.scale(0.9, 0.9);
  context.globalAlpha = 0.94;
  context.strokeStyle = MOTIF_COLORS[botIndex % MOTIF_COLORS.length] ?? '#fff2c7';
  context.fillStyle = paintColor;
  context.lineWidth = 0.075;
  context.lineJoin = 'round';
  context.lineCap = 'square';
  const motif = (botIndex + Math.floor(time / 5)) % 6;
  if (motif === 0) {
    polygon(context, STAR_POINTS);
    context.fill();
    context.stroke();
  } else if (motif === 1) {
    polygon(context, [[-0.18, -0.5], [0.12, -0.1], [-0.02, -0.08], [0.2, 0.5], [-0.22, 0.02], [-0.06, 0.02]]);
    context.fill();
    context.stroke();
  } else if (motif === 2) {
    context.beginPath();
    context.moveTo(-0.5, -0.18);
    context.lineTo(-0.25, 0.12);
    context.lineTo(0, -0.18);
    context.lineTo(0.25, 0.12);
    context.lineTo(0.5, -0.18);
    context.stroke();
    context.beginPath();
    context.moveTo(-0.5, 0.25);
    context.lineTo(0.5, 0.25);
    context.stroke();
  } else if (motif === 3) {
    polygon(context, [[0, -0.5], [0.32, 0], [0, 0.5], [-0.32, 0]]);
    context.stroke();
    context.beginPath();
    context.moveTo(-0.48, -0.42);
    context.lineTo(0.48, 0.42);
    context.moveTo(0.48, -0.42);
    context.lineTo(-0.48, 0.42);
    context.stroke();
  } else if (motif === 4) {
    polygon(context, [[-0.5, 0.35], [-0.4, -0.05], [-0.18, 0.18], [0, -0.48], [0.18, 0.18], [0.4, -0.05], [0.5, 0.35]]);
    context.stroke();
    context.beginPath();
    context.moveTo(-0.5, 0.43);
    context.lineTo(0.5, 0.43);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(-0.48, 0.32);
    context.lineTo(0.18, -0.34);
    context.lineTo(0.08, -0.12);
    context.moveTo(0.18, -0.34);
    context.lineTo(-0.04, -0.24);
    context.moveTo(-0.12, 0.5);
    context.lineTo(0.45, 0.5);
    context.stroke();
  }
  context.restore();
  if (wall.layers[0]?.textures[face]) wall.layers[0].textures[face].needsUpdate = true;
  wall.dirty = true;
}