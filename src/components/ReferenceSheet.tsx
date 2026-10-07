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
      onChange({ url, name: file.name, visible: true, moving: true, opacity: .35, scale: 1, x: 0, y: 0, rotation: 0, aboveArt: true });
      setImageUrl('');
      onClose();
    } catch (e) { if (generation.current === token) setError(e instanceof Error ? e.message : 'Could not open that image.'); }
    finally { if (generation.current === token) setLoading(false); }
  };
  return <GameSheet title="REFERENCE" subtitle="A ghost guide for your painting" className="reference-sheet" onClose={onClose}>
    <p className="empty-state">Only you see this guide. It is never saved into your piece or sent to the server.</p>
    {!selected && <p className="ui-notice">Select a canvas first to place a reference on its wall.</p>}
    <details className="reference-source" open={guide ? undefined : true}><summary>{guide ? 'Replace reference image' : 'Choose reference image'}</summary>
    <form className="reference-link" onSubmit={event => { event.preventDefault(); void load(imageUrl); }}>
      <label><span>IMAGE URL</span><input type="url" aria-label="Reference image URL" placeholder="https://…/image.jpg" value={imageUrl} disabled={loading} onChange={event => setImageUrl(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
      <button type="submit" className="ui-primary" disabled={!selected || loading || !imageUrl.trim()}>{loading ? 'LOADING IMAGE…' : 'USE IMAGE URL'}</button>
    </form>
    <p className="empty-state">Paste the image address itself. It stays in this session and works in Solo.</p>
    <label className="reference-file ui-button">{loading ? 'OPENING IMAGE…' : guide ? 'REPLACE FROM PHONE' : 'CHOOSE FROM PHONE'}<input aria-label="Choose reference image" type="file" accept="image/*" disabled={!selected || loading} onChange={event => { void load(event.target.files?.[0]); event.target.value = ''; }} /></label>
    </details>
    {error && <p className="ui-notice" role="alert">{error}</p>}
    {guide && <>
      <details className="reference-preview"><summary>Preview · {guide.name}</summary><img className="reference-thumbnail" src={guide.url} alt={`Reference: ${guide.name}`} /></details>
      <button type="button" className="reference-adjust-start ui-primary" disabled={!selected} onClick={() => { onChange({ ...guide, visible: true, moving: true }); onClose(); }}>ADJUST GUIDE</button>
      <p className="empty-state">Adjust on the wall with the screen clear: hold the image to move it, and use the sliders at the bottom.</p>
      <div className="button-row"><button type="button" aria-pressed={guide.visible} onClick={() => onChange({ ...guide, visible: !guide.visible })}>{guide.visible ? 'HIDE GUIDE' : 'SHOW GUIDE'}</button><button type="button" aria-label="Reference above artwork" aria-pressed={guide.aboveArt !== false} onClick={() => onChange({ ...guide, aboveArt: guide.aboveArt === false })}>{guide.aboveArt !== false ? 'ABOVE ART' : 'BELOW PAINT'}</button></div>
      <div className="button-row"><button type="button" onClick={() => onChange({ ...guide, x: 0, y: 0, scale: 1, rotation: 0 })}>FIT CANVAS</button><button type="button" onClick={() => onChange(null)}>REMOVE GUIDE</button></div>
    </>}
  </GameSheet>;
}
