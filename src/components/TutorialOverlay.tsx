import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { TUTORIAL_ORDER, tutorialProgress, type TutorialStep } from '@/game/tutorial';

interface TutorialOverlayProps {
  step: TutorialStep;
  onStart: () => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onRestart: () => void;
  onClose: () => void;
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
    body: 'Adjust the box width or height. This sets the size of your piece.',
    target: 'canvas-size',
  },
  'move-canvas': {
    title: 'MOVE YOUR CANVAS',
    body: 'Tap MOVE AREA, then drag the box to position it on the wall.',
    target: 'canvas-move',
  },
  'start-painting': {
    title: 'START YOUR PIECE',
    body: 'Solo canvases are free. Start when the size and position look right.',
    target: 'canvas-start',
  },
  paint: {
    title: 'MAKE YOUR MARK',
    body: 'Choose a colour or tool and paint inside your canvas.',
    target: 'paint-tools',
  },
  finish: {
    title: 'FINISH YOUR PIECE',
    body: 'Name it if you want, then finish the piece to save it.',
    target: 'piece-finish',
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

export default function TutorialOverlay({ step, onStart, onBack, onSkip, onContinue, onRestart, onClose }: TutorialOverlayProps) {
  const copy = COPY[step];
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const progress = tutorialProgress(step);

  useEffect(() => {
    if (!copy.target) {
      setTargetRect(null);
      return;
    }
    let observer: ResizeObserver | null = null;
    const update = () => {
      const target = document.querySelector<HTMLElement>(`[data-tutorial="${copy.target}"]`);
      setTargetRect(target?.getBoundingClientRect() ?? null);
      observer?.disconnect();
      if (target && 'ResizeObserver' in window) {
        observer = new ResizeObserver(() => setTargetRect(target.getBoundingClientRect()));
        observer.observe(target);
      }
    };
    const frame = requestAnimationFrame(update);
    const retry = window.setTimeout(update, 180);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(retry);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      observer?.disconnect();
    };
  }, [copy.target, step]);

  const spotlight = useMemo<CSSProperties | undefined>(() => targetRect ? ({
    left: Math.max(4, targetRect.left - 7),
    top: Math.max(4, targetRect.top - 7),
    width: Math.min(window.innerWidth - 8, targetRect.width + 14),
    height: Math.min(window.innerHeight - 8, targetRect.height + 14),
  }) : undefined, [targetRect]);

  const cardAtTop = !!targetRect && targetRect.top > window.innerHeight * .52;
  const index = TUTORIAL_ORDER.indexOf(step);
  const canBack = index > 0 && step !== 'complete';

  return (
    <div className="tutorial-layer" role="dialog" aria-modal="false" aria-label={copy.title}>
      {spotlight && <div className="tutorial-spotlight" style={spotlight} aria-hidden="true" />}
      <section className={`tutorial-card ${cardAtTop ? 'at-top' : 'at-bottom'}`}>
        {step !== 'welcome' && step !== 'complete' && <small className="tutorial-progress">{progress.current} / {progress.total}</small>}
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        <div className="tutorial-actions">
          {canBack && <button type="button" className="ui-secondary" onClick={onBack}>BACK</button>}
          {step === 'welcome' && <button type="button" className="ui-primary" onClick={onStart}>START TUTORIAL</button>}
          {step === 'multiplayer-info' && <button type="button" className="ui-primary" onClick={onContinue}>GOT IT</button>}
          {step === 'complete' && <>
            <button type="button" className="ui-primary" onClick={onClose}>KEEP PLAYING</button>
            <button type="button" className="ui-secondary" onClick={onRestart}>RESTART</button>
          </>}
          {step !== 'complete' && <button type="button" className="tutorial-skip" onClick={onSkip}>SKIP</button>}
        </div>
      </section>
    </div>
  );
}
