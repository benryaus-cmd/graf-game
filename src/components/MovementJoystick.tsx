import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MovementInput } from '@/game/worldTypes';

interface MovementJoystickProps {
  onMove: (movement: MovementInput) => void;
}

const MovementJoystick = ({ onMove }: MovementJoystickProps) => {
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.34;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setKnob({ x, y });
    onMove({ x: x / radius, y: -y / radius });
  };

  const handleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event);
  };
  const reset = () => {
    setKnob({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
  };

  return (
    <div
      className="joystick"
      role="group"
      aria-label="Movement control"
      onPointerDown={handleDown}
      onPointerMove={(event) => { if (event.buttons > 0) update(event); }}
      onPointerUp={reset}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      <span className="joy-ring joy-ring-inner" />
      <span className="joy-label">MOVE</span>
      <span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}><i /></span>
    </div>
  );
};

export default MovementJoystick;