import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { TUTORIAL_ORDER, tutorialProgress, type TutorialStep } from '@/game/tutorial';
import { sheetViewport } from '@/components/sheetViewport';
import type { HudMenu } from '@/components/GameHud';
import type { MultiplayerStatus } from '@/multiplayer/protocol';

interface TutorialOverlayProps {
  step: TutorialStep;
  menu?: HudMenu;
  reviewing?: boolean;
  multiplayerPhase?: MultiplayerStatus['phase'];
  notice?: string;
  onStart: () => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onRestart: () => void;
  onClose: () => void;
  onExit: () => void;
}

interface StepCopy {
  title: string;
  body: string;
  target?: string;
  button?: string;
}

const COPY: Record<TutorialStep, StepCopy> = {
  welcome: {
    title: 'WELCOME TO GRAFFCITI',
    body: 'Explore the city, claim a canvas and paint your own piece. This tutorial uses the real controls.',
    button: 'START TUTORIAL',
  },
  move: {
    title: 'MOVE AROUND',
    body: 'Use MOVE to walk around. A small movement is enough.',
    target: 'movement',
  },
  look: {
    title: 'LOOK AROUND',
    body: 'Use LOOK to turn the camera.',
    target: 'look',
  },
  'select-canvas': {
    title: 'PICK A WALL',
    body: 'Paint mode is ready. Tap a nearby wall to choose where your piece will go.',
  },
  'size-canvas': {
    title: 'SIZE YOUR CANVAS',
    body: 'Open CANVAS, then adjust the box width or height. This sets the size of your piece.',
    target: 'canvas-size',
  },
  'move-canvas': {
    title: 'MOVE YOUR CANVAS',
    body: 'Open CANVAS and tap MOVE AREA. The controls collapse so you can drag the box on the wall. Tap DONE MOVING when it looks right.',
    target: 'canvas-move',
  },
  'start-painting': {
    title: 'START YOUR PIECE',
    body: 'Open CANVAS and tap START PAINTING when the size and position look right. Solo canvases are free; multiplayer uses your confirmed purchase.',
    target: 'canvas-start',
  },
  tools: {
    title: 'CHOOSE YOUR TOOLS',
    body: 'Pick a brush and colour. The tick shows your selected brush. Then close the tools to paint on the wall.',
    target: 'brush-heads',
    button: 'CLOSE TOOLS & PAINT',
  },
  paint: {
    title: 'MAKE YOUR MARK',
    body: 'Drag directly inside your canvas to paint. A small stroke is enough. Tools must be closed so you can reach the wall.',
    button: 'OPEN TOOLS',
  },
  finish: {
    title: 'FINISH YOUR PIECE',
    body: 'Open CANVAS, name it if you want, then finish the piece to save it.',
    target: 'piece-finish',
  },
  save: {
    title: 'SAVE YOUR PIECE',
    body: 'Tap DONE to finalize your piece. EDIT AGAIN lets you resume for 60 seconds; letting the timer expire also finalizes it.',
    target: 'piece-done',
  },
  radio: {
    title: 'CITY RADIO',
    body: 'Use the real radio while you explore. Change the station, open volume, or adjust it once.',
    target: 'radio',
  },
  multiplayer: {
    title: 'JOIN THE CITY',
    body: 'Tap JOIN MULTIPLAYER to enter the shared world.',
    target: 'multiplayer-join',
  },
  'multiplayer-info': {
    title: 'MULTIPLAYER CANVASES',
    body: 'Shared canvases need a server-confirmed purchase before painting. You can compare protected and unprotected quotes. The tutorial never spends credits for you.',
    button: 'GOT IT',
  },
  complete: {
    title: "YOU'RE READY",
    body: 'Explore. Claim a wall. Make something worth finding.',
    button: 'KEEP PLAYING',
  },
};

export default function TutorialOverlay({ step, menu, reviewing = false, multiplayerPhase, notice, onStart, onBack, onSkip, onContinue, onRestart, onClose, onExit }: TutorialOverlayProps) {
  const copy = step === 'paint' && menu === 'paint' ? {
    ...COPY.paint, body: 'Choose your brush and colour, then CLOSE TOOLS. Paint by dragging on the wall, outside this panel.', button: 'CLOSE TOOLS & PAINT',
  } : COPY[step];
  const layer = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const [spotlight, setSpotlight] = useState<CSSProperties>();
  const [helpOpen, setHelpOpen] = useState(false);
  const progress = tutorialProgress(step);

  useLayoutEffect(() => { setHelpOpen(false); }, [step]);

  useLayoutEffect(() => {
    const shell = layer.current?.closest<HTMLElement>('.game-shell');
    if (!shell || !card.current || !layer.current) return;
    const viewport = window.visualViewport;
    let watchedTarget: HTMLElement | null = null;
    const update = () => {
      const rect = shell.getBoundingClientRect();
      const rotated = shell.classList.contains('game-portrait');
      const visible = sheetViewport(rect, shell.clientWidth, shell.clientHeight, viewport ?? { offsetLeft: 0, offsetTop: 0, width: window.innerWidth, height: window.innerHeight }, rotated);
      Object.assign(layer.current!.style, { left: `${visible.left}px`, top: `${visible.top}px`, width: `${visible.width}px`, height: `${visible.height}px` });
      shell.style.setProperty('--tutorial-space', `${visible.top + card.current!.offsetHeight + 16}px`);
      let target = copy.target ? shell.querySelector<HTMLElement>(`[data-tutorial="${copy.target}"]`) : null;
      if ((!target || !target.getClientRects().length) && ['canvas-size', 'canvas-move', 'canvas-start', 'piece-finish'].includes(copy.target ?? '')) target = shell.querySelector<HTMLElement>('[data-tutorial="canvas-controls"]');
      if (watchedTarget !== target) {
        if (watchedTarget) observer.unobserve(watchedTarget);
        watchedTarget = target;
        if (target) observer.observe(target);
      }
      let next: CSSProperties | undefined;
      if (target && target.getClientRects().length) {
        const targetRect = target.getBoundingClientRect();
        const local = sheetViewport(rect, shell.clientWidth, shell.clientHeight, { offsetLeft: targetRect.left, offsetTop: targetRect.top, width: targetRect.width, height: targetRect.height }, rotated);
        next = { left: local.left - visible.left - 3, top: local.top - visible.top - 3, width: local.width + 6, height: local.height + 6 };
      }
      setSpotlight(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const observer = new ResizeObserver(update);
    observer.observe(shell); observer.observe(card.current);
    const mutations = new MutationObserver(update);
    mutations.observe(shell, { childList: true, subtree: true });
    update();
    const frame = requestAnimationFrame(() => {
      let target = copy.target ? shell.querySelector<HTMLElement>(`[data-tutorial="${copy.target}"]`) : null;
      if ((!target || !target.getClientRects().length) && ['canvas-size', 'canvas-move', 'canvas-start', 'piece-finish'].includes(copy.target ?? '')) target = shell.querySelector<HTMLElement>('[data-tutorial="canvas-controls"]');
      const body = target?.closest<HTMLElement>('.game-sheet-body');
      if (target && body) {
        const rect = shell.getBoundingClientRect();
        const rotated = shell.classList.contains('game-portrait');
        const localTop = (element: HTMLElement) => {
          const box = element.getBoundingClientRect();
          return sheetViewport(rect, shell.clientWidth, shell.clientHeight, { offsetLeft: box.left, offsetTop: box.top, width: box.width, height: box.height }, rotated).top;
        };
        body.scrollTop += localTop(target) - localTop(body) - 8;
      }
      update();
    });
    shell.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(frame);
      shell.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update);
      observer.disconnect(); mutations.disconnect();
      shell.style.removeProperty('--tutorial-space');
    };
  }, [copy.target, step, menu]);
  const index = TUTORIAL_ORDER.indexOf(step);
  const canBack = index > 0 && step !== 'complete';

  return (
    <div ref={layer} className="tutorial-layer" role="region" aria-label="Tutorial">
      {spotlight && <div className="tutorial-spotlight" style={spotlight} aria-hidden="true" />}
      <section ref={card} className={`tutorial-card${helpOpen ? ' tutorial-help-open' : ''}`} aria-label={copy.title}>
        <header className="tutorial-heading"><div>{step !== 'welcome' && step !== 'complete' && <small className="tutorial-progress">{reviewing ? 'REVIEW · ' : ''}{progress.current} / {progress.total}</small>}<h2>{copy.title}</h2></div><button type="button" className="tutorial-help-toggle" aria-label={helpOpen ? 'Hide tutorial instructions' : 'Show tutorial instructions'} aria-expanded={helpOpen} onClick={() => setHelpOpen(value => !value)}>HELP</button><button type="button" className="tutorial-exit" aria-label="Exit tutorial" onClick={onExit}>×</button></header>
        <p>{copy.body}</p>
        {step === 'multiplayer' && <p className="tutorial-connection" role="status">{multiplayerPhase === 'connecting' ? 'Connecting… You can skip this step while waiting.' : notice || (multiplayerPhase === 'disconnected' ? 'Connection lost. Tap RECONNECT or skip this step.' : '')}</p>}
        <div className="tutorial-actions">
          {canBack && <button type="button" className="ui-secondary" onClick={onBack}>BACK</button>}
          {reviewing && <button type="button" className="ui-primary" onClick={onContinue}>RESUME GUIDE</button>}
          {!reviewing && step === 'welcome' && <button type="button" className="ui-primary" onClick={onStart}>START TUTORIAL</button>}
          {!reviewing && (step === 'tools' || step === 'paint') && <button type="button" className="ui-primary" onClick={onContinue}>{copy.button}</button>}
          {!reviewing && step === 'multiplayer-info' && <button type="button" className="ui-primary" onClick={onContinue}>GOT IT</button>}
          {step === 'complete' && <>
            <button type="button" className="ui-primary" onClick={onClose}>KEEP PLAYING</button>
            <button type="button" className="ui-secondary" onClick={onRestart}>RESTART</button>
          </>}
          {step !== 'complete' && <button type="button" className="tutorial-skip" onClick={onSkip}>{step === 'welcome' ? 'NOT NOW' : 'SKIP STEP'}</button>}
        </div>
      </section>
    </div>
  );
}
