import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import type { BrushHead } from '@/game/sprayHeads';
import assetsData from '@/config/assets';
import BrushTuning from '@/components/BrushTuning';
import PosterStudio from '@/components/PosterStudio';
import { hexToHsl, paintColor } from '@/game/paintColor';

type PaintLayerControl = { name: string; visible: boolean };
type PaintTool = 'paint' | 'eraser' | 'off';
const PALETTE = [
  '#ff4d43', '#ff733e', '#ffb638', '#ffe34a', '#b6e34e', '#46d38b', '#37c9c8', '#39a8f2',
  '#5368ef', '#8758df', '#cf55d6', '#f05b9d', '#ffffff', '#b8b3a8', '#54575a', '#000000',
];
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

  return (
    <section
      className={`paint-dock ${props.open ? 'paint-dock-expanded' : 'paint-dock-collapsed'}`}
      style={{ backgroundColor: props.panelColor }} aria-label="Paint controls"
      onPointerDown={pointerDown} onPointerUp={pointerUp}
      onPointerCancel={() => { swipeStart.current = null; }}
    >
      {!props.open ? (
        <button className="paint-panel-trigger" type="button" aria-expanded={false} onClick={props.onToggle}>
          <span className="paint-trigger-mark">✳</span>
          <span className="paint-trigger-copy">
            <b>PAINT STATION</b>
            <small>{selectedTool === 'off' ? 'COLORS · TOOLS · LAYERS' : `${selectedTool.toUpperCase()} ACTIVE`}</small>
          </span>
          <i className="paint-trigger-swatch" style={{ backgroundColor: props.color }} />
          <span className="paint-trigger-action">OPEN ↑</span>
        </button>
      ) : (
        <>
          <div className="dock-topline">
            <span>{posterMode ? 'TAG STUDIO · HANDMADE WALL ART' : props.eraseMode ? 'ERASER READY' : `LAYER ${props.selectedLayer + 1} · YOUR PALETTE`}</span>
            <div className="dock-tools">
              {!posterMode && <span className="color-readout"><i style={{ backgroundColor: props.color }} />{props.color.toUpperCase()}</span>}
              <button
                className="poster-page-toggle" type="button" onClick={() => setPosterMode((value) => !value)}
                aria-label={posterMode ? 'Return to painting tools' : 'Open tag studio'}
              >{posterMode ? '← PAINT' : 'TAGS →'}</button>
              {!posterMode && <button
                className="tune-toggle" type="button" aria-expanded={tuningOpen}
                onClick={() => setTuningOpen((value) => !value)}
              >{tuningOpen ? 'LESS' : 'MORE'}</button>}
              <button className="dock-close" type="button" aria-label="Close paint panel" onClick={props.onToggle}>×</button>
            </div>
          </div>
          {posterMode ? (
            <PosterStudio
              size={props.posterSize} onSizeChange={props.onPosterSizeChange}
              onStartPlacement={props.onStartPosterPlacement}
            />
          ) : (
            <>
              <div className="paint-heads" aria-label="Spray heads">
                {HEADS.map(head => <button key={head.id} type="button" aria-pressed={(props.brushHead ?? 'soft') === head.id}
                  onClick={() => props.onBrushHeadChange?.(head.id)}>{head.label}</button>)}
              </div>
              <div className="dock-controls">
                <div className="swatches" aria-label="Color palette">
                  {PALETTE.map((swatch) => (
                    <button
                      type="button" aria-label={`Select paint colour ${swatch}`} title={swatch}
                      aria-pressed={props.color === swatch}
                      className={`swatch ${props.color === swatch ? 'swatch-selected' : ''}`}
                      style={{ backgroundColor: swatch }} key={swatch}
                      onClick={() => selectBaseColor(swatch)}
                    />
                  ))}
                  <label className="wheel-picker" aria-label="Choose any paint color">
                    <input type="color" value={props.color} onChange={(event) => selectBaseColor(event.target.value)} />
                    <span>◉</span>
                  </label>
                </div>
                <span className="dock-rule" />
                <div className="dock-tool-buttons">
                  <button
                    className={`paint-toggle ${selectedTool === 'paint' ? 'paint-toggle-active' : ''}`}
                    type="button" aria-pressed={selectedTool === 'paint'}
                    onClick={() => { props.onToolChange('paint'); props.onToggle(); }}
                  >
                    <img src={assetsData.IMAGE_ERCF} alt="" /><span>SPRAY</span>
                  </button>
                  <button
                    className={`eraser-toggle ${selectedTool === 'eraser' ? 'eraser-toggle-active' : ''}`}
                    type="button" aria-pressed={selectedTool === 'eraser'}
                    onClick={() => { props.onToolChange('eraser'); props.onToggle(); }}
                  ><span aria-hidden="true">◩</span><span>ERASE</span></button>
                </div>
              </div>
              <div className="paint-color-details">
                <label>HEX <input aria-label="Hex paint colour" value={colorDraft} maxLength={7} spellCheck={false}
                  onBlur={() => setColorDraft(props.color)} onChange={event => {
                    const next = event.target.value.toLowerCase(); setColorDraft(next);
                    if (/^#[0-9a-f]{6}$/.test(next)) selectBaseColor(next);
                  }} /></label>
                <div aria-label="Recent colours">{recentColors.map(recent => <button type="button" key={recent}
                  aria-label={`Reuse ${recent}`} style={{ backgroundColor: recent }} onClick={() => selectBaseColor(recent)} />)}</div>
              </div>
              {tuningOpen && <div className="layer-toolbar" aria-label="Drawing layers">
                <div className="layer-list">
                  {props.layers.map((layer, index) => (
                    <div className={`layer-chip ${props.selectedLayer === index ? 'layer-chip-selected' : ''}`} key={layer.name}>
                      <button
                        className="layer-select" type="button" aria-pressed={props.selectedLayer === index}
                        onClick={() => props.onLayerSelect(index)}
                      >{layer.name}</button>
                      <button
                        className={`layer-visibility ${layer.visible ? '' : 'layer-hidden'}`}
                        type="button" aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                        aria-pressed={layer.visible} onClick={() => props.onLayerToggle(index)}
                      >{layer.visible ? '●' : '○'}</button>
                    </div>
                  ))}
                </div>
                <button
                  className="layer-add" type="button" aria-label="Add drawing layer"
                  disabled={props.layers.length >= 8} onClick={props.onLayerAdd}
                ><b>+</b><span>LAYER</span></button>
              </div>}
                <BrushTuning
                  advanced={tuningOpen}
                  color={props.color} hue={hue} darkness={darkness} paleness={paleness}
                  brushSize={props.brushSize} opacity={props.opacity}
                  onHueChange={updateHue} onSizeChange={props.onBrushSizeChange}
                  onOpacityChange={props.onOpacityChange} onDarknessChange={updateDarkness}
                  onPalenessChange={updatePaleness}
                />
            </>
          )}
          <span className="dock-accent" style={{ backgroundColor: props.accentColor }} />
        </>
      )}
    </section>
  );
};

export default PaintDock;
