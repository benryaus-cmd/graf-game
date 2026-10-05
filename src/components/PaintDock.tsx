import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import type { BrushHead } from '@/game/sprayHeads';
import assetsData from '@/config/assets';
import BrushTuning from '@/components/BrushTuning';
import PosterStudio from '@/components/PosterStudio';
import { hexToHsl, paintColor } from '@/game/paintColor';
import {
  addPaletteColor, DEFAULT_PAINT_PALETTE, deletePalette, loadPaletteSettings, savePalette, setActivePalette,
  type PaintPaletteSettings, type PaletteStorage,
} from '@/game/paintPalettes';

type PaintLayerControl = { name: string; visible: boolean };
type PaintTool = 'paint' | 'eraser' | 'off';
const HEADS: Array<{ id: BrushHead; label: string }> = [
  { id: 'fine', label: 'FINE' }, { id: 'soft', label: 'SOFT' }, { id: 'fat', label: 'FAT' },
  { id: 'marker', label: 'MARKER' }, { id: 'roller', label: 'ROLLER' }, { id: 'drip', label: 'DRIP' },
];

interface PaintDockProps {
  brushHead?: BrushHead;
  onBrushHeadChange?: (head: BrushHead) => void;
  open: boolean; onToggle: () => void;
  color: string; paintMode: boolean; eraseMode: boolean;
  brushSize: number; opacity: number; panelColor: string; accentColor: string;
  layers: PaintLayerControl[]; selectedLayer: number;
  posterSize: number; onPosterSizeChange: (size: number) => void;
  onStartPosterPlacement: (dataUrl: string, size: number) => void;
  onColorChange: (color: string) => void; onToolChange: (tool: PaintTool) => void;
  onBrushSizeChange: (size: number) => void; onOpacityChange: (opacity: number) => void;
  onLayerSelect: (index: number) => void; onLayerToggle: (index: number) => void;
  onLayerAdd: () => void;
  onEyedropper?: () => void; eyedropperActive?: boolean;
}

function paletteStorage(): PaletteStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

const PaintDock = (props: PaintDockProps) => {
  const [tuningOpen, setTuningOpen] = useState(false);
  const [posterMode, setPosterMode] = useState(false);
  const [baseColor, setBaseColor] = useState(props.color);
  const [hue, setHue] = useState(() => hexToHsl(props.color).h);
  const [darkness, setDarkness] = useState(0);
  const [paleness, setPaleness] = useState(0);
  const [colorDraft, setColorDraft] = useState(props.color);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [paletteSettings, setPaletteSettings] = useState<PaintPaletteSettings>(() => {
    const storage = paletteStorage();
    return storage ? loadPaletteSettings(storage) : { defaultColors: [...DEFAULT_PAINT_PALETTE], palettes: [], activePaletteId: null };
  });
  const [paletteName, setPaletteName] = useState('');
  const [paletteMessage, setPaletteMessage] = useState('');
  useEffect(() => setColorDraft(props.color), [props.color]);
  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const selectBaseColor = (next: string) => {
    setBaseColor(next); setHue(hexToHsl(next).h); setDarkness(0); setPaleness(0); props.onColorChange(next);
    setRecentColors(previous => [next, ...previous.filter(color => color !== next)].slice(0, 6));
  };
  const updateHue = (value: number) => { setHue(value); props.onColorChange(paintColor(baseColor, value, darkness, paleness)); };
  const updateDarkness = (value: number) => { setDarkness(value); props.onColorChange(paintColor(baseColor, hue, value, paleness)); };
  const updatePaleness = (value: number) => { setPaleness(value); props.onColorChange(paintColor(baseColor, hue, darkness, value)); };
  const selectedTool = props.paintMode ? (props.eraseMode ? 'eraser' : 'paint') : 'off';
  const activePalette = paletteSettings.palettes.find(palette => palette.id === paletteSettings.activePaletteId);
  const paletteColors = activePalette?.colors ?? paletteSettings.defaultColors;
  const refreshPalettes = () => {
    const storage = paletteStorage();
    if (storage) setPaletteSettings(loadPaletteSettings(storage));
  };
  const pointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select')) return;
    swipeStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || start.id !== event.pointerId) return;
    const horizontal = event.clientX - start.x;
    if (Math.abs(horizontal) < 70 || Math.abs(event.clientY - start.y) > 55) return;
    setPosterMode(horizontal < 0);
  };
  const addCurrentColorToPalette = () => {
    if (paletteColors.includes(props.color.toLowerCase())) { setPaletteMessage('That colour is already in this palette.'); return; }
    if (paletteColors.length >= 24) { setPaletteMessage('This palette has reached its 24 colour limit.'); return; }
    const storage = paletteStorage();
    if (!storage || !addPaletteColor(storage, paletteSettings.activePaletteId, props.color)) {
      setPaletteMessage('Could not save this palette change in browser storage.'); return;
    }
    refreshPalettes();
    setPaletteMessage('Colour added to this palette.');
  };
  const saveCurrentPalette = () => {
    const storage = paletteStorage();
    if (!storage) { setPaletteMessage('Browser storage is unavailable.'); return; }
    const result = savePalette(storage, paletteName, paletteColors);
    if (!result.ok) {
      setPaletteMessage(result.reason === 'name' ? 'Enter a palette name.'
        : result.reason === 'duplicate' ? 'A palette with that name already exists.'
          : result.reason === 'colors' ? 'This palette has no valid colours.'
            : result.reason === 'full' ? 'The saved palette list is full. Delete one before saving another.'
              : 'Could not save this palette in browser storage.');
      return;
    }
    refreshPalettes();
    setPaletteName('');
    setPaletteMessage(`Saved “${result.palette!.name}”.`);
  };
  const changePalette = (id: string) => {
    const storage = paletteStorage();
    const paletteId = id || null;
    if (!storage || !setActivePalette(storage, paletteId)) { setPaletteMessage('Could not load that palette from browser storage.'); return; }
    refreshPalettes();
    setPaletteMessage('Palette loaded.');
  };
  const removeActivePalette = () => {
    if (!paletteSettings.activePaletteId) return;
    const storage = paletteStorage();
    if (!storage || !deletePalette(storage, paletteSettings.activePaletteId)) { setPaletteMessage('Could not delete this palette from browser storage.'); return; }
    refreshPalettes();
    setPaletteMessage('Palette deleted.');
  };

  if (!props.open) return null;

  return (
    <section
      className="paint-dock paint-dock-expanded"
      aria-label="Paint controls"
      onPointerDown={pointerDown} onPointerUp={pointerUp}
      onPointerCancel={() => { swipeStart.current = null; }}
    >
      <div className="dock-topline">
        <span>{posterMode ? 'TAG STUDIO · HANDMADE WALL ART' : props.eraseMode ? 'ERASER READY' : `LAYER ${props.selectedLayer + 1} · YOUR PALETTE`}</span>
        <div className="dock-tools">
          {!posterMode && <span className="color-readout"><i style={{ backgroundColor: props.color }} />{props.color.toUpperCase()}</span>}
          <button className="poster-page-toggle" type="button" onClick={() => setPosterMode((value) => !value)} aria-label={posterMode ? 'Return to painting tools' : 'Open tag studio'}>{posterMode ? '← PAINT' : 'TAGS →'}</button>
          {!posterMode && <button className="tune-toggle" type="button" aria-expanded={tuningOpen} onClick={() => setTuningOpen((value) => !value)}>{tuningOpen ? 'LESS' : 'MORE'}</button>}
          {!posterMode && props.onEyedropper && <button className="tune-toggle" type="button" aria-pressed={!!props.eyedropperActive} onClick={() => { props.onEyedropper?.(); props.onToggle(); }}>{props.eyedropperActive ? 'PICK ACTIVE' : 'PICK COLOUR'}</button>}
          <button className="dock-close" type="button" aria-label="Close paint panel" onClick={props.onToggle}>×</button>
        </div>
      </div>
      {posterMode ? <PosterStudio size={props.posterSize} onSizeChange={props.onPosterSizeChange} onStartPlacement={props.onStartPosterPlacement} /> : <>
        <div className="paint-heads" aria-label="Spray heads">
          {HEADS.map(head => <button key={head.id} type="button" aria-pressed={(props.brushHead ?? 'soft') === head.id} onClick={() => props.onBrushHeadChange?.(head.id)}>{head.label}</button>)}
        </div>
        <div className="dock-controls" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 7 }}>
          <div className="swatches" aria-label="Color palette" style={{ display: 'grid', gridTemplateColumns: 'repeat(9, minmax(0, 1fr))', gap: 5, width: '100%', minWidth: 0, flex: 'none', overflow: 'visible', justifyContent: 'stretch' }}>
            {paletteColors.map((swatch) => <button key={swatch} type="button" aria-label={`Select paint colour ${swatch}`} title={swatch} aria-pressed={props.color === swatch} className={`swatch ${props.color === swatch ? 'swatch-selected' : ''}`} style={{ backgroundColor: swatch, width: '100%', height: 33, minWidth: 0, flex: 'none' }} onClick={() => selectBaseColor(swatch)} />)}
            <label className="wheel-picker" aria-label="Choose any paint color" style={{ width: '100%', height: 33, minWidth: 0, flex: 'none' }}>
              <input type="color" value={props.color} onChange={(event) => selectBaseColor(event.target.value)} /><span>◉</span>
            </label>
          </div>
          <div className="dock-tool-buttons">
            <button className={`paint-toggle ${selectedTool === 'paint' ? 'paint-toggle-active' : ''}`} type="button" aria-pressed={selectedTool === 'paint'} onClick={() => { props.onToolChange('paint'); props.onToggle(); }}><img src={assetsData.IMAGE_ERCF} alt="" /><span>SPRAY</span></button>
            <button className={`eraser-toggle ${selectedTool === 'eraser' ? 'eraser-toggle-active' : ''}`} type="button" aria-pressed={selectedTool === 'eraser'} onClick={() => { props.onToolChange('eraser'); props.onToggle(); }}><span aria-hidden="true">◩</span><span>ERASE</span></button>
          </div>
        </div>
        <div className="paint-color-details">
          <label>HEX <input aria-label="Hex paint colour" value={colorDraft} maxLength={7} spellCheck={false} onBlur={() => setColorDraft(props.color)} onChange={event => { const next = event.target.value.toLowerCase(); setColorDraft(next); if (/^#[0-9a-f]{6}$/.test(next)) selectBaseColor(next); }} /></label>
          <div aria-label="Recent colours">{recentColors.map(recent => <button type="button" key={recent} aria-label={`Reuse ${recent}`} style={{ backgroundColor: recent }} onClick={() => selectBaseColor(recent)} />)}</div>
        </div>
        <div aria-label="Saved palettes" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 5, marginTop: 7 }}>
          <select aria-label="Load saved palette" value={paletteSettings.activePaletteId ?? ''} onChange={(event) => changePalette(event.target.value)} style={{ minWidth: 0, minHeight: 34, padding: '4px 7px', border: '1px solid rgba(255,255,255,.22)', borderRadius: 3, background: 'rgba(0,0,0,.25)', color: '#f3f1e9', fontSize: 9 }}>
            <option value="">DEFAULT PALETTE</option>{paletteSettings.palettes.map(palette => <option key={palette.id} value={palette.id}>{palette.name}</option>)}
          </select>
          <button type="button" className="tune-toggle" onClick={addCurrentColorToPalette}>ADD COLOUR</button>
          <button type="button" className="tune-toggle" disabled={!paletteSettings.activePaletteId} onClick={removeActivePalette} aria-label="Delete selected palette" style={{ opacity: paletteSettings.activePaletteId ? 1 : .45 }}>DELETE</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 5, marginTop: 5 }}>
          <input aria-label="New palette name" placeholder="Name current palette" value={paletteName} maxLength={32} onChange={event => setPaletteName(event.target.value)} style={{ minWidth: 0, minHeight: 34, padding: '5px 7px', border: '1px solid rgba(255,255,255,.22)', borderRadius: 3, background: 'rgba(0,0,0,.25)', color: '#f3f1e9', fontSize: 9 }} />
          <button type="button" className="tune-toggle" onClick={saveCurrentPalette}>SAVE PALETTE</button>
        </div>
        {paletteMessage && <small role="status" style={{ color: '#c9d6c7', fontSize: 8 }}>{paletteMessage}</small>}
        <BrushTuning advanced={tuningOpen} color={props.color} hue={hue} darkness={darkness} paleness={paleness} brushSize={props.brushSize} opacity={props.opacity} onHueChange={updateHue} onSizeChange={props.onBrushSizeChange} onOpacityChange={props.onOpacityChange} onDarknessChange={updateDarkness} onPalenessChange={updatePaleness} />
        <div className="layer-toolbar" aria-label="Drawing layers">
          <div className="layer-list">
            {props.layers.slice(0, 5).map((layer, index) => <div className={`layer-chip ${props.selectedLayer === index ? 'layer-chip-selected' : ''}`} key={layer.name}>
              <button className="layer-select" type="button" aria-pressed={props.selectedLayer === index} onClick={() => props.onLayerSelect(index)}>{layer.name}</button>
              <button className={`layer-visibility ${layer.visible ? '' : 'layer-hidden'}`} type="button" aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} aria-pressed={layer.visible} onClick={() => props.onLayerToggle(index)}>{layer.visible ? '●' : '○'}</button>
            </div>)}
          </div>
        </div>
      </>}
      <span className="dock-accent" style={{ backgroundColor: props.accentColor }} />
    </section>
  );
};

export default PaintDock;
