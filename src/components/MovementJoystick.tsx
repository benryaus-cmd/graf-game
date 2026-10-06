import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MovementInput } from '@/game/worldTypes';
import { elementPointerIsRotated, elementPointerPoint } from '@/game/pointerCoordinates';

interface MovementJoystickProps {
  onMove: (movement: MovementInput) => void;
}

const MovementJoystick = ({ onMove }: MovementJoystickProps) => {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePointer = useRef<number | null>(null);
  const element = useRef<HTMLDivElement>(null);

  const reset = () => {
    const pointerId = activePointer.current;
    activePointer.current = null;
    if (pointerId !== null && element.current?.hasPointerCapture(pointerId)) {
      element.current.releasePointerCapture(pointerId);
    }
    setKnob({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
  };

  useEffect(() => {
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('blur', reset);
      reset();
    };
  }, [onMove]);

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rotated = elementPointerIsRotated(event.currentTarget);
    const width = rotated ? rect.height : rect.width;
    const height = rotated ? rect.width : rect.height;
    const radius = width * 0.34;
    const point = elementPointerPoint(event.currentTarget, event);
    const dx = (point.x - 0.5) * width;
    const dy = (point.y - 0.5) * height;
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setKnob({ x, y });
    onMove({ x: x / radius, y: -y / radius });
  };

  const handleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== null || (event.pointerType === 'mouse' && (!event.isPrimary || event.button !== 0))) return;
    event.preventDefault();
    activePointer.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
      update(event);
    } catch {
      reset();
    }
  };
  const handleEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
  };

  return (
    <div
      className="joystick"
      data-tutorial="movement"
      ref={element}
      role="group"
      aria-label="Movement control"
      onPointerDown={handleDown}
      onPointerMove={(event) => { if (activePointer.current === event.pointerId) update(event); }}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
      onLostPointerCapture={handleEnd}
    >
      <span className="joy-ring joy-ring-inner" />
      <span className="joy-label">MOVE</span>
      <span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}><i /></span>
    </div>
  );
};

export default MovementJoystick;
