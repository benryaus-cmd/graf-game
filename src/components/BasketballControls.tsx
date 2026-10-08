import { useEffect, useRef } from 'react';
import { basketballFlickSpeed, type BasketballGesture } from '@/game/basketballPhysics';
import type { BasketballView } from '@/game/basketballGame';
import { BASKETBALL_COURT } from '@/game/basketballCourt';
import { elementPointerIsRotated, elementPointerPoint } from '@/game/pointerCoordinates';

/** Transparent game-viewport surface. Owns one pointer; cancellation never shoots. */
export function attachBasketballFlickPad(pad: HTMLElement, shoot: (gesture: BasketballGesture) => void): () => void {
  let gesture: {id:number;x:number;y:number;started:number;width:number;height:number} | null = null;
  const feedback = pad.querySelector<HTMLElement>('[data-basketball-feedback]');
  const resetFeedback = () => {
    pad.style.setProperty('--basketball-power', '0%');
    pad.style.setProperty('--basketball-aim', '50%');
    pad.style.setProperty('--basketball-feedback-opacity', '0');
    if (feedback) feedback.textContent = 'Flick up anywhere';
  };
  const readGesture = (event: PointerEvent): BasketballGesture | null => {
    if (!gesture || gesture.id !== event.pointerId) return null;
    const point = elementPointerPoint(pad,event),scale = Math.min(gesture.width,gesture.height)*.35;
    return {dx:(point.x-gesture.x)*gesture.width/scale,dy:(gesture.y-point.y)*gesture.height/scale,durationMs:performance.now()-gesture.started};
  };
  const move = (event: PointerEvent) => {
    const preview = readGesture(event);
    if (!preview) return;
    const speed = basketballFlickSpeed({dy:Math.max(0,Math.min(1,preview.dy)),durationMs:Math.max(40,preview.durationMs)});
    pad.style.setProperty('--basketball-power', `${Math.max(0,Math.min(100,(speed-5)/8*100))}%`);
    pad.style.setProperty('--basketball-aim', `${Math.max(0,Math.min(100,50+preview.dx*50))}%`);
    const power = speed < 8 ? 'short' : speed > 8.4 ? 'strong' : 'steady';
    const aim = Math.abs(preview.dx) < .025 ? 'centered' : preview.dx < 0 ? 'left' : 'right';
    if (feedback) feedback.textContent = `Power ${power} · Aim ${aim}`;
  };
  const cancel = () => {
    const id = gesture?.id;
    gesture = null;
    resetFeedback();
    if (id !== undefined && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  };
  const down = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (gesture || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) ||
      (typeof target?.closest === 'function' && target.closest('button, a, input, select, textarea, [role=button], [data-basketball-ui]'))) return;
    event.preventDefault();event.stopPropagation();
    const point = elementPointerPoint(pad,event),rect=pad.getBoundingClientRect();
    if (point.x<0 || point.x>1 || point.y<0 || point.y>1) return;
    const rotated=elementPointerIsRotated(pad);
    gesture={id:event.pointerId,x:point.x,y:point.y,started:performance.now(),width:rotated?rect.height:rect.width,height:rotated?rect.width:rect.height};
    try {pad.setPointerCapture(event.pointerId);pad.style.setProperty('--basketball-feedback-opacity', '1');} catch {gesture=null;resetFeedback();}
  };
  const up = (event: PointerEvent) => {
    if (!gesture || gesture.id!==event.pointerId) return;
    event.preventDefault();event.stopPropagation();
    const {dx,dy,durationMs}=readGesture(event)!;
    cancel();
    // Validate the actual direction before clamping long screen swipes to the launch contract.
    if (Number.isFinite(dx) && Number.isFinite(dy) && dy>=0.08 && dy>Math.abs(dx)) {
      shoot({dx:Math.max(-1,Math.min(1,dx)),dy:Math.min(1,dy),durationMs});
    }
  };
  const cancelled = (event: PointerEvent) => {if(event.pointerId===gesture?.id) cancel();};
  const hidden = () => {if(document.visibilityState==='hidden') cancel();};
  resetFeedback();
  pad.addEventListener('pointerdown',down);
  pad.addEventListener('pointermove',move);
  pad.addEventListener('pointerup',up);
  pad.addEventListener('pointercancel',cancelled);
  pad.addEventListener('lostpointercapture',cancelled);
  window.addEventListener('blur',cancel);
  if(typeof document!=='undefined') document.addEventListener('visibilitychange',hidden);
  return () => {
    cancel();pad.removeEventListener('pointermove',move);pad.removeEventListener('pointerdown',down);pad.removeEventListener('pointerup',up);
    pad.removeEventListener('pointercancel',cancelled);pad.removeEventListener('lostpointercapture',cancelled);
    window.removeEventListener('blur',cancel);
    if(typeof document!=='undefined') document.removeEventListener('visibilitychange',hidden);
  };
}

interface BasketballControlsProps {
  view: BasketballView | null;
  exploring: boolean;
  paused: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onSpot: (id: number) => void;
  onShoot: (gesture: BasketballGesture) => void;
}
export function BasketballControls({view,exploring,paused,onEnter,onLeave,onSpot,onShoot}:BasketballControlsProps) {
  const pad=useRef<HTMLDivElement>(null),shoot=useRef(onShoot);
  shoot.current=onShoot;
  useEffect(()=>{
    if(!pad.current || !view?.active || paused) return;
    return attachBasketballFlickPad(pad.current,gesture=>shoot.current(gesture));
  },[view?.active,paused]);
  if(!view || paused) return null;
  if(!view.active) return view.nearby && exploring ? <button className="basketball-enter" onClick={onEnter}>PLAY BASKETBALL</button> : null;
  const outcome=view.recentResult?.outcome;
  const status=outcome==='make' ? 'BUCKET!' : outcome==='miss' ? 'Try again' : 'Flick up to shoot';
  return <section className="basketball-controls" aria-label="Basketball shooting controls">
    <div className="basketball-screen" ref={pad} role="group" aria-label="Flick upward anywhere to shoot">
      <div className="basketball-feedback" aria-hidden="true">
        <div className="basketball-feedback-meters"><div className="basketball-meter-row"><span>POWER</span><div className="basketball-power-meter"><i className="basketball-power-band" /><i className="basketball-power-fill" /></div></div><div className="basketball-meter-row"><span>AIM</span><div className="basketball-aim-meter"><i className="basketball-aim-center" /><i className="basketball-aim-marker" /></div></div></div>
        <small data-basketball-feedback>Flick up anywhere</small>
      </div>
    </div>
    <div className="basketball-score"><span><b>{view.makes}</b>/{view.attempts} made</span><span><b>{view.streak}</b> streak</span></div>
    <p className={`basketball-result ${outcome==='make'?'is-make':''}`} aria-live="polite">{status}</p>
    <button className="basketball-leave" data-basketball-ui onClick={onLeave}>LEAVE</button>
    <div className="basketball-spots" data-basketball-ui aria-label="Choose shooting spot">{BASKETBALL_COURT.spots.map((spot,index)=><button key={spot.id} aria-label={`Spot ${index+1}`} aria-pressed={view.spotId===spot.id} onClick={()=>onSpot(spot.id)}>{index+1}</button>)}</div>
  </section>;
}
