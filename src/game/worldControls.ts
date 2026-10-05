import * as THREE from 'three';
import type { LiveSettings, PaintWall, WorldEngine } from '@/game/worldTypes';
import { advanceWorld } from '@/game/worldMovement';
import { sprayOnWall, type PaintPoint } from '@/game/worldPainting';
import { advanceWeather } from '@/game/skyEffects';
import { attachKeyboardControls } from '@/game/worldKeyboard';
import type { PosterPlacementSession } from '@/game/posterPlacement';
import { commitPosterPlacement } from '@/game/posterCanvas';
import { updatePosterPreview } from '@/game/posterPreview';
import { elementPointerIsRotated, elementPointerPoint } from '@/game/pointerCoordinates';
import { centeredPaintWorkspaceBounds, clearPaintWorkspace, selectPaintWorkspaceFace, updatePaintWorkspaceCamera } from '@/game/paintWorkspace';
import { isPaintTargetReachable } from '@/game/paintTargeting';
import { samplePaintColour } from '@/game/paintEyedropper';

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
  let heldPaintPointer: PointerEvent | null = null;
  let lastHeldPaintAt = 0;
  let startPointer = { x: 0, y: 0 };
  let startPointerWidth = 0;
  let startPointerHeight = 0;
  let startYaw = 0;
  let startPitch = 0;
  let selectingWorkspace = false;
  let paintRevision = world.paintRevision;
  const endStroke = () => { stroke.current = null; world.onPaintEnd?.(); };

  const refreshWalls = () => {
    if (world.paintWorkspace?.selection && !world.walls.includes(world.paintWorkspace.selection.wall)) {
      clearPaintWorkspace(world);
    }
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
    if (!world.paintWorkspace?.selection) return;
    if (!world.paintWorkspace.selection.started) return;
    if (paintRevision !== world.paintRevision) { endStroke(); paintRevision = world.paintRevision; }
    refreshWalls();
    if (!world.paintWorkspace?.selection) return;
    sprayOnWall(
      world, event, settings.current, raycaster, pointer, wallMeshes, wallLookup,
      onSpray, onPaint, lastBuzz, stroke,
    );
    if (!stroke.current) world.onPaintEnd?.();
  };
  const selectPaintFaceAtPointer = (event: PointerEvent) => {
    refreshWalls();
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const coordinates = elementPointerPoint(canvas, event);
    pointer.set(coordinates.x * 2 - 1, 1 - coordinates.y * 2);
    raycaster.setFromCamera(pointer, world.cameraMode === 'map' ? world.mapCamera : world.camera);
    const intersections = raycaster.intersectObjects(wallMeshes, false);
    const hit = intersections.find((candidate) => candidate.face && candidate.uv && isPaintTargetReachable(
      raycaster.ray,
      candidate.point,
      candidate.distance,
      world.playerPosition,
      world.colliders,
    ));
    const wall = hit ? wallLookup.get(hit.object) : undefined;
    if (!hit?.face || !hit.uv || !wall) return false;
    const face = Number.isFinite(hit.face.materialIndex) ? hit.face.materialIndex : 0;
    selectPaintWorkspaceFace(world, wall, face, centeredPaintWorkspaceBounds(wall, face, hit.uv));
    return true;
  };
  const paintPointerMove = (event: PointerEvent) => {
    heldPaintPointer = event;
    const samples = event.getCoalescedEvents?.();
    if (samples?.length) {
      for (const sample of samples) paint(sample);
    } else {
      paint(event);
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    if (pointerId !== null || (event.pointerType === 'mouse' && (!event.isPrimary || event.button !== 0))) return;
    if (settings.current.eyedropperActive) {
      endStroke();
      refreshWalls();
      const point = elementPointerPoint(canvas, event);
      pointer.set(point.x * 2 - 1, 1 - point.y * 2);
      raycaster.setFromCamera(pointer, world.paintWorkspace?.active ? world.paintWorkspace.camera : world.cameraMode === 'map' ? world.mapCamera : world.camera);
      const hit = raycaster.intersectObjects(wallMeshes, false)[0];
      const wall = hit && wallLookup.get(hit.object);
      const selection = world.paintWorkspace?.selection;
      if (hit?.face && hit.uv && wall && (world.paintWorkspace?.active ? selection?.wall === wall && selection.face === (hit.face.materialIndex ?? 0) : isPaintTargetReachable(raycaster.ray, hit.point, hit.distance, world.playerPosition, world.colliders))) {
        const face = hit.face.materialIndex ?? 0;
        const scale = wall.uvScales[face] ?? { u: 1, v: 1 };
        world.onColorPick?.(samplePaintColour(wall, face, hit.uv.x / scale.u, hit.uv.y / scale.v));
      } else world.onColorPick?.(null);
      return;
    }
    if (!settings.current.paintMode && !posterState.current && !world.paintWorkspace?.active && world.onPlayerPick?.(event)) return;
    if (!settings.current.paintMode && !posterState.current && !world.paintWorkspace?.active && world.onPiecePick?.(event)) return;
    pointerId = event.pointerId;
    heldPaintPointer = event;
    lastHeldPaintAt = performance.now();
    const rect = canvas.getBoundingClientRect();
    const rotated = elementPointerIsRotated(canvas);
    startPointer = elementPointerPoint(canvas, event);
    startPointerWidth = rotated ? rect.height : rect.width;
    startPointerHeight = rotated ? rect.width : rect.height;
    startYaw = world.playerYaw;
    startPitch = world.playerPitch;
    endStroke();
    try { canvas.setPointerCapture(event.pointerId); } catch { pointerId = null; return; }
    if (settings.current.paintMode && !settings.current.eyedropperActive && !posterState.current) {
      selectingWorkspace = !world.paintWorkspace?.selection;
      if (selectingWorkspace) selectPaintFaceAtPointer(event);
      else paint(event);
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    if (settings.current.eyedropperActive) { endStroke(); return; }
    if (settings.current.paintMode && !posterState.current) {
      if (selectingWorkspace) return;
      paintPointerMove(event);
      return;
    }
    endStroke();
    if (world.paintWorkspace?.active) return;
    if (world.cameraMode === 'map') return;
    const sensitivity = settings.current.lookSensitivity;
    const point = elementPointerPoint(canvas, event);
    const dx = (point.x - startPointer.x) * startPointerWidth;
    const dy = (point.y - startPointer.y) * startPointerHeight;
    world.playerYaw = startYaw - dx * sensitivity;
    world.playerPitch = THREE.MathUtils.clamp(
      startPitch - dy * sensitivity,
      -1.24,
      1.18,
    );
  };
  const onPointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    heldPaintPointer = null;
    selectingWorkspace = false;
    endStroke();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const timer = new THREE.Timer();
  world.renderer.setAnimationLoop((time) => {
    timer.update(time);
    const delta = Math.min(timer.getDelta(), 0.045);
    const workspaceActive = !!world.paintWorkspace?.active;
    if (heldPaintPointer && pointerId !== null && settings.current.paintMode && !settings.current.eyedropperActive && !posterState.current && !selectingWorkspace && time - lastHeldPaintAt >= 1000 / 30) {
      lastHeldPaintAt = time;
      paint(heldPaintPointer);
    }
    if (!workspaceActive) {
      const look = settings.current.lookInput;
      if (look && world.cameraMode !== 'map') {
        const turn = settings.current.lookSensitivity * 480 * delta;
        world.playerYaw -= THREE.MathUtils.clamp(look.x, -1, 1) * turn;
        world.playerPitch = THREE.MathUtils.clamp(
          world.playerPitch + THREE.MathUtils.clamp(look.y, -1, 1) * turn,
          -1.24,
          1.18,
        );
      }
      advanceWorld(world, delta, settings.current, keys);
    }
    if (!settings.current.paintMode || settings.current.eyedropperActive || posterState.current) endStroke();
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
    const workspace = world.paintWorkspace;
    if (workspace?.active) {
      refreshWalls();
      if (!world.paintWorkspace?.active) {
        world.renderer.render(world.scene, world.cameraMode === 'map' ? world.mapCamera : world.camera);
        return;
      }
      const look = settings.current.lookInput;
      if (look && workspace.selection) {
        workspace.pan ??= new THREE.Vector2();
        workspace.pan.x = THREE.MathUtils.clamp(workspace.pan.x + look.x * delta, -workspace.selection.width / 2, workspace.selection.width / 2);
        workspace.pan.y = THREE.MathUtils.clamp(workspace.pan.y + look.y * delta, -workspace.selection.height / 2, workspace.selection.height / 2);
      }
      updatePaintWorkspaceCamera(workspace, canvas.clientWidth, canvas.clientHeight);
      world.renderer.render(world.scene, workspace.camera);
    } else {
      world.renderer.render(world.scene, world.cameraMode === 'map' ? world.mapCamera : world.camera);
    }
  });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  const onBlur = () => {
    if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointerId = null;
    heldPaintPointer = null;
    selectingWorkspace = false;
    keys.clear();
    endStroke();
  };
  canvas.addEventListener('lostpointercapture', onPointerUp);
  window.addEventListener('blur', onBlur);

  return () => {
    endStroke();
    clearPaintWorkspace(world);
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
