import { useEffect, useRef, useState } from 'react';
import GameSheet from './GameSheet';
import type { ReferenceSettings } from '@/game/referenceGuide';
import { downloadReferenceFile, loadReferenceImage } from '@/game/referenceImage';

interface Props { selected: boolean; guide: ReferenceSettings | null; onClose: () => void; onChange: (guide: ReferenceSettings | null) => void }
export default function ReferenceSheet({ selected, guide, onClose, onChange }: Props) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const generation = useRef(0);
  const download = useRef<AbortController | null>(null);
  useEffect(() => () => { ++generation.current; download.current?.abort(); }, []);
  const load = async (source?: File | string) => {
    if (!source) return;
    const token = ++generation.current;
    download.current?.abort();
    const request = new AbortController();
    download.current = request;
    setLoading(true); setError('');
    try {
      const file = typeof source === 'string' ? await downloadReferenceFile(source, request.signal) : source;
      if (generation.current !== token) return;
      const url = await loadReferenceImage(file);
      if (generation.current !== token) { URL.revokeObjectURL(url); return; }
      onChange({ url, name: file.name, visible: true, moving: false, opacity: .35, scale: 1, x: 0, y: 0, rotation: 0 });
      setImageUrl('');
    } catch (e) { if (generation.current === token) setError(e instanceof Error ? e.message : 'Could not open that image.'); }
    finally { if (generation.current === token) setLoading(false); }
  };
  return <GameSheet title="REFERENCE" subtitle="A ghost guide for your painting" className="reference-sheet" onClose={onClose}>
    <p className="empty-state">Only you see this guide. It is never saved into your piece or sent to the server.</p>
    {!selected && <p className="ui-notice">Select a canvas first to place a reference on its wall.</p>}
    <form className="reference-link" onSubmit={event => { event.preventDefault(); void load(imageUrl); }}>
      <label><span>IMAGE URL</span><input type="url" aria-label="Reference image URL" placeholder="https://…/image.jpg" value={imageUrl} disabled={loading} onChange={event => setImageUrl(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
      <button type="submit" className="ui-primary" disabled={!selected || loading || !imageUrl.trim()}>{loading ? 'LOADING IMAGE…' : 'USE IMAGE URL'}</button>
    </form>
    <p className="empty-state">Paste the image address itself. It stays in this session and works in Solo.</p>
    <label className="reference-file ui-button">{loading ? 'OPENING IMAGE…' : guide ? 'REPLACE FROM PHONE' : 'CHOOSE FROM PHONE'}<input aria-label="Choose reference image" type="file" accept="image/*" disabled={!selected || loading} onChange={event => { void load(event.target.files?.[0]); event.target.value = ''; }} /></label>
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
