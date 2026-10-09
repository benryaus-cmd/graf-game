interface BrushTuningProps {
  advanced?: boolean;
  color: string;
  hue: number;
  darkness: number;
  paleness: number;
  brushSize: number;
  opacity: number;
  onHueChange: (value: number) => void;
  onSizeChange: (value: number) => void;
  onOpacityChange: (value: number) => void;
  onDarknessChange: (value: number) => void;
  onPalenessChange: (value: number) => void;
}

const BrushTuning = (props: BrushTuningProps) => (
  <div className="advanced-controls compact-brush-tuning">
    <label className="paint-range">
      <span><b>Size</b><i>{props.brushSize.toFixed(1)}</i></span>
      <input type="range" min="0.3" max="30" step="0.3" value={props.brushSize}
        aria-label="Brush size" onChange={event => props.onSizeChange(Number(event.target.value))} />
    </label>
    <label className="paint-range">
      <span><b>Opacity</b><i>{Math.round(props.opacity * 100)}%</i></span>
      <input type="range" min="5" max="100" value={Math.round(props.opacity * 100)}
        aria-label="Paint opacity" onChange={event => props.onOpacityChange(Number(event.target.value) / 100)} />
    </label>
    {props.advanced && <>
    <div className="paint-preview" aria-live="polite">
      <span className="paint-preview-chip" style={{ backgroundColor: props.color, opacity: props.opacity }} />
      <span className="paint-preview-copy">
        <b>Live colour</b>
        <strong>{props.color.toUpperCase()}</strong>
      </span>
    </div>
    <label className="paint-range hue-range">
      <span><b>Hue</b><i>{Math.round(props.hue)}°</i></span>
      <input
        type="range"
        min="0"
        max="360"
        value={props.hue}
        aria-label="Paint colour"
        onChange={(event) => props.onHueChange(Number(event.target.value))}
      />
    </label>
    <label className="paint-range">
      <span><b>Darkness</b><i>{props.darkness}%</i></span>
      <input
        type="range"
        min="0"
        max="100"
        value={props.darkness}
        aria-label="Paint darkness"
        onChange={(event) => props.onDarknessChange(Number(event.target.value))}
      />
    </label>
    <label className="paint-range">
      <span><b>Paleness</b><i>{props.paleness}%</i></span>
      <input
        type="range"
        min="0"
        max="100"
        value={props.paleness}
        aria-label="Paint paleness"
        onChange={(event) => props.onPalenessChange(Number(event.target.value))}
      />
    </label>
    </>}
  </div>
);

export default BrushTuning;
