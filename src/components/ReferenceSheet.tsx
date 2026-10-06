import { useEffect, useRef, useState } from 'react';
import GameSheet from './GameSheet';
import type { ReferenceSettings } from '@/game/referenceGuide';
import { loadReferenceImage } from '@/game/referenceImage';

interface Props { selected: boolean; guide: ReferenceSettings | null; onClose: () => void; onChange: (guide: ReferenceSettings | null) => void }
export default function ReferenceSheet({ selected, guide, onClose, onChange }: Props) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { ++generation.current; }, []);
  const load = async (file?: File) => {
    if (!file) return;
    const token = ++generation.current;
    setLoading(true); setError('');
    try {
      const url = await loadReferenceImage(file);
      if (generation.current !== token) { URL.revokeObjectURL(url); return; }
      onChange({ url, name: file.name, visible: true, moving: false, opacity: .35, scale: 1, x: 0, y: 0, rotation: 0 });
    } catch (e) { if (generation.current === token) setError(e instanceof Error ? e.message : 'Could not open that image.'); }
    finally { if (generation.current === token) setLoading(false); }
  };
  return <GameSheet title="REFERENCE" subtitle="A ghost guide for your painting" className="reference-sheet" onClose={onClose}>
    <p className="empty-state">Only you see this guide. It is never saved into your piece or sent to the server.</p>
    {!selected && <p className="ui-notice">Select a canvas first to place a reference on its wall.</p>}
    <label className="reference-file ui-button">{loading ? 'OPENING IMAGE…' : guide ? 'REPLACE IMAGE' : 'CHOOSE IMAGE'}<input aria-label="Choose reference image" type="file" accept="image/png,image/jpeg,image/webp" disabled={!selected || loading} onChange={event => { void load(event.target.files?.[0]); event.target.value = ''; }} /></label>
    {error && <p className="ui-notice" role="alert">{error}</p>}
    {guide && <>
      <img className="reference-thumbnail" src={guide.url} alt={`Reference: ${guide.name}`} />
      <div className="button-row"><button type="button" aria-pressed={guide.visible} onClick={() => onChange({ ...guide, visible: !guide.visible })}>{guide.visible ? 'HIDE GUIDE' : 'SHOW GUIDE'}</button><button type="button" disabled={!selected} onClick={() => { onChange({ ...guide, visible: true, moving: true }); onClose(); }}>MOVE GUIDE</button></div>
      <p className="empty-state">Move it inside the canvas or beside it. Drag in Move Guide, then tap Done.</p>
      <label className="paint-range"><span><b>GHOST OPACITY</b><i>{Math.round(guide.opacity * 100)}%</i></span><input type="range" aria-label="Reference opacity" min={.1} max={.85} step={.05} value={guide.opacity} onChange={event => onChange({ ...guide, opacity: Number(event.target.value) })} /></label>
      <label className="paint-range"><span><b>SIZE</b><i>{Math.round(guide.scale * 100)}%</i></span><input type="range" aria-label="Reference size" min={.1} max={3} step={.05} value={guide.scale} onChange={event => onChange({ ...guide, scale: Number(event.target.value) })} /></label>
      <label className="paint-range"><span><b>ROTATION</b><i>{guide.rotation}°</i></span><input type="range" aria-label="Reference rotation" min={-180} max={180} value={guide.rotation} onChange={event => onChange({ ...guide, rotation: Number(event.target.value) })} /></label>
      <div className="button-row"><button type="button" onClick={() => onChange({ ...guide, x: 0, y: 0, scale: 1, rotation: 0 })}>FIT CANVAS</button><button type="button" onClick={() => onChange(null)}>REMOVE GUIDE</button></div>
    </>}
  </GameSheet>;
}
