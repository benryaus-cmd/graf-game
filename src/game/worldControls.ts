import * as THREE from 'three';
import type { LiveSettings, PaintWall, WorldEngine } from '@/game/worldTypes';
import { advanceWorld } from '@/game/worldMovement';
import { sprayOnWall, type PaintPoint } from '@/game/worldPainting';
import { advanceWeather } from '@/game/skyEffects';
import { attachKeyboardControls } from '@/game/worldKeyboard';
import type { PosterPlacementSession } from '@/game/posterPlacement';
import { commitPosterPlacement } from '@/game/posterCanvas';
import { updatePosterPreview } from '@/game/posterPreview';

export function attachWorldControls(
  world: WorldEngine,
  settings: { current: LiveSettings },
  onSpray: () => void,
  onPaint: () => void,
  posterState: { current: PosterPlacementSession | null },
  onPosterValidity: (valid: boolean) => void,
  onPosterPlaced: (sequence: number, placed: boolean) => void,
): () => void {
  const canvas = world.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const wallMeshes = world.walls.map((wall) => wall.mesh);
  const wallLookup = new Map<THREE.Object3D, PaintWall>(
    world.walls.map((wall) => [wall.mesh, wall] as const),
  );
  let cachedWalls = [...world.walls];
  const keys = new Set<string>();
  const stopKeyboardControls = attachKeyboardControls(world, settings, keys);
  const lastBuzz = { current: 0 };
  const stroke: { current: PaintPoint | null } = { current: null };
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startYaw = 0;
  let startPitch = 0;
  let paintRevision = world.paintRevision;
  const endStroke = () => { stroke.current = null; world.onPaintEnd?.(); };

  const refreshWalls = () => {
    const unchanged = cachedWalls.length === world.walls.length &&
      cachedWalls.every((wall, index) => wall === world.walls[index]);
    if (unchanged) return;
    cachedWalls = [...world.walls];
    wallMeshes.length = 0;
    wallLookup.clear();
    cachedWalls.forEach((wall) => {
      wallMeshes.push(wall.mesh);
      wallLookup.set(wall.mesh, wall);
    });
  };
  const paint = (event: PointerEvent) => {
    if (paintRevision !== world.paintRevision) { endStroke(); paintRevision = world.paintRevision; }
    refreshWalls();
    sprayOnWall(
      world, event, settings.current, raycaster, pointer, wallMeshes, wallLookup,
      onSpray, onPaint, lastBuzz, stroke,
    );
    if (!stroke.current) world.onPaintEnd?.();
  };
  const onPointerDown = (event: PointerEvent) => {
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startYaw = world.playerYaw;
    startPitch = world.playerPitch;
    endStroke();
    canvas.setPointerCapture(event.pointerId);
    if (settings.current.paintMode && !posterState.current) paint(event);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    if (settings.current.paintMode && !posterState.current) {
      paint(event);
      return;
    }
    endStroke();
    if (world.cameraMode === 'map') return;
    const sensitivity = settings.current.lookSensitivity;
    world.playerYaw = startYaw - (event.clientX - startX) * sensitivity;
    world.playerPitch = THREE.MathUtils.clamp(
      startPitch - (event.clientY - startY) * sensitivity,
      -1.24,
      1.18,
    );
  };
  const onPointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    endStroke();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const timer = new THREE.Timer();
  world.renderer.setAnimationLoop((time) => {
    timer.update(time);
    const delta = Math.min(timer.getDelta(), 0.045);
    advanceWorld(world, delta, settings.current, keys);
    if (!settings.current.paintMode || posterState.current) endStroke();
    world.onMultiplayerFrame?.(delta, settings.current);
    advanceWeather(world, delta);
    const poster = posterState.current;
    if (poster) {
      refreshWalls();
      const valid = updatePosterPreview(world, poster, wallMeshes, wallLookup, raycaster, pointer);
      if (valid !== poster.lastReportedValid) {
        poster.lastReportedValid = valid;
        onPosterValidity(valid);
      }
      const placed = commitPosterPlacement(world, poster);
      if (placed !== null) onPosterPlaced(poster.sequence, placed);
    }
    world.renderer.render(world.scene, world.cameraMode === 'map' ? world.mapCamera : world.camera);
  });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  const onBlur = () => { pointerId = null; keys.clear(); endStroke(); };
  canvas.addEventListener('lostpointercapture', onPointerUp);
  window.addEventListener('blur', onBlur);

  return () => {
    endStroke();
    world.renderer.setAnimationLoop(null);
    stopKeyboardControls();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    canvas.removeEventListener('lostpointercapture', onPointerUp);
    window.removeEventListener('blur', onBlur);
  };
}
