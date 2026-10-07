import { useState, useEffect, type ReactNode } from 'react';
import type { BrushHead } from '@/game/sprayHeads';
import BrushTuning from '@/components/BrushTuning';
import ColorPicker from '@/components/ColorPicker';
import GameSheet from '@/components/GameSheet';
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
  { id: 'marker', label: 'MARKER' }, { id: 'roller', label: 'ROLLER' },
];

interface PaintDockProps {
  workspaceControls?: ReactNode;
  brushHead?: BrushHead;
  onBrushHeadChange?: (head: BrushHead) => void;
  open: boolean; onToggle: () => void; onClose?: () => void;
  color: string; paintMode: boolean; eraseMode: boolean;
  brushSize: number; opacity: number; panelColor: string; accentColor: string;
  layers: PaintLayerControl[]; selectedLayer: number;
  posterSize: number; onPosterSizeChange: (size: number) => void;
  onStartPosterPlacement: (dataUrl: string, size: number) => void;
  onColorChange: (color: string) => void; onToolChange: (tool: PaintTool) => void;
  onColorPreview?: (color: string) => void;
  onBrushSizeChange: (size: number) => void; onOpacityChange: (opacity: number) => void;
  onLayerSelect: (index: number) => void; onLayerToggle: (index: number) => void;
  onLayerAdd: () => void;
  onEyedropper?: () => void; eyedropperActive?: boolean;
}

function paletteStorage(): PaletteStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

const PaintDock = (props: PaintDockProps) => {
  const [pickerOpen, setPickerOpen] = useState(false);
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
  const commitColor = (next: string) => {
    props.onColorChange(next);
    setRecentColors(previous => [next, ...previous.filter(color => color !== next)].slice(0, 6));
  };
  const setBase = (next: string) => { setBaseColor(next); setHue(hexToHsl(next).h); setDarkness(0); setPaleness(0); };
  const selectBaseColor = (next: string) => { setBase(next); commitColor(next); };
  const previewBaseColor = (next: string) => { setBase(next); (props.onColorPreview ?? props.onColorChange)(next); };
  const updateHue = (value: number) => { setHue(value); props.onColorChange(paintColor(baseColor, value, darkness, paleness)); };
  const updateDarkness = (value: number) => { setDarkness(value); props.onColorChange(paintColor(baseColor, hue, value, paleness)); };
  const updatePaleness = (value: number) => { setPaleness(value); props.onColorChange(paintColor(baseColor, hue, darkness, value)); };
  const activePalette = paletteSettings.palettes.find(palette => palette.id === paletteSettings.activePaletteId);
  const paletteColors = activePalette?.colors ?? paletteSettings.defaultColors;
  const refreshPalettes = () => {
    const storage = paletteStorage();
    if (storage) setPaletteSettings(loadPaletteSettings(storage));
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
    <GameSheet title="PAINT TOOLS" subtitle={`${props.eraseMode ? 'Eraser' : props.brushHead ?? 'soft'} · Layer ${props.selectedLayer + 1}`} onClose={props.onToggle} closeLabel="Close paint panel" className="paint-sheet" footer={props.workspaceControls}>
      <nav className="sheet-tabs" aria-label="Paint workspace tools">
        <button type="button" aria-pressed={!posterMode} onClick={() => setPosterMode(false)}>PAINT</button>
        <button type="button" aria-pressed={posterMode} onClick={() => setPosterMode(true)}>TAGS</button>
      </nav>
      {posterMode ? <PosterStudio size={props.posterSize} onSizeChange={props.onPosterSizeChange} onStartPlacement={props.onStartPosterPlacement} /> : <>
        <section className="tool-section"><h3>BRUSH</h3>
          <div className="paint-heads" aria-label="Brush heads" data-tutorial="brush-heads">
            {HEADS.map(head => { const selected = !props.eraseMode && (props.brushHead ?? 'soft') === head.id; return <button key={head.id} type="button" className={selected ? 'paint-head-selected' : undefined} aria-pressed={selected} onClick={() => { props.onBrushHeadChange?.(head.id); props.onToolChange('paint'); }}>{head.label}</button>; })}
            <button type="button" className={props.eraseMode ? 'paint-head-selected' : undefined} aria-pressed={props.eraseMode} style={{ background: '#ffffff', color: '#000000' }} onClick={() => { props.onToolChange('eraser'); (props.onClose ?? props.onToggle)(); }}>ERAZE</button>
          </div>
        </section>
        <section className="tool-section"><h3>BRUSH SETTINGS</h3>
          <BrushTuning advanced={tuningOpen} color={props.color} hue={hue} darkness={darkness} paleness={paleness} brushSize={props.brushSize} opacity={props.opacity} onHueChange={updateHue} onSizeChange={props.onBrushSizeChange} onOpacityChange={props.onOpacityChange} onDarknessChange={updateDarkness} onPalenessChange={updatePaleness} />
          <button type="button" className="disclosure-button" aria-expanded={tuningOpen} onClick={() => setTuningOpen(value => !value)}>{tuningOpen ? 'Less colour tuning' : 'Advanced colour tuning'} <span>{tuningOpen ? '−' : '+'}</span></button>
        </section>
        <section className="tool-section"><h3>COLOUR <span className="color-readout"><i style={{ backgroundColor: props.color }} />{props.color.toUpperCase()}</span></h3>
          <div className="swatches" aria-label="Color palette">
            {paletteColors.map(swatch => <button key={swatch} type="button" aria-label={`Select paint colour ${swatch}`} title={swatch} aria-pressed={props.color === swatch} className={`swatch ${props.color === swatch ? 'swatch-selected' : ''}`} style={{ backgroundColor: swatch }} onClick={() => selectBaseColor(swatch)} />)}
            <button type="button" className="wheel-picker" aria-label="Create custom paint colour" onClick={() => setPickerOpen(value => !value)}>＋</button>
          </div>
          <div className="colour-actions">
            <button type="button" aria-expanded={pickerOpen} onClick={() => setPickerOpen(value => !value)}>PICK COLOUR</button>
            {props.onEyedropper && <button type="button" className="ui-button" aria-pressed={!!props.eyedropperActive} onClick={() => { props.onEyedropper?.(); props.onToggle(); }}>EYEDROPPER</button>}
            <label className="hex-control"><span>HEX</span><input aria-label="Hex paint colour" value={colorDraft} maxLength={7} spellCheck={false} onBlur={() => setColorDraft(props.color)} onChange={event => { const next = event.target.value.toLowerCase(); setColorDraft(next); if (/^#[0-9a-f]{6}$/.test(next)) selectBaseColor(next); }} /></label>
          </div>
          {pickerOpen && <ColorPicker color={props.color} onChange={previewBaseColor} onCommit={commitColor} />}
          {recentColors.length > 0 && <div className="recent-colours" aria-label="Recent colours">{recentColors.map(recent => <button type="button" key={recent} aria-label={`Reuse ${recent}`} style={{ backgroundColor: recent }} onClick={() => selectBaseColor(recent)} />)}</div>}
        </section>
        <section className="tool-section"><h3>LAYERS <small>LAYER {props.selectedLayer + 1}</small></h3>
          <div className="layer-list" aria-label="Drawing layers">{props.layers.slice(0, 5).map((layer, index) => <div className={`layer-chip ${props.selectedLayer === index ? 'layer-chip-selected' : ''}`} key={layer.name}>
            <button className="layer-select" type="button" aria-label={`Select ${layer.name}`} aria-pressed={props.selectedLayer === index} onClick={() => props.onLayerSelect(index)}>{index + 1}</button>
            <button className="layer-visibility" type="button" aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} aria-pressed={layer.visible} onClick={() => props.onLayerToggle(index)}>{layer.visible ? '●' : '○'}</button>
          </div>)}</div>
        </section>
        <details className="palette-manager"><summary>Manage palettes</summary>
          <label className="ui-field">PALETTE<select aria-label="Load saved palette" value={paletteSettings.activePaletteId ?? ''} onChange={event => changePalette(event.target.value)}><option value="">DEFAULT PALETTE</option>{paletteSettings.palettes.map(palette => <option key={palette.id} value={palette.id}>{palette.name}</option>)}</select></label>
          <div className="button-row"><button type="button" onClick={addCurrentColorToPalette}>ADD COLOUR</button><button type="button" disabled={!paletteSettings.activePaletteId} onClick={removeActivePalette} aria-label="Delete selected palette">DELETE</button></div>
          <label className="ui-field">SAVE CURRENT PALETTE<input aria-label="New palette name" placeholder="Palette name" value={paletteName} maxLength={32} onChange={event => setPaletteName(event.target.value)} /></label>
          <button type="button" onClick={saveCurrentPalette}>SAVE PALETTE</button>
          {paletteMessage && <p className="ui-notice" role="status">{paletteMessage}</p>}
        </details>
      </>}
    </GameSheet>
  );
};

export default PaintDock;
