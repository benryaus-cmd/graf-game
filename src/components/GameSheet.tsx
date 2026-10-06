import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRotatedSheetScroll } from '@/components/useRotatedSheetScroll';
import { sheetViewport } from '@/components/sheetViewport';

interface GameSheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  closeLabel?: string;
}

/** Presentation only: dismissing a sheet never invokes a game action. */
export default function GameSheet({ title, subtitle, onClose, children, footer, className = '', closeLabel = 'Close panel' }: GameSheetProps) {
  const scroll = useRotatedSheetScroll();
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const element = panel.current;
    const shell = element?.closest<HTMLElement>('.game-shell');
    if (!element || !shell) return;
    const previous = document.activeElement as HTMLElement | null;
    element.querySelector<HTMLButtonElement>('.sheet-close')?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]';
      const coach = shell.querySelector<HTMLElement>('.tutorial-card');
      const items = [...Array.from(element.querySelectorAll<HTMLElement>(selector)), ...Array.from(coach?.querySelectorAll<HTMLElement>(selector) ?? [])].filter(item => item.getClientRects().length > 0);
      if (!items.length) { event.preventDefault(); return; }
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = current < 0 ? (event.shiftKey ? items.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next].focus();
    };
    // Keep only sheet layout above a soft keyboard. The game/renderer stays its original size.
    const viewport = window.visualViewport;
    const layout = () => {
      const overlay = element.parentElement;
      if (!overlay) return;
      if (!viewport) {
        for (const name of ['height', 'top', 'left', 'width']) overlay.style.removeProperty(`--sheet-visible-${name}`);
        return;
      }
      const bounds = sheetViewport(shell.getBoundingClientRect(), shell.clientWidth, shell.clientHeight, viewport, shell.classList.contains('game-portrait'));
      for (const [name, value] of Object.entries(bounds)) overlay.style.setProperty(`--sheet-visible-${name}`, `${value}px`);
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(shell);
    const orientation = new MutationObserver(layout);
    orientation.observe(shell, { attributes: true, attributeFilter: ['class'] });
    viewport?.addEventListener('resize', layout);
    viewport?.addEventListener('scroll', layout);
    document.addEventListener('keydown', keydown, true);
    return () => {
      observer.disconnect();
      orientation.disconnect();
      viewport?.removeEventListener('resize', layout);
      viewport?.removeEventListener('scroll', layout);
      document.removeEventListener('keydown', keydown, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const content = <div className={`game-sheet-backdrop ${className}`} onPointerDown={event => event.stopPropagation()} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className="game-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="game-sheet-header">
        <div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button className="sheet-close" type="button" aria-label={closeLabel} onClick={onClose}>×</button>
      </header>
      <div className="game-sheet-body" {...scroll}>{children}</div>
      {footer && <footer className="game-sheet-footer">{footer}</footer>}
    </section>
  </div>;
  const host = typeof document !== 'undefined' && typeof document.querySelector === 'function' ? document.querySelector('.game-shell') : null;
  return host ? createPortal(content, host) : content;
}
