export interface PaintWorkspaceView { selected: boolean; active: boolean; width: number; height: number }
export type PaintWorkspaceAction = 'enter' | 'exit' | 'clear' | 'finish';
interface Props { view: PaintWorkspaceView; painting: boolean; onAction: (action: PaintWorkspaceAction) => void }
export default function PaintWorkspaceHud({ view, painting, onAction }: Props) {
  if (!painting && !view.active) return null;
  return <aside className="paint-workspace-controls" aria-label="Painting area">
    {!view.selected ? <span>Tap a nearby wall to select your painting area.</span> : <>
      <span>{view.width.toFixed(1)} × {view.height.toFixed(1)} m <small>UNPROTECTED</small></span>
      <button type="button" onClick={() => onAction(view.active ? 'exit' : 'enter')}>{view.active ? 'BACK TO WALL' : 'ENTER CANVAS'}</button>
      <button type="button" onClick={() => onAction('finish')}>FINISH PIECE</button>
      <button type="button" onClick={() => onAction('clear')}>NEW AREA</button>
    </>}
  </aside>;
}
