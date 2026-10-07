import { useState } from 'react';
import type { ReferenceSettings } from '@/game/referenceGuide';

interface Props { guide: ReferenceSettings; onChange: (guide: ReferenceSettings) => void; onOpen: () => void }
export default function ReferenceControls({ guide, onChange, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false);
  const adjust = () => { setExpanded(false); onChange({ ...guide, visible: true, moving: true }); };
  const layer = <button type="button" aria-label="Reference above artwork" aria-pressed={guide.aboveArt !== false} onClick={() => onChange({ ...guide, aboveArt: guide.aboveArt === false })}>{guide.aboveArt !== false ? 'ABOVE ART' : 'BELOW PAINT'}</button>;
  return <>
    <aside className={`reference-quick-controls${expanded ? ' is-expanded' : ''}`} aria-label="Reference guide actions">
      <button type="button" className="reference-collapse-toggle" aria-label={expanded ? 'Collapse reference controls' : 'Expand reference controls'} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>REFERENCE {expanded ? '▴' : '▾'}</button>
      {expanded && <>
        <button type="button" onClick={() => onChange({ ...guide, visible: !guide.visible })}>{guide.visible ? 'HIDE GUIDE' : 'SHOW GUIDE'}</button>
        {!guide.moving && <button type="button" onClick={adjust}>ADJUST GUIDE</button>}
        {!guide.moving && layer}
        <button type="button" onClick={onOpen}>IMAGE OPTIONS</button>
      </>}
    </aside>
    {guide.moving && <aside className="reference-adjust-dock" aria-label="Adjust reference image">
      <header><span>Hold image to move</span>{layer}<button type="button" className="ui-primary" onClick={() => { setExpanded(false); onChange({ ...guide, moving: false }); }}>DONE ADJUSTING</button></header>
      <div className="reference-adjust-ranges">
        <label className="paint-range"><span><b>OPACITY</b><i>{Math.round(guide.opacity * 100)}%</i></span><input type="range" aria-label="Reference opacity" min={.1} max={.85} step={.05} value={guide.opacity} onChange={event => onChange({ ...guide, opacity: Number(event.target.value) })} /></label>
        <label className="paint-range"><span><b>SIZE</b><i>{Math.round(guide.scale * 100)}%</i></span><input type="range" aria-label="Reference size" min={.1} max={3} step={.05} value={guide.scale} onChange={event => onChange({ ...guide, scale: Number(event.target.value) })} /></label>
        <label className="paint-range"><span><b>ROTATION</b><i>{guide.rotation}°</i></span><input type="range" aria-label="Reference rotation" min={-180} max={180} value={guide.rotation} onChange={event => onChange({ ...guide, rotation: Number(event.target.value) })} /></label>
      </div>
    </aside>}
  </>;
}
