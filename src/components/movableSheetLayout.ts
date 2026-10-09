import { viewportPoint, type ViewportRect } from '@/game/pointerCoordinates';

export interface SheetPosition { x: number; y: number }
export interface SheetSize { width: number; height: number }
export interface SheetBounds extends SheetSize { left: number; right: number; top: number; bottom: number }
const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export function clampSheetPosition(point: SheetPosition, bounds: SheetBounds, size: SheetSize): SheetPosition {
  return { x: clamp(point.x, bounds.left, bounds.width - bounds.right - size.width), y: clamp(point.y, bounds.top, bounds.height - bounds.bottom - size.height) };
}

export function defaultSheetPosition(bounds: SheetBounds, size: SheetSize): SheetPosition {
  return clampSheetPosition({ x: bounds.width - bounds.right - size.width, y: 96 }, bounds, size);
}

export function normalizeSheetPosition(point: SheetPosition, bounds: SheetBounds, size: SheetSize): SheetPosition {
  const safe = clampSheetPosition(point, bounds, size);
  const width = Math.max(0, bounds.width - bounds.left - bounds.right - size.width);
  const height = Math.max(0, bounds.height - bounds.top - bounds.bottom - size.height);
  return { x: width ? (safe.x - bounds.left) / width : 1, y: height ? (safe.y - bounds.top) / height : 0 };
}

export function restoreSheetPosition(position: SheetPosition, bounds: SheetBounds, size: SheetSize): SheetPosition {
  return clampSheetPosition({
    x: bounds.left + position.x * Math.max(0, bounds.width - bounds.left - bounds.right - size.width),
    y: bounds.top + position.y * Math.max(0, bounds.height - bounds.top - bounds.bottom - size.height),
  }, bounds, size);
}

export function sheetLocalPointer(point: SheetPosition, rectangle: ViewportRect, width: number, height: number, rotated: boolean): SheetPosition {
  const local = viewportPoint(point.x, point.y, rectangle, rotated);
  return { x: local.x * width, y: local.y * height };
}

export function sheetPositionKey(className: string, title: string) { return `graffciti.sheet-position.v1:${className}:${title}`; }

export function readSheetPosition(value: string | null): SheetPosition | null {
  try {
    const point = JSON.parse(value ?? 'null');
    return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) } : null;
  } catch { return null; }
}

export function readSheetAnchorSize(value: string | null): SheetSize | null {
  try {
    const saved = JSON.parse(value ?? 'null');
    return saved && Number.isFinite(saved.anchorWidth) && saved.anchorWidth > 0 && Number.isFinite(saved.anchorHeight) && saved.anchorHeight > 0
      ? { width: saved.anchorWidth, height: saved.anchorHeight } : null;
  } catch { return null; }
}
