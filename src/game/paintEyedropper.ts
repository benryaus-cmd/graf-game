import type { PaintWall } from './worldTypes';

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
