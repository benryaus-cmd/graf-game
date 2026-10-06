interface Rectangle { left: number; top: number; right: number; bottom: number }
interface Viewport { offsetLeft: number; offsetTop: number; width: number; height: number }

/** Convert the visible screen intersection into the shell's own coordinates. */
export function sheetViewport(rect: Rectangle, width: number, height: number, viewport: Viewport, rotated: boolean) {
  const left = Math.max(rect.left, viewport.offsetLeft);
  const top = Math.max(rect.top, viewport.offsetTop);
  const right = Math.max(left, Math.min(rect.right, viewport.offsetLeft + viewport.width));
  const bottom = Math.max(top, Math.min(rect.bottom, viewport.offsetTop + viewport.height));
  const screenWidth = rect.right - rect.left || 1;
  const screenHeight = rect.bottom - rect.top || 1;
  return rotated ? {
    left: (rect.bottom - bottom) * width / screenHeight,
    top: (left - rect.left) * height / screenWidth,
    width: (bottom - top) * width / screenHeight,
    height: (right - left) * height / screenWidth,
  } : {
    left: (left - rect.left) * width / screenWidth,
    top: (top - rect.top) * height / screenHeight,
    width: (right - left) * width / screenWidth,
    height: (bottom - top) * height / screenHeight,
  };
}
