import { useEffect, useState } from 'react';
export interface PaintWorkspaceView { selected: boolean; active: boolean; width: number; height: number; hasPaint?: boolean; editableUntil?: number }
export type PaintWorkspaceAction = 'enter' | 'exit' | 'clear' | 'finish' | 'resize';
interface Props { view: PaintWorkspaceView; painting: boolean; onAction: (action: PaintWorkspaceAction, size?: number) => void }
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
  return <aside className="paint-workspace-controls" aria-label="Painting area">
    {!view.selected ? <span>Tap a nearby wall to select your painting area.</span> : <>
      <span>{view.width.toFixed(1)} × {view.height.toFixed(1)} m <small>UNPROTECTED</small></span>
      {!view.hasPaint && <label className="workspace-size"><span>BOX SIZE</span><input type="range" min="0.5" max="8" step="0.5"
        value={Math.max(.5, Math.min(8, Math.max(view.width, view.height)))} aria-label="Painting box size"
        onChange={event => onAction('resize', Number(event.target.value))} /></label>}
      <button type="button" onClick={() => onAction(view.active ? 'exit' : 'enter')}>{view.active ? 'BACK TO WALL' : 'ENTER CANVAS'}</button>
      <button type="button" onClick={() => onAction('finish')}>FINISH PIECE</button>
      <button type="button" onClick={() => onAction('clear')}>NEW AREA</button>
    </>}
  </aside>;
}
