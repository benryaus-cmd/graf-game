import { useEffect, useState } from 'react';
export interface PaintWorkspaceView { selected: boolean; active: boolean; width: number; height: number; zoom?: number; sizeLinked?: boolean; started?: boolean; hasPaint?: boolean; editableUntil?: number }
export type PaintWorkspaceAction = 'start' | 'enter' | 'exit' | 'clear' | 'finish' | 'resize' | 'zoom' | 'fit' | 'link';
interface Props { view: PaintWorkspaceView; painting: boolean; onAction: (action: PaintWorkspaceAction, size?: number, height?: number) => void }
export default function PaintWorkspaceHud({ view, painting, onAction }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!view.editableUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [view.editableUntil]);
  if (view.editableUntil && view.editableUntil > now) return <aside className="paint-workspace-controls">
    <button type="button" onClick={() => onAction('enter')}>EDIT AGAIN · {Math.min(60, Math.ceil((view.editableUntil - now) / 1000))}s</button>
    <button type="button" onClick={() => onAction('clear')}>DONE</button>
  </aside>;
  if (!painting && !view.active) return null;
  return <>
    {view.active && <aside className="paint-workspace-zoom-controls" aria-label="Canvas zoom">
      <button type="button" aria-label="Zoom out" onClick={() => onAction('zoom', Math.max(.5, (view.zoom ?? 1) - .25))}>−</button>
      <span>{(view.zoom ?? 1).toFixed(2)}×</span>
      <button type="button" aria-label="Zoom in" onClick={() => onAction('zoom', Math.min(8, (view.zoom ?? 1) + .25))}>+</button>
      <button type="button" onClick={() => onAction('fit')}>FIT</button>
    </aside>}
    <aside className="paint-workspace-controls" aria-label="Painting area">
    {!view.selected ? <span>Tap a nearby wall to select your painting area.</span> : <>
      <span>{view.width.toFixed(1)} × {view.height.toFixed(1)} m <small>UNPROTECTED</small></span>
      {!view.started && !view.hasPaint && <div className="paint-workspace-size-controls">
        <button type="button" aria-pressed={view.sizeLinked !== false} onClick={() => onAction('link', view.sizeLinked === false ? 1 : 0)}>
          {view.sizeLinked === false ? 'UNLOCKED' : 'LOCKED'}
        </button>
        <label className="workspace-size"><span>{view.sizeLinked === false ? 'BOX WIDTH' : 'BOX SIZE'}</span><input type="range" min="0.5" max="8" step="0.5"
          value={Math.max(.5, Math.min(8, view.width))} aria-label="Painting box width"
          onChange={event => onAction('resize', Number(event.target.value), view.sizeLinked === false ? view.height : undefined)} /></label>
        {view.sizeLinked === false && <label className="workspace-size"><span>BOX HEIGHT</span><input type="range" min="0.5" max="8" step="0.5"
          value={Math.max(.5, Math.min(8, view.height))} aria-label="Painting box height"
          onChange={event => onAction('resize', view.width, Number(event.target.value))} /></label>}
      </div>}
      {view.started || view.hasPaint || view.active ? <>
        <button type="button" onClick={() => onAction(view.active ? 'exit' : 'enter')}>{view.active ? 'BACK TO WALL' : 'ENTER CANVAS'}</button>
        <button type="button" onClick={() => onAction('finish')}>FINISH PIECE</button>
      </> : <>
        <button type="button" onClick={() => onAction('start')}>START PAINTING</button>
        <button type="button" onClick={() => onAction('clear')}>CANCEL</button>
      </>}
    </>}
  </aside></>;
}
