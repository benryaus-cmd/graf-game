export interface NormalizedPointerPoint { x: number; y: number }
export interface ViewportRect { left: number; top: number; width: number; height: number }

/** Returns top-left-origin 0..1 coordinates in the element's unrotated space. */
export function viewportPoint(
  clientX: number,
  clientY: number,
  rect: ViewportRect,
  rotated: boolean,
): NormalizedPointerPoint {
  const screenX = rect.width ? (clientX - rect.left) / rect.width : 0;
  const screenY = rect.height ? (clientY - rect.top) / rect.height : 0;
  if (rotated) {
    // Invert the clockwise quarter-turn: local (x, y) maps to screen (1 - y, x).
    return { x: screenY, y: 1 - screenX };
  }
  return { x: screenX, y: screenY };
}

export function elementPointerIsRotated(element: Element): boolean {
  return Boolean(
    typeof element.closest === 'function' && element.closest('.game-portrait') &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(orientation: landscape)').matches,
  );
}

export function elementPointerPoint(
  element: Pick<HTMLElement, 'getBoundingClientRect'>,
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
): NormalizedPointerPoint {
  return viewportPoint(event.clientX, event.clientY, element.getBoundingClientRect(), elementPointerIsRotated(element as Element));
}
