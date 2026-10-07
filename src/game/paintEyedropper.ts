import * as THREE from 'three';
import type { PaintWall, WorldEngine } from './worldTypes';
import { elementPointerPoint } from './pointerCoordinates';

/** Sample the displayed scene on demand, including non-raycastable reference images. */
export function sampleVisibleWorldColour(world: WorldEngine, event: Pick<PointerEvent, 'clientX' | 'clientY'>): string | null {
  const renderer = world.renderer;
  try {
    const point = elementPointerPoint(renderer.domElement, event);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (![point.x, point.y, size.x, size.y].every(Number.isFinite) || size.x < 1 || size.y < 1 || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
    const source = world.paintWorkspace?.active ? world.paintWorkspace.camera : world.cameraMode === 'map' ? world.mapCamera : world.camera;
    const camera = source.clone();
    // Camera parents, if present, must not be lost when rendering the detached clone.
    if (source.parent) source.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
    const x = Math.min(size.x - 1, Math.floor(point.x * size.x));
    const y = Math.min(size.y - 1, Math.floor(point.y * size.y));
    const view = source.view;
    if (view?.enabled) {
      camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX + x * view.width / size.x, view.offsetY + y * view.height / size.y, view.width / size.x, view.height / size.y);
    } else camera.setViewOffset(size.x, size.y, x, y, 1, 1);

    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousLevel = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const target = new THREE.WebGLRenderTarget(1, 1, { colorSpace: renderer.outputColorSpace });
    // Three r184 normally skips display tone mapping for offscreen targets. Its
    // display-target branch preserves per-material toneMapped and sRGB encoding,
    // including blending, without modifying materials or enabling an XR session.
    target.isXRRenderTarget = true;
    // Encoding happens in the display shader, as with the default framebuffer;
    // an SRGB8_ALPHA8 attachment would apply that conversion a second time.
    target.texture.internalFormat = 'RGBA8';
    try {
      // The target's own 1x1 viewport/scissor avoid device-pixel-ratio scaling.
      renderer.setRenderTarget(target);
      renderer.render(world.scene, camera);
      const pixel = new Uint8Array(4);
      renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
      return '#' + Array.from(pixel.subarray(0, 3), value => value.toString(16).padStart(2, '0')).join('');
    } finally {
      try {
        renderer.setViewport(viewport);
        renderer.setScissor(scissor);
        renderer.setScissorTest(scissorTest);
        renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
      } finally { target.dispose(); }
    }
  } catch { return null; }
}

/** Read existing ink only: no texture allocation, rendering readback or network request. */
export function samplePaintColour(wall: PaintWall, face: number, u: number, v: number): string | null {
  if (![u, v].every(Number.isFinite) || u < 0 || u > 1 || v < 0 || v > 1) return null;
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  try {
    for (const layer of wall.layers) {
      if (!layer.mesh.visible) continue;
      const context = layer.contexts[face];
      if (!context) continue;
      const { width, height } = context.canvas;
      if (!width || !height) continue;
      const pixel = context.getImageData(Math.min(width - 1, Math.floor(u * width)), Math.min(height - 1, Math.floor((1 - v) * height)), 1, 1).data;
      const incoming = pixel[3] / 255;
      red = pixel[0] * incoming + red * (1 - incoming);
      green = pixel[1] * incoming + green * (1 - incoming);
      blue = pixel[2] * incoming + blue * (1 - incoming);
      alpha = incoming + alpha * (1 - incoming);
    }
  } catch {
    // Imported cross-origin artwork may make a face unreadable.
    return null;
  }
  if (alpha <= 0) return null;
  return '#' + [red, green, blue].map(value => Math.round(value / alpha).toString(16).padStart(2, '0')).join('');
}
