import { useState } from 'react';
import type { PosterPlacementRequest } from '@/game/usePosterPlacement';

interface PosterPlacementHudProps {
  placement: PosterPlacementRequest;
  size: number;
  valid: boolean;
  onSizeChange: (size: number) => void;
  onPlace: () => void;
  onCancel: () => void;
}

const PosterPlacementHud = ({
  placement, size, valid, onSizeChange, onPlace, onCancel,
}: PosterPlacementHudProps) => {
  const [collapsed, setCollapsed] = useState(false);
  return (
  <section className={`poster-placement-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="Poster placement controls">
    <div className="poster-placement-title">
      <img src={placement.dataUrl} alt="" />
      <div><small>POSTER IN HAND</small><b>{valid ? 'WALL FOUND' : 'FIND A WALL'}</b></div>
      <button type="button" aria-label={collapsed ? 'Expand poster controls' : 'Collapse poster controls'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? '▾' : '−'}</button>
      <button type="button" aria-label="Cancel poster placement" onClick={onCancel}>×</button>
    </div>
    <div hidden={collapsed}>
    <label className="poster-size-control poster-placement-size">
      <span>SIZE <b>{size.toFixed(1)} m</b></span>
      <input
        type="range" min="0.4" max="4" step="0.1" value={size}
        aria-label="Adjust poster size while carrying it"
        onChange={(event) => onSizeChange(Number(event.target.value))}
      />
    </label>
    <div className={`poster-placement-status ${valid ? 'poster-placement-valid' : ''}`} aria-live="polite">
      <i />{valid ? 'GREEN OUTLINE · READY TO PLACE' : 'AIM AT A FLAT WALL SURFACE'}
    </div>
    <button type="button" className="poster-place-button" disabled={!valid} onClick={onPlace}>
      PLACE POSTER <span aria-hidden="true">↓</span>
    </button>
    </div>
  </section>
);
};

export default PosterPlacementHud;