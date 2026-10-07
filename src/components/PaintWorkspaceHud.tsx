import { useEffect, useState } from 'react';
import { useRotatedSheetScroll } from '@/components/useRotatedSheetScroll';
import type { ReactNode } from 'react';
export interface PaintWorkspaceView { selected: boolean; active: boolean; width: number; height: number; zoom?: number; sizeLinked?: boolean; started?: boolean; hasPaint?: boolean; moving?: boolean; editableUntil?: number; bounds?: { min: [number, number, number]; max: [number, number, number] } }
export type PaintWorkspaceAction = 'start' | 'enter' | 'exit' | 'clear' | 'finish' | 'resize' | 'zoom' | 'fit' | 'link' | 'move' | 'undo' | 'redo';
export interface PaintWorkspaceHistory { canUndo: boolean; canRedo: boolean; undoDepth: number; redoDepth: number; limit: number }
interface Props { history?: PaintWorkspaceHistory; view: PaintWorkspaceView; painting: boolean; onAction: (action: PaintWorkspaceAction, size?: number, height?: number, title?: string, protectionEnabled?: boolean) => void; onReference?: () => void; protectionControls?: ReactNode; geometryLocked?: boolean; protectedUntil?: number | null; compact?: boolean; initialCollapsed?: boolean; collapsed?: boolean; onCollapsedChange?: (value: boolean) => void; pieceTitle?: string; onPieceTitleChange?: (title: string) => void; protectionEnabled?: boolean; startDisabled?: boolean; startLabel?: string }
export default function PaintWorkspaceHud({ history, view, painting, onAction, onReference, protectionControls, geometryLocked = false, protectedUntil, compact = false, initialCollapsed = true, collapsed: controlledCollapsed, onCollapsedChange, pieceTitle = '', onPieceTitleChange, protectionEnabled = false, startDisabled = false, startLabel = 'START PAINTING' }: Props) {
  const scroll = useRotatedSheetScroll();
  const [localCollapsed, setLocalCollapsed] = useState(initialCollapsed);
  const collapsed = controlledCollapsed ?? localCollapsed;
  const setCollapsed = (value: boolean) => { setLocalCollapsed(value); onCollapsedChange?.(value); };
  const minimized = collapsed || !!view.moving;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!view.editableUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [view.editableUntil]);
  if (view.editableUntil && view.editableUntil > now) return <aside className="paint-workspace-controls edit-grace" aria-label="Finished piece actions">
    <button type="button" onClick={() => onAction('enter')}>EDIT AGAIN · {Math.min(60, Math.ceil((view.editableUntil - now) / 1000))}s</button>
    <button type="button" data-tutorial="piece-done" className="ui-primary" onClick={() => onAction('exit')}>DONE</button>
  </aside>;
  if (!painting && !view.active) return null;
  return <>
    {view.active && !compact && <aside className="paint-workspace-zoom-controls" aria-label="Canvas zoom">
      <button type="button" aria-label="Zoom out" onClick={() => onAction('zoom', Math.max(.5, (view.zoom ?? 1) - .25))}>−</button>
      <span>{(view.zoom ?? 1).toFixed(2)}×</span>
      <button type="button" aria-label="Zoom in" onClick={() => onAction('zoom', Math.min(8, (view.zoom ?? 1) + .25))}>+</button>
      <button type="button" onClick={() => onAction('fit')}>FIT</button>
      <button type="button" aria-label="Undo last paint stroke" disabled={!history?.canUndo} onClick={() => { if (history?.canUndo) onAction('undo'); }}>UNDO</button>
      <button type="button" aria-label="Redo last paint stroke" disabled={!history?.canRedo} onClick={() => { if (history?.canRedo) onAction('redo'); }}>REDO</button>
    </aside>}
    <aside className={`paint-workspace-controls${minimized ? ' is-collapsed' : ''}`} aria-label="Painting area" {...scroll}>
    {view.moving && <button type="button" data-tutorial="canvas-move" className="workspace-move-done" onClick={() => { setCollapsed(true); onAction('move', 0); }}>DONE MOVING</button>}
    {!compact && !view.moving && <button type="button" data-tutorial="canvas-controls" className="workspace-collapse-toggle" aria-expanded={!minimized} aria-label={minimized ? 'Expand canvas controls' : 'Collapse canvas controls'} onClick={() => setCollapsed(!collapsed)}>{minimized ? 'CANVAS ▾' : 'COLLAPSE ▴'}</button>}
    {(!minimized || (compact && !view.moving)) && <>
    {!view.selected ? <span>Tap a nearby wall to select your painting area.</span> : <>
      <span>{view.width.toFixed(1)} × {view.height.toFixed(1)} m <small>{protectedUntil && protectedUntil > now ? 'PROTECTED' : 'UNPROTECTED'}</small></span>
      {onReference && <button type="button" onClick={onReference}>REFERENCE IMAGE</button>}
      {!compact && !view.started && protectionControls}
      {!compact && !view.hasPaint && !geometryLocked && <div className="paint-workspace-size-controls" data-tutorial="canvas-size">
        <button type="button" data-tutorial="canvas-move" aria-pressed={false} onClick={() => { setCollapsed(true); onAction('move', 1); }}>
          MOVE AREA
        </button>
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
