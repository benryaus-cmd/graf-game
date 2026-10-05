import { useEffect, useRef, useState } from 'react';
import { elementPointerPoint } from '@/game/pointerCoordinates';
import { sampleBrushPath, type BrushPathState, type BrushPoint } from '@/game/tagBrush';
import {
  addTagDesign, deleteTagDesign, loadTagLibrary, markTagLogo,
  type TagDesign, type TagLibrary,
} from '@/game/tagLibrary';

interface PosterStudioProps {
  size: number;
  onSizeChange: (size: number) => void;
  onStartPlacement: (dataUrl: string, size: number) => void;
}

const COLORS = ['#111111', '#f8f3e8', '#ff5c35', '#ffc928', '#71d6a2', '#47a8ff', '#c87aff'];
const BRUSHES = [4, 9, 17, 30];
const MAX_HISTORY = 24;
const STORAGE_WARNING = 'This browser could not save the change. Check available site storage and try again.';
type BrushHead = 'marker' | 'fine' | 'spray' | 'roller' | 'drip';
interface ActiveGesture {
  head: BrushHead;
  size: number;
  color: string;
  eraser: boolean;
  point: BrushPoint;
  path: BrushPathState;
  spacing: number;
}

function browserStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

const PosterStudio = ({ size, onSizeChange, onStartPlacement }: PosterStudioProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<number | null>(null);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const endStrokeRef = useRef<((element?: HTMLCanvasElement) => void) | null>(null);
  const loadGenerationRef = useRef(0);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [brush, setBrush] = useState(BRUSHES[1]);
  const [head, setHead] = useState<BrushHead>('marker');
  const [eraser, setEraser] = useState(false);
  const [library, setLibrary] = useState<TagLibrary>(() => {
    const storage = browserStorage();
    return storage ? loadTagLibrary(storage) : { designs: [], logoId: null };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [revision, setRevision] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const selected = library.designs.find((design) => design.id === selectedId) ?? null;

  const canvas = () => canvasRef.current;
  const context = () => canvas()?.getContext('2d', { willReadFrequently: true }) ?? null;
  const capture = () => {
    const ctx = context();
    const current = canvas();
    return ctx && current ? ctx.getImageData(0, 0, current.width, current.height) : null;
  };
  const remember = () => {
    const image = capture();
    if (!image) return;
    undoRef.current = [...undoRef.current.slice(-(MAX_HISTORY - 1)), image];
    redoRef.current = [];
  };
  const scanHasContent = () => {
    const image = capture();
    if (!image) return false;
    for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 0) return true;
    return false;
  };
  const currentArt = () => selected?.dataUrl ?? canvas()?.toDataURL('image/png') ?? '';
  const endStroke = (element?: HTMLCanvasElement) => {
    const pointerId = pointerRef.current;
    if (pointerId === null) return;
    pointerRef.current = null;
    gestureRef.current = null;
    if (element?.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    setHasContent(scanHasContent());
    setRevision((value) => value + 1);
  };
  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    endStroke(event.currentTarget);
  };
  endStrokeRef.current = endStroke;

  const stamp = (ctx: CanvasRenderingContext2D, active: ActiveGesture, x: number, y: number, angle: number, index: number, pressure: number) => {
    const pressureScale = 0.65 + 0.7 * (pressure > 0 ? pressure : 0.5);
    const width = active.size * pressureScale;
    ctx.save();
    ctx.globalCompositeOperation = active.eraser ? 'destination-out' : 'source-over';
    ctx.fillStyle = active.color;
    ctx.strokeStyle = active.color;
    switch (active.head) {
      case 'marker':
        ctx.globalAlpha = 0.88;
        ctx.beginPath(); ctx.arc(x, y, width * 0.55, 0, Math.PI * 2); ctx.fill();
        break;
      case 'fine':
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.7, width * 0.16), 0, Math.PI * 2); ctx.fill();
        break;
      case 'spray': {
        const radius = width * 1.15;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, active.color);
        gradient.addColorStop(0.36, `${active.color}bb`);
        gradient.addColorStop(1, `${active.color}00`);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'roller': {
        ctx.globalAlpha = 0.92;
        const length = width * 1.35;
        const thickness = width * 0.68;
        ctx.translate(x, y); ctx.rotate(angle);
        ctx.fillRect(-length / 2, -thickness / 2, length, thickness);
        break;
      }
      case 'drip': {
        ctx.globalAlpha = 0.96;
        const wobble = ((index * 37 + 11) % 9) / 8;
        const drop = width * (0.7 + wobble * 1.8);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, width * 0.23);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + drop); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y + drop, Math.max(0.8, width * 0.12), 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
    ctx.restore();
  };

  useEffect(() => {
    const handleBlur = () => endStrokeRef.current?.(canvasRef.current ?? undefined);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
      loadGenerationRef.current += 1;
    };
  }, []);

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (selected || pointerRef.current !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const ctx = context();
    if (!ctx) { setError('Drawing is unavailable in this browser.'); return; }
    remember();
    pointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const normalized = elementPointerPoint(event.currentTarget, event.nativeEvent);
    const p = { x: normalized.x * event.currentTarget.width, y: normalized.y * event.currentTarget.height };
    const scale = event.currentTarget.width / Math.max(1, event.currentTarget.clientWidth);
    const spacingFactor = head === 'fine' ? 0.38 : head === 'drip' ? 0.72 : 0.3;
    const active: ActiveGesture = {
      head, size: brush * scale, color, eraser, point: p,
      spacing: Math.max(1, brush * scale * spacingFactor),
      path: { distanceToNext: 0, stampIndex: 0 },
    };
    gestureRef.current = active;
    stamp(ctx, active, p.x, p.y, 0, 0, event.pressure);
    active.path.distanceToNext = active.spacing;
    setRevision((value) => value + 1);
    event.preventDefault();
  };
  const moveStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current !== event.pointerId) return;
    const ctx = context();
    const active = gestureRef.current;
    if (!ctx || !active) return;
    const nativeEvents = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    for (const nativeEvent of nativeEvents) {
      const normalized = elementPointerPoint(event.currentTarget, nativeEvent);
      const next = { x: normalized.x * event.currentTarget.width, y: normalized.y * event.currentTarget.height };
      const sampled = sampleBrushPath(active.point, next, active.spacing, active.path);
      for (const point of sampled.stamps) stamp(ctx, active, point.x, point.y, point.angle, point.index, nativeEvent.pressure);
      active.point = next;
      active.path = sampled.state;
    }
    event.preventDefault();
  };

  const restore = (image: ImageData | undefined) => {
    const ctx = context();
    const current = canvas();
    if (!image || !ctx || !current || image.width !== current.width || image.height !== current.height) return;
    ctx.clearRect(0, 0, current.width, current.height);
    ctx.putImageData(image, 0, 0);
    setHasContent(scanHasContent());
    setRevision((value) => value + 1);
  };
  const undo = () => {
    const current = capture();
    const previous = undoRef.current.pop();
    if (current && previous) { redoRef.current.push(current); restore(previous); }
  };
  const redo = () => {
    const current = capture();
    const next = redoRef.current.pop();
    if (current && next) { undoRef.current.push(current); restore(next); }
  };
  const clearCanvas = () => {
    const current = canvas();
    const ctx = context();
    if (!current || !ctx || !hasContent) return;
    loadGenerationRef.current += 1;
    remember();
    ctx.clearRect(0, 0, current.width, current.height);
    setHasContent(false);
    setSelectedId(null);
    setError('');
    setRevision((value) => value + 1);
  };
  const rotateWorkspace = () => {
    const current = canvas();
    const ctx = context();
    if (!current || !ctx) return;
    loadGenerationRef.current += 1;
    const next = orientation === 'portrait' ? 'landscape' : 'portrait';
    const snapshot = document.createElement('canvas');
    snapshot.width = current.width;
    snapshot.height = current.height;
    snapshot.getContext('2d')?.drawImage(current, 0, 0);
    current.width = next === 'portrait' ? 512 : 768;
    current.height = next === 'portrait' ? 768 : 512;
    const scale = Math.min(current.width / snapshot.width, current.height / snapshot.height);
    const scaledWidth = snapshot.width * scale;
    const scaledHeight = snapshot.height * scale;
    context()?.drawImage(snapshot, (current.width - scaledWidth) / 2, (current.height - scaledHeight) / 2, scaledWidth, scaledHeight);
    setHasContent(scanHasContent());
    setOrientation(next);
    setSelectedId(null);
    undoRef.current = [];
    redoRef.current = [];
    setRevision((value) => value + 1);
  };

  const saveDesign = () => {
    if (!scanHasContent()) { setHasContent(false); setError('Draw something before saving a tag.'); return; }
    const storage = browserStorage();
    const image = canvas()?.toDataURL('image/png') ?? '';
    if (!storage) { setError(STORAGE_WARNING); return; }
    const result = addTagDesign(storage, { name, dataUrl: image });
    if (!result.ok) {
      setError(result.reason === 'name' ? 'Give this design a name first.'
        : result.reason === 'image' ? 'This design is too large for the local library.'
          : result.reason === 'full' ? 'Your local library is full. Delete a design before saving another.' : STORAGE_WARNING);
      return;
    }
    setLibrary(loadTagLibrary(storage));
    setSelectedId(result.design!.id);
    setName('');
    setError('');
  };
  const selectDesign = (design: TagDesign) => {
    endStroke(canvas());
    const loadGeneration = ++loadGenerationRef.current;
    setSelectedId(design.id);
    setHasContent(false);
    setError('');
    const current = canvas();
    const ctx = context();
    if (!current || !ctx) return;
    const image = new Image();
    image.onload = () => {
      if (loadGeneration !== loadGenerationRef.current) return;
      ctx.clearRect(0, 0, current.width, current.height);
      ctx.drawImage(image, 0, 0, current.width, current.height);
      setHasContent(scanHasContent());
      undoRef.current = [];
      redoRef.current = [];
      setRevision((value) => value + 1);
    };
    image.onerror = () => {
      if (loadGeneration === loadGenerationRef.current) setError('This saved design could not be loaded.');
    };
    image.src = design.dataUrl;
  };
  const chooseNewCanvas = () => {
    loadGenerationRef.current += 1;
    setSelectedId(null);
    setError('');
    const current = canvas();
    const ctx = context();
    if (current && ctx) { ctx.clearRect(0, 0, current.width, current.height); setRevision((value) => value + 1); }
    setHasContent(false);
    undoRef.current = [];
    redoRef.current = [];
  };
  const toggleLogo = (design: TagDesign) => {
    const storage = browserStorage();
    if (!storage) { setError(STORAGE_WARNING); return; }
    if (!markTagLogo(storage, library.logoId === design.id ? null : design.id)) { setError(STORAGE_WARNING); return; }
    setLibrary(loadTagLibrary(storage));
  };
  const removeDesign = (design: TagDesign) => {
    const storage = browserStorage();
    if (!storage || !deleteTagDesign(storage, design.id)) { setError(STORAGE_WARNING); return; }
    setLibrary(loadTagLibrary(storage));
    if (selectedId === design.id) chooseNewCanvas();
  };

  const buttonStyle: React.CSSProperties = { minHeight: 36, border: '1px solid rgba(255,255,255,.25)', borderRadius: 3, background: 'rgba(255,255,255,.06)', color: '#f3f1e9', fontSize: 9, fontWeight: 850, letterSpacing: '.07em', padding: '6px 9px' };
  const activeButton: React.CSSProperties = { ...buttonStyle, borderColor: '#ff704b', background: 'rgba(255,92,53,.22)', color: '#ffd2c3' };
  return (
    <div className="poster-studio" style={{ gap: 10 }}>
      <div className="poster-studio-heading"><span>01 / MAKE IT YOURS</span><b>TAG STUDIO</b></div>
      <p>Draw a tag by hand, then keep it in your personal library on this browser.</p>
      <div aria-label="Drawing tools" style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#aeb2a9', fontSize: 8, fontWeight: 900, letterSpacing: '.12em', marginRight: 3 }}>INK</span>
          {COLORS.map((value) => <button key={value} type="button" aria-label={`Ink ${value}`} aria-pressed={color === value && !eraser} onClick={() => { setColor(value); setEraser(false); }} style={{ width: 27, height: 27, borderRadius: '50%', border: color === value && !eraser ? '2px solid #ff704b' : '1px solid rgba(255,255,255,.45)', background: value }} />)}
          <label title="Choose any ink color" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#aeb2a9', fontSize: 8, fontWeight: 850 }}>
            CUSTOM <input aria-label="Custom ink color" type="color" value={color} onChange={(event) => { setColor(event.target.value); setEraser(false); }} style={{ width: 28, height: 27, padding: 1, border: '1px solid rgba(255,255,255,.35)', background: 'transparent' }} />
          </label>
          <button type="button" onClick={() => setEraser((value) => !value)} aria-pressed={eraser} style={eraser ? activeButton : buttonStyle}>ERASER</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5 }} aria-label="Brush head">
          <span style={{ color: '#aeb2a9', fontSize: 8, fontWeight: 900, letterSpacing: '.12em', marginRight: 3 }}>HEAD</span>
          {(['marker', 'fine', 'spray', 'roller', 'drip'] as const).map((value) => <button key={value} type="button" aria-pressed={head === value} onClick={() => setHead(value)} style={head === value ? activeButton : buttonStyle}>{value.toUpperCase()}</button>)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#aeb2a9', fontSize: 8, fontWeight: 900, letterSpacing: '.12em', marginRight: 3 }}>SIZE</span>
          {BRUSHES.map((value) => <button key={value} type="button" aria-label={`Brush size ${value}`} aria-pressed={brush === value} onClick={() => setBrush(value)} style={brush === value ? activeButton : buttonStyle}>{value}px</button>)}
          <button type="button" disabled={!undoRef.current.length} onClick={undo} style={{ ...buttonStyle, opacity: undoRef.current.length ? 1 : .45 }}>UNDO</button>
          <button type="button" disabled={!redoRef.current.length} onClick={redo} style={{ ...buttonStyle, opacity: redoRef.current.length ? 1 : .45 }}>REDO</button>
          <button type="button" disabled={!hasContent} onClick={clearCanvas} style={{ ...buttonStyle, opacity: hasContent ? 1 : .45 }}>CLEAR</button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#aeb2a9', fontSize: 8, fontWeight: 900, letterSpacing: '.12em' }}>TRANSPARENT CANVAS · {orientation.toUpperCase()}</span>
        <button type="button" onClick={rotateWorkspace} style={buttonStyle}>ROTATE WORKSPACE</button>
      </div>
      <div style={{ padding: 5, border: '1px solid rgba(255,255,255,.2)', background: 'repeating-conic-gradient(#282a27 0% 25%, #20211f 0% 50%) 50% / 18px 18px', maxHeight: 360, overflow: 'hidden' }}>
        <canvas
          ref={canvasRef} width={512} height={768} aria-label="Hand drawn tag canvas"
          onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={finishPointer} onPointerCancel={finishPointer} onLostPointerCapture={(event) => { if (pointerRef.current === event.pointerId) endStroke(event.currentTarget); }}
          style={{ display: 'block', width: '100%', maxHeight: 350, aspectRatio: `${orientation === 'portrait' ? '2 / 3' : '3 / 2'}`, objectFit: 'contain', touchAction: 'none', cursor: selected ? 'default' : eraser ? 'cell' : 'crosshair', opacity: selected ? .82 : 1 }}
        />
      </div>
      {selected && <small style={{ color: '#a8e9bf', fontSize: 9 }}>Viewing saved design: {selected.name}. Choose “NEW DRAWING” to edit a fresh canvas.</small>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 6 }}>
        <input aria-label="Design name" placeholder="Name this design" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} style={{ minWidth: 0, padding: '8px', border: '1px solid rgba(255,255,255,.2)', borderRadius: 3, background: 'rgba(0,0,0,.24)', color: '#f3f1e9', fontSize: 11 }} />
        <button type="button" disabled={!hasContent || !name.trim()} onClick={saveDesign} style={{ ...buttonStyle, background: '#ff5c35', color: '#1b1c19', opacity: hasContent && name.trim() ? 1 : .48 }}>SAVE DESIGN</button>
      </div>
      {error && <div className="poster-error" role="alert"><span>{error}</span></div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <b style={{ color: '#aeb2a9', fontSize: 8, letterSpacing: '.12em' }}>MY DESIGNS · THIS BROWSER</b>
        <button type="button" onClick={chooseNewCanvas} style={buttonStyle}>NEW DRAWING</button>
      </div>
      {library.designs.length === 0 ? <small style={{ color: '#929890', fontSize: 10 }}>Your personal tag library is empty.</small> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {library.designs.map((design) => <div key={design.id} style={{ minWidth: 0, border: selectedId === design.id ? '1px solid #ff704b' : '1px solid rgba(255,255,255,.16)', borderRadius: 3, background: 'rgba(0,0,0,.2)', padding: 5 }}>
            <button type="button" onClick={() => selectDesign(design)} aria-pressed={selectedId === design.id} style={{ width: '100%', padding: 0, border: 0, background: 'transparent', color: '#f3f1e9', textAlign: 'left' }}>
              <img src={design.dataUrl} alt="" style={{ display: 'block', width: '100%', height: 62, objectFit: 'contain', background: 'repeating-conic-gradient(#282a27 0% 25%, #20211f 0% 50%) 50% / 12px 12px' }} />
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingTop: 5, fontSize: 9 }}>{design.name}{library.logoId === design.id ? ' ★ LOGO' : ''}</span>
            </button>
            <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
              <button type="button" aria-label={`${library.logoId === design.id ? 'Unmark' : 'Mark'} ${design.name} as logo`} onClick={() => toggleLogo(design)} style={{ ...buttonStyle, flex: 1, minHeight: 28, padding: 3 }}>{library.logoId === design.id ? 'UNMARK' : 'USE AS LOGO'}</button>
              <button type="button" aria-label={`Delete ${design.name}`} onClick={() => removeDesign(design)} style={{ ...buttonStyle, minHeight: 28, padding: '3px 6px' }}>×</button>
            </div>
          </div>)}
        </div>
      )}
      <label className="poster-size-control"><span>TAG SIZE <b>{size.toFixed(1)} m</b></span><input type="range" min="0.4" max="4" step="0.1" value={size} aria-label="Adjust tag size" onChange={(event) => onSizeChange(Number(event.target.value))} /></label>
      <button type="button" className="poster-hold" disabled={!selected && !hasContent} onClick={() => onStartPlacement(currentArt(), size)}>HOLD TAG &amp; EXPLORE <span aria-hidden="true">↗</span></button>
      <small className="poster-swipe-note">SWIPE RIGHT TO RETURN TO PAINTING</small>
      <span aria-hidden="true" style={{ display: 'none' }}>{revision}</span>
    </div>
  );
};

export default PosterStudio;
