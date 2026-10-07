import { useEffect, useRef, useState } from 'react';
import GameSheet from './GameSheet';
import type { ReferenceSettings } from '@/game/referenceGuide';
import { downloadReferenceFile, loadReferenceImage } from '@/game/referenceImage';
import { ReferenceLibrary, createReferenceThumbnail, type LocalReference } from '@/game/referenceLibrary';

interface Props {
  selected: boolean; guide: ReferenceSettings | null; onClose: () => void; onChange: (guide: ReferenceSettings | null) => void;
  ownerReferences?: readonly { referenceId: string; name: string; assetRef: string }[];
  canKeepReference?: boolean;
  ownerReferenceBusy?: boolean;
  ownerReferenceNotice?: string;
  onKeepReference?: () => void;
  onDeleteOwnerReference?: (id: string) => void;
}

function LibraryReference({ entry, selected, deleting, onSelect, onDelete }: { entry: LocalReference; selected: boolean; deleting: boolean; onSelect: () => void; onDelete: () => void }) {
  const [thumbnail, setThumbnail] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(entry.thumbnail);
    setThumbnail(url);
    // Thumbnail ownership is separate from the selected guide's decoded object URL.
    return () => URL.revokeObjectURL(url);
  }, [entry.thumbnail]);
  return <li style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--edge)' }}>
    <button type="button" disabled={!selected || deleting} onClick={onSelect} aria-label={`Use saved reference ${entry.name}`} style={{ padding: 0, width: 56, height: 56, overflow: 'hidden' }}>{thumbnail && <img src={thumbnail} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />}</button>
    <button type="button" disabled={!selected || deleting} onClick={onSelect} style={{ minWidth: 0, minHeight: 44, textAlign: 'left', overflowWrap: 'anywhere', fontSize: 12 }}>{entry.name}</button>
    <button type="button" disabled={deleting} onClick={onDelete} aria-label={`Delete saved reference ${entry.name}`} style={{ minHeight: 44, padding: 8, fontSize: 10 }}>{deleting ? 'DELETING…' : 'DELETE'}</button>
  </li>;
}

export default function ReferenceSheet({ selected, guide, onClose, onChange, ownerReferences = [], canKeepReference = false, ownerReferenceBusy = false, ownerReferenceNotice, onKeepReference, onDeleteOwnerReference }: Props) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [library] = useState(() => new ReferenceLibrary());
  const [entries, setEntries] = useState<LocalReference[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [libraryError, setLibraryError] = useState('');
  const [deleting, setDeleting] = useState<string[]>([]);
  const [confirmServerDelete, setConfirmServerDelete] = useState<string | null>(null);
  const generation = useRef(0);
  const libraryGeneration = useRef(0);
  const mounted = useRef(false);
  const canvasSelected = useRef(selected);
  canvasSelected.current = selected;
  const download = useRef<AbortController | null>(null);
  const refreshLibrary = async () => {
    const token = ++libraryGeneration.current;
    setLibraryLoading(true);
    try {
      const saved = await library.list();
      if (mounted.current && libraryGeneration.current === token) { setEntries(saved); setLibraryError(''); }
    } catch (error) {
      if (mounted.current && libraryGeneration.current === token) setLibraryError(error instanceof Error ? error.message : 'Could not open device reference storage.');
    } finally { if (mounted.current && libraryGeneration.current === token) setLibraryLoading(false); }
  };
  useEffect(() => {
    mounted.current = true;
    void refreshLibrary();
    return () => { mounted.current = false; ++generation.current; ++libraryGeneration.current; download.current?.abort(); };
  }, [library]);
  useEffect(() => {
    if (!selected) { ++generation.current; download.current?.abort(); setLoading(false); }
  }, [selected]);
  const cancelLoad = () => { ++generation.current; download.current?.abort(); setLoading(false); };
  const close = () => { cancelLoad(); onClose(); };
  const remove = async (id: string) => {
    setDeleting(current => [...current, id]);
    try {
      await library.remove(id);
      if (!mounted.current) return;
      ++libraryGeneration.current;
      setLibraryLoading(false);
      setEntries(current => current.filter(entry => entry.id !== id));
      setLibraryError('');
      // Deleting stored data must not remove/revoke an already selected session guide.
    } catch (error) {
      if (mounted.current) setLibraryError(error instanceof Error ? error.message : 'Could not delete this saved reference.');
    } finally { if (mounted.current) setDeleting(current => current.filter(value => value !== id)); }
  };
  const load = async (source?: File | string | LocalReference) => {
    if (!source || !canvasSelected.current) return;
    const token = ++generation.current;
    download.current?.abort();
    const request = new AbortController();
    download.current = request;
    setLoading(true); setError('');
    let pendingUrl: string | undefined;
    try {
      const saved = typeof source === 'object' && 'image' in source;
      const file = typeof source === 'string' ? await downloadReferenceFile(source, request.signal)
        : saved ? new File([source.image], source.name, { type: source.type }) : source as File;
      if (generation.current !== token) return;
      pendingUrl = await loadReferenceImage(file);
      if (generation.current !== token) return;
      let saveFailed = false;
      if (!saved) {
        try {
          const thumbnail = await createReferenceThumbnail(pendingUrl);
          if (generation.current !== token) return;
          const entry = await library.add(file, file.name, thumbnail);
          if (generation.current !== token) return;
          ++libraryGeneration.current;
          setLibraryLoading(false);
          setEntries(current => [entry, ...current]);
          setLibraryError('');
        } catch (error) {
          if (generation.current !== token) return;
          saveFailed = true;
          setLibraryError(`${error instanceof Error ? error.message : 'Could not save this reference on the device.'} The guide is ready for this session.`);
        }
      }
      if (generation.current !== token || !canvasSelected.current) return;
      const url = pendingUrl;
      // Transfer URL ownership to App, whose reference lifecycle revokes it on replacement/removal.
      pendingUrl = undefined;
      onChange({ url, name: file.name, visible: true, moving: true, opacity: .35, scale: 1, x: 0, y: 0, rotation: 0, aboveArt: true });
      setImageUrl('');
      if (!saveFailed) onClose();
    } catch (e) { if (generation.current === token) setError(e instanceof Error ? e.message : 'Could not open that image.'); }
    finally {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      if (generation.current === token) { setLoading(false); download.current = null; }
    }
  };
  return <GameSheet title="REFERENCE" subtitle="A ghost guide for your painting" className="reference-sheet" onClose={close}>
    <p className="empty-state">{onKeepReference ? 'Device references stay private. Only an explicit KEEP / SAVE TO SERVER action sends a copy to the server.' : 'Only you see this guide. It is never saved into your piece or sent to the server.'}</p>
    {!selected && <p className="ui-notice">Select a canvas first to place a reference on its wall.</p>}
    <details className="reference-source" open={guide ? undefined : true}><summary>{guide ? 'Replace reference image' : 'Choose reference image'}</summary>
    <form className="reference-link" onSubmit={event => { event.preventDefault(); void load(imageUrl); }}>
      <label><span>IMAGE URL</span><input type="url" aria-label="Reference image URL" placeholder="https://…/image.jpg" value={imageUrl} onChange={event => setImageUrl(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
      <button type="submit" className="ui-primary" disabled={!selected || !imageUrl.trim()}>{loading ? 'REPLACE LOADING IMAGE' : 'USE IMAGE URL'}</button>
    </form>
    <p className="empty-state">Paste the image address itself. Imported images are saved only on this device and work in Solo.</p>
    <label className="reference-file ui-button">{guide ? 'REPLACE FROM PHONE' : 'CHOOSE FROM PHONE'}<input aria-label="Choose reference image" type="file" accept="image/*" disabled={!selected} onChange={event => { void load(event.target.files?.[0]); event.target.value = ''; }} /></label>
    </details>
    {loading && <div className="button-row"><p className="empty-state" role="status">Opening reference…</p><button type="button" onClick={cancelLoad}>CANCEL LOAD</button></div>}
    {error && <p className="ui-notice" role="alert">{error}</p>}
    <section aria-label="Device reference library" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}><h3 style={{ fontSize: 11, margin: 0, letterSpacing: '.06em' }}>SAVED ON THIS DEVICE</h3><button type="button" disabled={libraryLoading} onClick={() => void refreshLibrary()} style={{ minHeight: 44, fontSize: 10 }}>RETRY / REFRESH</button></div>
      <p className="empty-state">Reuse a reference, or delete its saved copy. Deleting a copy keeps your current guide on the wall.</p>
      {libraryLoading && <p className="empty-state" role="status">Opening device library…</p>}
      {libraryError && <p className="ui-notice" role="alert">{libraryError}</p>}
      {!libraryLoading && !libraryError && !entries.length && <p className="empty-state">No saved references yet. Import an image above.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{entries.map(entry => <LibraryReference key={entry.id} entry={entry} selected={selected} deleting={deleting.includes(entry.id)} onSelect={() => void load(entry)} onDelete={() => void remove(entry.id)} />)}</ul>
    </section>
    {guide && <>
      <details className="reference-preview"><summary>Preview · {guide.name}</summary><img className="reference-thumbnail" src={guide.url} alt={`Reference: ${guide.name}`} /></details>
      <button type="button" className="reference-adjust-start ui-primary" disabled={!selected} onClick={() => { cancelLoad(); onChange({ ...guide, visible: true, moving: true }); onClose(); }}>ADJUST GUIDE</button>
      <p className="empty-state">Adjust on the wall with the screen clear: hold the image to move it, and use the sliders at the bottom.</p>
      <div className="button-row"><button type="button" aria-pressed={guide.visible} onClick={() => onChange({ ...guide, visible: !guide.visible })}>{guide.visible ? 'HIDE GUIDE' : 'SHOW GUIDE'}</button><button type="button" aria-label="Reference above artwork" aria-pressed={guide.aboveArt !== false} onClick={() => onChange({ ...guide, aboveArt: guide.aboveArt === false })}>{guide.aboveArt !== false ? 'ABOVE ART' : 'BELOW PAINT'}</button></div>
      <div className="button-row"><button type="button" onClick={() => onChange({ ...guide, x: 0, y: 0, scale: 1, rotation: 0 })}>FIT CANVAS</button><button type="button" onClick={() => { cancelLoad(); onChange(null); }}>REMOVE GUIDE</button></div>
    </>}
    {(onKeepReference || onDeleteOwnerReference) && <section aria-label="Owner server references" style={{ marginTop: 12 }}>
      {onKeepReference && <button type="button" className="reference-adjust-start ui-primary" disabled={!selected || !guide || !canKeepReference || ownerReferenceBusy || loading} onClick={onKeepReference}>{ownerReferenceBusy ? 'SAVING / UPDATING SERVER…' : 'KEEP / SAVE TO SERVER'}</button>}
      {ownerReferenceNotice && <p className="ui-notice" role="status">{ownerReferenceNotice}</p>}
      {onDeleteOwnerReference && <details className="reference-source"><summary>Saved server references · {ownerReferences.length}</summary>
        <p className="empty-state">Server references are separate from your private device library. Deleting a server reference cannot be undone.</p>
        {!ownerReferences.length && <p className="empty-state">No saved server references.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{ownerReferences.map(entry => <li key={entry.referenceId} style={{ padding: '8px 0', borderBottom: '1px solid var(--edge)' }}>
          <p style={{ margin: '4px 0 8px', fontSize: 12, overflowWrap: 'anywhere' }}>{entry.name}</p>
          {confirmServerDelete === entry.referenceId ? <>
            <p className="ui-notice">Delete “{entry.name}” from the server?</p>
            <div className="button-row"><button type="button" disabled={ownerReferenceBusy} onClick={() => { onDeleteOwnerReference(entry.referenceId); setConfirmServerDelete(null); }}>YES, DELETE SERVER REFERENCE</button><button type="button" onClick={() => setConfirmServerDelete(null)}>CANCEL</button></div>
          </> : <button type="button" disabled={ownerReferenceBusy} style={{ minHeight: 44, fontSize: 10 }} onClick={() => setConfirmServerDelete(entry.referenceId)}>DELETE SERVER REFERENCE</button>}
        </li>)}</ul>
      </details>}
    </section>}
  </GameSheet>;
}
