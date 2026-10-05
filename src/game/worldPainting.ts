import * as THREE from 'three';
import type { LiveSettings, PaintWall, WorldEngine } from '@/game/worldTypes';
import { isPaintTargetReachable } from '@/game/paintTargeting';
import { elementPointerPoint } from '@/game/pointerCoordinates';
import { isPaintWorkspaceHitAllowed } from '@/game/paintWorkspace';
import { drawPaintHead, headForTool, nextHoldSamples, type PaintHead } from '@/game/sprayHeads';

export interface PaintPoint {
  object: THREE.Object3D;
  face: number;
  x: number;
  y: number;
  layer: number;
  holdSamples?: number;
  worldPoint?: readonly [number, number, number];
}

export function paintRadius(brushSize: number): number {
  return Math.max(brushSize >= 1 ? .025 : .002, brushSize / 50);
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
  head?: PaintHead,
  dwellSamples?: number,
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
  const radius = Math.max(0.002, worldRadius);
  context.save();
  context.setTransform(pixelsPerWorldX, 0, 0, pixelsPerWorldY, 0, 0);
  context.globalAlpha = THREE.MathUtils.clamp(opacity, 0.05, 1);
  context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = radius * 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const continues = previous?.object === hit.object && previous.face === face && previous.layer === layerIndex;
  context.beginPath();
  if (continues && previous) {
    context.moveTo(previous.x / pixelsPerWorldX, previous.y / pixelsPerWorldY);
    context.lineTo(worldX, worldY);
    context.stroke();
  } else if (!head) {
    context.arc(worldX, worldY, radius, 0, Math.PI * 2);
    context.fill();
  }
  const worldPoint = [hit.point.x, hit.point.y, hit.point.z] as const;
  const holdSamples = dwellSamples === undefined
    ? nextHoldSamples(continues ? previous : null, worldPoint)
    : Math.max(1, Math.min(60, dwellSamples));
  if (head) drawPaintHead(context, worldX, worldY, radius, head, holdSamples);
  context.restore();
  wall.dirty = true;
  layer.textures[face].needsUpdate = true;
  return { object: hit.object, face, x, y, layer: layerIndex, holdSamples, worldPoint };
}

export function canPaintCanvas(world: WorldEngine, settings: LiveSettings): boolean {
  return !world.multiplayerActive || !!(world.adminFreePaint && settings.adminFreePaint) || !!world.paintWorkspace?.selection?.purchaseApproved;
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
  if (!canPaintCanvas(world, settings)) { stroke.current = null; return; }
  const rect = world.renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const coordinates = elementPointerPoint(world.renderer.domElement, event);
  pointer.set(coordinates.x * 2 - 1, 1 - coordinates.y * 2);
  raycaster.setFromCamera(pointer, world.paintWorkspace?.active ? world.paintWorkspace.camera : world.cameraMode === 'map' ? world.mapCamera : world.camera);
  const intersections = raycaster.intersectObjects(world.paintWorkspace?.active && world.paintWorkspace.selection ? [world.paintWorkspace.selection.wall.mesh] : wallMeshes, false);
  const hit = intersections[0];
  if (!hit || !hit.face || !hit.uv || (!world.paintWorkspace?.active && !isPaintTargetReachable(
    raycaster.ray,
    hit.point,
    hit.distance,
    world.playerPosition,
    world.colliders,
  ))) { stroke.current = null; return; }
  const wall = wallLookup.get(hit.object);
  if (!wall) { stroke.current = null; return; }
  const layerIndex = Math.max(0, settings.layerIndex);
  const face = Number.isFinite(hit.face.materialIndex) ? hit.face.materialIndex : 0;
  const selection = world.paintWorkspace?.selection;
  if (selection && !isPaintWorkspaceHitAllowed(selection, wall, face, hit.uv, Math.min(.08, paintRadius(settings.brushSize)))) { stroke.current = null; return; }
  const previous = stroke.current?.object === hit.object && stroke.current.face === face && stroke.current.layer === layerIndex
    ? stroke.current : null;
  const point = stampPaintHit(
    wall,
    hit,
    settings.color,
    settings.opacity,
    paintRadius(settings.brushSize),
    layerIndex,
    previous,
    settings.layerVisibility[layerIndex] ?? true,
    settings.eraseMode,
    (settings as LiveSettings & { brushHead?: PaintHead }).brushHead
      ? headForTool((settings as LiveSettings & { brushHead?: PaintHead }).brushHead)
      : undefined,
  );
  if (!point) { stroke.current = null; return; }
  if (selection && !selection.hasPaint) {
    selection.hasPaint = true;
    world.onPaintWorkspaceChange?.(world.paintWorkspace);
  }
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
