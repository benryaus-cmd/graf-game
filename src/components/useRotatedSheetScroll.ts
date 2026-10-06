import { useRef, type PointerEvent, type MouseEvent } from 'react';
import { elementPointerIsRotated, elementPointerPoint } from '@/game/pointerCoordinates';

type ScrollAxis = 'x' | 'y';
interface Gesture {
  id: number; x: number; y: number; left: number; top: number;
  horizontal: HTMLElement | null; vertical: HTMLElement | null; axis: ScrollAxis | null;
}

/** Chromium/WebView cannot reliably pan overflow inside a quarter-turned game shell. */
export function useRotatedSheetScroll() {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const onPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    // A fresh press (including mouse input after a touch swipe) is a new action.
    if (!gesture.current) suppressClick.current = false;
    if (event.pointerType !== 'touch' || gesture.current || !elementPointerIsRotated(event.currentTarget)) return;
    const origin = event.target as Element;
    // Drawing canvases, colour mixing and sliders already own their gestures.
    if (origin.closest('input, textarea, select, canvas, .color-spectrum, [contenteditable="true"], [data-gesture-owner]')) return;
    let target: HTMLElement | null = origin instanceof HTMLElement ? origin : origin.parentElement;
    let horizontal: HTMLElement | null = null, vertical: HTMLElement | null = null;
    while (target && event.currentTarget.contains(target)) {
      const style = getComputedStyle(target);
      if (!vertical && target.scrollHeight > target.clientHeight + 1 && ['auto', 'scroll'].includes(style.overflowY)) vertical = target;
      if (!horizontal && target.scrollWidth > target.clientWidth + 1 && ['auto', 'scroll'].includes(style.overflowX)) horizontal = target;
      if (target === event.currentTarget) break;
      target = target.parentElement;
    }
    if (!vertical && !horizontal) return;
    const point = elementPointerPoint(event.currentTarget, event);
    gesture.current = { id: event.pointerId, x: point.x * event.currentTarget.clientWidth, y: point.y * event.currentTarget.clientHeight, left: horizontal?.scrollLeft ?? 0, top: vertical?.scrollTop ?? 0, horizontal, vertical, axis: null };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const point = elementPointerPoint(event.currentTarget, event);
    const dx = point.x * event.currentTarget.clientWidth - start.x;
    const dy = point.y * event.currentTarget.clientHeight - start.y;
    if (!start.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 7) return;
      const axis: ScrollAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'x' ? !start.horizontal : !start.vertical) return;
      start.axis = axis;
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressClick.current = true;
    }
    event.preventDefault(); event.stopPropagation();
    if (start.axis === 'x') start.horizontal!.scrollLeft = start.left - dx;
    else start.vertical!.scrollTop = start.top - dy;
  };
  const finish = (event: PointerEvent<HTMLElement>) => {
    if (gesture.current?.id !== event.pointerId) return;
    if (gesture.current.axis) event.preventDefault();
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onLostPointerCapture = (event: PointerEvent<HTMLElement>) => {
    // Changing implicit capture from a pressed button to the scrolling body emits
    // a bubbled lost-capture event for that button; it must not cancel our drag.
    if (event.target === event.currentTarget) finish(event);
  };
  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
  };
  return { onPointerDownCapture, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture, onClickCapture };
}
