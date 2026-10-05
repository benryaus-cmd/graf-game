import * as THREE from 'three';
import type { LiveSettings, PaintWall, WorldEngine } from '@/game/worldTypes';

export interface PaintPoint {
  object: THREE.Object3D;
  face: number;
  x: number;
  y: number;
  layer: number;
}

export function stampPaintHit(
  wall: PaintWall,
  hit: THREE.Intersection,
  color: string,
  opacity: number,
  worldRadius: number,
  layerIndex: number,
  previous: PaintPoint | null = null,
  visible = true,
  erase = false,
): PaintPoint | null {
  if (!hit.face || !hit.uv) return null;
  const face = Number.isFinite(hit.face.materialIndex) ? hit.face.materialIndex : 0;
  while (wall.layers.length <= layerIndex) wall.createLayer();
  const layer = wall.layers[layerIndex];
  if (!layer) return null;
  const context = layer.ensureFace(face);
  if (!context) return null;
  layer.mesh.visible = visible;
  const uvScale = wall.uvScales[face] ?? { u: 1, v: 1 };
  const normalizedX = THREE.MathUtils.clamp(hit.uv.x / uvScale.u, 0, 1);
  const normalizedY = THREE.MathUtils.clamp(hit.uv.y / uvScale.v, 0, 1);
  const x = normalizedX * context.canvas.width;
  const y = (1 - normalizedY) * context.canvas.height;
  const dimensions = wall.faceDimensions[face] ?? { width: 1, height: 1 };
  const pixelsPerWorldX = context.canvas.width / Math.max(0.01, dimensions.width);
  const pixelsPerWorldY = context.canvas.height / Math.max(0.01, dimensions.height);
  const worldX = x / pixelsPerWorldX;
  const worldY = y / pixelsPerWorldY;
  const radius = Math.max(0.025, worldRadius);
  context.save();
  context.setTransform(pixelsPerWorldX, 0, 0, pixelsPerWorldY, 0, 0);
  context.globalAlpha = THREE.MathUtils.clamp(opacity, 0.05, 1);
  context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = radius * 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  const continues = previous?.object === hit.object && previous.face === face && previous.layer === layerIndex;
  if (continues && previous) {
    context.moveTo(previous.x / pixelsPerWorldX, previous.y / pixelsPerWorldY);
    context.lineTo(worldX, worldY);
    context.stroke();
  } else {
    context.arc(worldX, worldY, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
  wall.dirty = true;
  layer.textures[face].needsUpdate = true;
  return { object: hit.object, face, x, y, layer: layerIndex };
}

export function sprayOnWall(
  world: WorldEngine,
  event: PointerEvent,
  settings: LiveSettings,
  raycaster: THREE.Raycaster,
  pointer: THREE.Vector2,
  wallMeshes: THREE.Mesh[],
  wallLookup: Map<THREE.Object3D, PaintWall>,
  onSpray: () => void,
  onPaint: () => void,
  lastBuzz: { current: number },
  stroke: { current: PaintPoint | null },
): void {
  const rect = world.renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, world.cameraMode === 'map' ? world.mapCamera : world.camera);
  const intersections = raycaster.intersectObjects(wallMeshes, false);
  const hit = intersections[0];
  if (!hit || hit.distance > 160 || !hit.face || !hit.uv) { stroke.current = null; return; }
  const wall = wallLookup.get(hit.object);
  if (!wall) { stroke.current = null; return; }
  const layerIndex = Math.max(0, settings.layerIndex);
  const face = Number.isFinite(hit.face.materialIndex) ? hit.face.materialIndex : 0;
  const previous = stroke.current?.object === hit.object && stroke.current.face === face && stroke.current.layer === layerIndex
    ? stroke.current : null;
  const point = stampPaintHit(
    wall,
    hit,
    settings.color,
    settings.opacity,
    settings.brushSize / 50,
    layerIndex,
    previous,
    settings.layerVisibility[layerIndex] ?? true,
    settings.eraseMode,
  );
  if (!point) { stroke.current = null; return; }
  stroke.current = point;
  world.onPaintSample?.(wall, hit, settings, !!previous);
  const now = performance.now();
  if (now - lastBuzz.current > 220 && navigator.vibrate) {
    navigator.vibrate(14);
    lastBuzz.current = now;
  }
  if (!settings.eraseMode) {
    onSpray();
    onPaint();
  }
}
