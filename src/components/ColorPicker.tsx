import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { colorAtHue, hexToHsv, hsvToHex } from '@/game/colorPicker';
import { elementPointerPoint } from '@/game/pointerCoordinates';

export default function ColorPicker({ color, onChange, onCommit }: { color: string; onChange: (color: string) => void; onCommit?: (color: string) => void }) {
  // Retain a chosen hue when saturation/value reaches zero.
  const [lastHue, setLastHue] = useState(() => hexToHsv(color).h);
  const hsv = hexToHsv(color);
  useEffect(() => { const value = hexToHsv(color); if (value.s && value.v) setLastHue(value.h); }, [color]);
  const hue = hsv.s && hsv.v ? hsv.h : lastHue;
  const pointer = useRef<number | null>(null);
  const latest = useRef(color);
  latest.current = color;
  const dirty = useRef(false);
  const preview = (next: string) => { latest.current = next; dirty.current = true; onChange(next); };
  const commit = () => { if (dirty.current) { dirty.current = false; onCommit?.(latest.current); } };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null; commit();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const update = (event: PointerEvent<HTMLDivElement>) => {
    const point = elementPointerPoint(event.currentTarget, event);
    preview(hsvToHex({ h: hue, s: Math.max(0, Math.min(1, point.x)) * 100, v: (1 - Math.max(0, Math.min(1, point.y))) * 100 }));
  };
  return <div className="custom-color-picker">
    <div className="color-spectrum" role="slider" tabIndex={0} aria-label="Colour saturation and brightness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hsv.s)} aria-valuetext={`${Math.round(hsv.s)}% saturation, ${Math.round(hsv.v)}% brightness`} style={{ backgroundColor: hsvToHex({ h: hue, s: 100, v: 100 }) }}
      onPointerDown={event => { if (pointer.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return; event.preventDefault(); event.stopPropagation(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); update(event); }}
      onPointerMove={event => { if (pointer.current === event.pointerId) update(event); }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onKeyDown={event => { const dx = event.key === 'ArrowRight' ? 2 : event.key === 'ArrowLeft' ? -2 : 0; const dy = event.key === 'ArrowUp' ? 2 : event.key === 'ArrowDown' ? -2 : 0; if (dx || dy) { event.preventDefault(); preview(hsvToHex({ h: hue, s: hsv.s + dx, v: hsv.v + dy })); } }} onKeyUp={commit} onBlur={commit}>
      <i style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }} />
    </div>
    <label className="paint-range hue-range"><span><b>COLOUR / HUE</b><i>{Math.round(hue)}°</i></span><input aria-label="Custom colour hue" type="range" min={0} max={359} value={Math.round(hue)} onChange={event => { const h = Number(event.target.value); setLastHue(h); preview(colorAtHue(color, h)); }} onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit} /></label>
    <div className="hue-presets" aria-label="Base colour hues">{[{ h: 0, name: 'Red' }, { h: 30, name: 'Orange' }, { h: 60, name: 'Yellow' }, { h: 120, name: 'Green' }, { h: 180, name: 'Cyan' }, { h: 210, name: 'Blue' }, { h: 240, name: 'Indigo' }, { h: 270, name: 'Purple' }, { h: 300, name: 'Magenta' }, { h: 330, name: 'Pink' }].map(item => <button type="button" key={item.h} aria-label={`Mix ${item.name.toLowerCase()} hue`} title={item.name} style={{ backgroundColor: hsvToHex({ h: item.h, s: 100, v: 100 }) }} onClick={() => { setLastHue(item.h); preview(colorAtHue(color, item.h)); commit(); }} />)}</div>
    <div className="color-picker-preview"><i style={{ backgroundColor: color }} /><span>{color.toUpperCase()}</span><small>Drag to mix your colour</small></div>
  </div>;
}
