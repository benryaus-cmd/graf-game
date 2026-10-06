import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
export interface PaintWorkspaceView { selected: boolean; active: boolean; width: number; height: number; zoom?: number; sizeLinked?: boolean; started?: boolean; hasPaint?: boolean; moving?: boolean; editableUntil?: number; bounds?: { min: [number, number, number]; max: [number, number, number] } }
export type PaintWorkspaceAction = 'start' | 'enter' | 'exit' | 'clear' | 'finish' | 'resize' | 'zoom' | 'fit' | 'link' | 'move';
interface Props { view: PaintWorkspaceView; painting: boolean; onAction: (action: PaintWorkspaceAction, size?: number, height?: number, title?: string, protectionEnabled?: boolean) => void; protectionControls?: ReactNode; geometryLocked?: boolean; protectedUntil?: number | null; compact?: boolean; pieceTitle?: string; onPieceTitleChange?: (title: string) => void; protectionEnabled?: boolean; startDisabled?: boolean; startLabel?: string }
export default function PaintWorkspaceHud({ view, painting, onAction, protectionControls, geometryLocked = false, protectedUntil, compact = false, pieceTitle = '', onPieceTitleChange, protectionEnabled = false, startDisabled = false, startLabel = 'START PAINTING' }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!view.editableUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [view.editableUntil]);
  if (view.editableUntil && view.editableUntil > now) return <aside className="paint-workspace-controls edit-grace" aria-label="Finished piece actions">
    <button type="button" onClick={() => onAction('enter')}>EDIT AGAIN · {Math.min(60, Math.ceil((view.editableUntil - now) / 1000))}s</button>
    <button type="button" className="ui-primary" onClick={() => onAction('exit')}>DONE</button>
  </aside>;
  if (!painting && !view.active) return null;
  return <>
    {view.active && !compact && <aside className="paint-workspace-zoom-controls" aria-label="Canvas zoom">
      <button type="button" aria-label="Zoom out" onClick={() => onAction('zoom', Math.max(.5, (view.zoom ?? 1) - .25))}>−</button>
      <span>{(view.zoom ?? 1).toFixed(2)}×</span>
      <button type="button" aria-label="Zoom in" onClick={() => onAction('zoom', Math.min(8, (view.zoom ?? 1) + .25))}>+</button>
      <button type="button" onClick={() => onAction('fit')}>FIT</button>
    </aside>}
    <aside className={`paint-workspace-controls${collapsed ? ' is-collapsed' : ''}`} aria-label="Painting area">
    {!compact && <button type="button" className="workspace-collapse-toggle" aria-expanded={!collapsed} aria-label={collapsed ? 'Expand canvas controls' : 'Collapse canvas controls'} onClick={() => setCollapsed(value => !value)}>{collapsed ? 'CANVAS ▾' : 'COLLAPSE ▴'}</button>}
    {(!collapsed || compact) && <>
    {!view.selected ? <span>Tap a nearby wall to select your painting area.</span> : <>
      <span>{view.width.toFixed(1)} × {view.height.toFixed(1)} m <small>{protectedUntil && protectedUntil > now ? 'PROTECTED' : 'UNPROTECTED'}</small></span>
      {!compact && !view.started && protectionControls}
      {!compact && !view.hasPaint && !geometryLocked && <div className="paint-workspace-size-controls" data-tutorial="canvas-size">
        <button type="button" data-tutorial="canvas-move" aria-pressed={!!view.moving} onClick={() => onAction('move', view.moving ? 0 : 1)}>
          {view.moving ? 'DONE MOVING' : 'MOVE AREA'}
        </button>
        {view.moving && <small>Drag on this wall to reposition the box.</small>}
        <button type="button" aria-pressed={view.sizeLinked !== false} onClick={() => onAction('link', view.sizeLinked === false ? 1 : 0)}>
          {view.sizeLinked === false ? 'UNLOCKED' : 'LOCKED'}
        </button>
        <label className="workspace-size"><span>BOX WIDTH</span><input type="range" min="0.5" max="8" step="0.5"
          value={Math.max(.5, Math.min(8, view.width))} aria-label="Painting box width"
          onChange={event => {
            const size = Number(event.target.value);
            onAction('resize', size, view.sizeLinked === false ? view.height : size);
          }} /></label>
        <label className="workspace-size"><span>BOX HEIGHT</span><input type="range" min="0.5" max="8" step="0.5"
          value={Math.max(.5, Math.min(8, view.height))} aria-label="Painting box height"
          onChange={event => {
            const size = Number(event.target.value);
            onAction('resize', view.sizeLinked === false ? view.width : size, size);
          }} /></label>
      </div>}
      {view.started || view.hasPaint || view.active ? <>
        {view.hasPaint && !compact && <label className="piece-title-input"><span>NAME PIECE · OPTIONAL</span><input value={pieceTitle} maxLength={60} placeholder="Add a title" aria-label="Optional piece name" onChange={event => onPieceTitleChange?.(event.target.value)} /></label>}
        <button type="button" onClick={() => onAction(view.active ? 'exit' : 'enter')}>{view.active ? 'BACK TO WALL' : 'ENTER CANVAS'}</button>
        <button type="button" data-tutorial={view.hasPaint ? 'piece-finish' : undefined} className={view.hasPaint ? 'ui-primary' : 'ui-secondary'} onClick={() => onAction(view.hasPaint ? 'finish' : 'clear', undefined, undefined, view.hasPaint ? pieceTitle : undefined)}>{view.hasPaint ? 'FINISH PIECE' : 'CANCEL'}</button>
      </> : <>
        <button type="button" data-tutorial="canvas-start" className="ui-primary" disabled={startDisabled} onClick={() => onAction('start', undefined, undefined, undefined, protectionEnabled)}>{startLabel}</button>
        <button type="button" onClick={() => onAction('clear')}>CANCEL</button>
      </>}
    </>}
    </>}
  </aside></>;
}
