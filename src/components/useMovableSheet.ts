import { useLayoutEffect, useRef, type RefObject, type PointerEvent, type MouseEvent } from 'react';
import { elementPointerIsRotated } from '@/game/pointerCoordinates';
import { clampSheetPosition, defaultSheetPosition, normalizeSheetPosition, readSheetAnchorSize, readSheetPosition, restoreSheetPosition, sheetLocalPointer, type SheetBounds, type SheetPosition, type SheetSize } from './movableSheetLayout';

interface Drag { id: number; pointer: SheetPosition; position: SheetPosition; moved: boolean }
interface Layout { bounds: SheetBounds; size: SheetSize; position: SheetPosition }

export function useMovableSheet(panel: RefObject<HTMLElement | null>, storageKey: string, collapsed: boolean) {
  const layout = useRef<Layout | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const normalized = useRef<SheetPosition>({ x: 1, y: 0 });
  const intended = useRef<SheetPosition | null>(null);
  const anchorSize = useRef<SheetSize | null>(null);
  const place = (position: SheetPosition) => {
    const element = panel.current, current = layout.current;
    if (!element || !current) return;
    current.position = clampSheetPosition(position, current.bounds, current.size);
    element.style.left = `${current.position.x}px`;
    element.style.top = `${current.position.y}px`;
    element.style.right = 'auto';
  };
  const save = () => {
    const current = layout.current;
    if (!current) return;
    normalized.current = normalizeSheetPosition(current.position, current.bounds, current.size);
    anchorSize.current = { ...current.size };
    intended.current = { ...current.position };
    try { localStorage.setItem(storageKey, JSON.stringify({ ...normalized.current, anchorWidth: current.size.width, anchorHeight: current.size.height })); } catch { /* Dragging still works with restricted storage. */ }
  };

  useLayoutEffect(() => {
    const element = panel.current, overlay = element?.parentElement, shell = element?.closest<HTMLElement>('.game-shell');
    if (!element || !overlay || !shell) return;
    let saved: SheetPosition | null = null;
    try {
      const stored = localStorage.getItem(storageKey);
      saved = readSheetPosition(stored); anchorSize.current = readSheetAnchorSize(stored);
    } catch { anchorSize.current = null; }
    normalized.current = saved ?? { x: 1, y: 0 };
    layout.current = null;
    intended.current = null;
    const measure = () => {
      if (!overlay.clientWidth || !overlay.clientHeight) return;
      const padding = getComputedStyle(overlay);
      const margin = (side: string) => Math.max(8, Number.parseFloat(padding.getPropertyValue(`padding-${side}`)) || 0);
      const bounds = { width: overlay.clientWidth, height: overlay.clientHeight, left: margin('left'), right: margin('right'), top: margin('top'), bottom: margin('bottom') };
      element.style.maxHeight = `${Math.max(0, bounds.height - bounds.top - bounds.bottom)}px`;
      element.style.maxWidth = `${Math.max(0, bounds.width - bounds.left - bounds.right)}px`;
      const size = { width: element.offsetWidth, height: element.offsetHeight };
      const previous = layout.current;
      const resized = previous && (previous.bounds.width !== bounds.width || previous.bounds.height !== bounds.height);
      if (!previous) {
        anchorSize.current ??= { ...size };
        intended.current = saved ? restoreSheetPosition(normalized.current, bounds, anchorSize.current) : { x: bounds.width - bounds.right - size.width, y: 96 };
        if (!saved) normalized.current = normalizeSheetPosition(defaultSheetPosition(bounds, size), bounds, size);
      } else if (resized) intended.current = restoreSheetPosition(normalized.current, bounds, anchorSize.current!);
      const position = clampSheetPosition(drag.current && previous ? previous.position : intended.current!, bounds, size);
      layout.current = { bounds, size, position };
      place(position);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(overlay); observer.observe(element);
    const orientation = new MutationObserver(measure);
    orientation.observe(shell, { attributes: true, attributeFilter: ['class'] });
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      observer.disconnect(); orientation.disconnect();
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      drag.current = null;
    };
  }, [panel, storageKey]);

  // ResizeObserver measures the collapsed header and reclamps expansion. Keep the
  // dependency explicit so a collapse with unchanged dimensions still clears drag.
  useLayoutEffect(() => { drag.current = null; }, [collapsed]);

  const localPoint = (event: PointerEvent<HTMLElement>) => {
    const overlay = panel.current!.parentElement!;
    return sheetLocalPointer({ x: event.clientX, y: event.clientY }, overlay.getBoundingClientRect(), overlay.clientWidth, overlay.clientHeight, elementPointerIsRotated(overlay));
  };
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const target = event.target as Element;
    if (!event.isPrimary || event.button !== 0 || drag.current || !layout.current || target.closest('button, input, textarea, select, a, summary, [contenteditable="true"], [data-gesture-owner]')) return;
    event.preventDefault(); event.stopPropagation();
    drag.current = { id: event.pointerId, pointer: localPoint(event), position: { ...layout.current.position }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const point = localPoint(event), dx = point.x - start.pointer.x, dy = point.y - start.pointer.y;
    start.moved ||= Math.hypot(dx, dy) > 3;
    suppressClick.current ||= start.moved;
    place({ x: start.position.x + dx, y: start.position.y + dy });
  };
  const finish = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    if (drag.current.moved) save();
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onLostPointerCapture = (event: PointerEvent<HTMLElement>) => { if (event.target === event.currentTarget) finish(event); };
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
  };
  return {
    header: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture },
    overlay: { onPointerDownCapture: () => { suppressClick.current = false; }, onClickCapture },
  };
}
