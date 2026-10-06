import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LookInput } from '@/game/worldTypes';
import { elementPointerIsRotated, elementPointerPoint } from '@/game/pointerCoordinates';

interface LookJoystickProps {
  canvasMode?: boolean;
  onLook: (look: LookInput) => void;
}

const LookJoystick = ({ onLook, canvasMode = false }: LookJoystickProps) => {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePointer = useRef<number | null>(null);
  const element = useRef<HTMLDivElement>(null);

  const resetAll = () => {
    const pointerId = activePointer.current;
    activePointer.current = null;
    if (pointerId !== null && element.current?.hasPointerCapture(pointerId)) {
      element.current.releasePointerCapture(pointerId);
    }
    setKnob({ x: 0, y: 0 });
    onLook({ x: 0, y: 0 });
  };

  useEffect(() => {
    window.addEventListener('blur', resetAll);
    return () => {
      window.removeEventListener('blur', resetAll);
      resetAll();
    };
  }, [onLook]);

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.34;
    const point = elementPointerPoint(event.currentTarget, event);
    const rotated = elementPointerIsRotated(event.currentTarget);
    const localWidth = rotated ? rect.height : rect.width;
    const localHeight = rotated ? rect.width : rect.height;
    const dx = (point.x - 0.5) * localWidth;
    const dy = (point.y - 0.5) * localHeight;
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setKnob({ x, y });
    onLook({ x: x / radius, y: -y / radius });
  };

  const handleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== null || (event.pointerType === 'mouse' && (!event.isPrimary || event.button !== 0))) return;
    event.preventDefault();
    activePointer.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
      update(event);
    } catch {
      resetAll();
    }
  };

  const handleEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    onLook({ x: 0, y: 0 });
  };

  return (
    <div
      className={`joystick look-joystick ${canvasMode ? 'canvas-pan-joystick' : ''}`}
      data-tutorial="look"
      ref={element}
      role="group"
      aria-label={canvasMode ? 'Pan canvas' : 'Look control'}
      onPointerDown={handleDown}
      onPointerMove={(event) => { if (activePointer.current === event.pointerId) update(event); }}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
      onLostPointerCapture={handleEnd}
      style={{ right: 20, left: 'auto', touchAction: 'none' }}
    >
      <span className="joy-ring joy-ring-inner" />
      <span className="joy-label">{canvasMode ? 'PAN' : 'LOOK'}</span>
      <span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}><i /></span>
    </div>
  );
};

export default LookJoystick;
