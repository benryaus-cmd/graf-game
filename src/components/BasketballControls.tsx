import { useEffect, useRef } from 'react';
import { BASKETBALL_MAX_FLICK_SPEED, basketballFlickSpeed, type BasketballGesture } from '@/game/basketballPhysics';
import type { BasketballView } from '@/game/basketballGame';
import { BASKETBALL_COURT } from '@/game/basketballCourt';
import { elementPointerIsRotated, elementPointerPoint } from '@/game/pointerCoordinates';
import { BasketballFlickTracker, type BasketballScreenPoint } from '@/game/basketballGesture';

export interface BasketballBallTarget extends BasketballScreenPoint {radius:number}
interface BasketballGrabCallbacks {
  target:()=>BasketballBallTarget|null;
  move:(point:BasketballScreenPoint|null)=>void;
}
/** The transparent surface owns a pointer only when the visible ball is grabbed. */
export function attachBasketballFlickPad(pad: HTMLElement, shoot: (gesture: BasketballGesture) => void, ball:BasketballGrabCallbacks): () => void {
  let gesture: {id:number;offset:BasketballScreenPoint;tracker:BasketballFlickTracker} | null = null;
  let previewTimer:ReturnType<typeof setTimeout>|undefined;
  const feedback = pad.querySelector<HTMLElement>('[data-basketball-feedback]');
  const resetFeedback = () => {
    pad.style.setProperty('--basketball-power', '0%');pad.style.setProperty('--basketball-aim', '50%');
    pad.style.setProperty('--basketball-feedback-opacity', '0');pad.classList.remove('is-grabbing');
    if (feedback) feedback.textContent = 'Grab ball, flick up';
  };
  const pointFor=(event:PointerEvent)=>elementPointerPoint(pad,event);
  const follow=(point:BasketballScreenPoint)=>{
    if(gesture)ball.move({x:point.x+gesture.offset.x,y:point.y+gesture.offset.y});
  };
  const move = (event: PointerEvent) => {
    if(!gesture || gesture.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    const point=pointFor(event),now=performance.now();
    gesture.tracker.move(point,now);follow(point);
    if(previewTimer!==undefined)clearTimeout(previewTimer);
    const preview=gesture.tracker.preview(now);
    const speed=preview ? basketballFlickSpeed(preview) : 0;
    pad.style.setProperty('--basketball-power', `${Math.max(0,Math.min(100,speed/BASKETBALL_MAX_FLICK_SPEED*100))}%`);
    const angle=preview && preview.dy>0 ? Math.atan2(preview.dx,preview.dy) : 0;
    pad.style.setProperty('--basketball-aim', `${Math.max(0,Math.min(100,50+angle/(Math.PI/2)*50))}%`);
    if(feedback)feedback.textContent=preview && preview.dy>Math.abs(preview.dx) ? 'Flick and release' : 'Move to prepare';
    previewTimer=setTimeout(()=>{
      previewTimer=undefined;
      if(!gesture)return;
      pad.style.setProperty('--basketball-power','0%');pad.style.setProperty('--basketball-aim','50%');
      if(feedback)feedback.textContent='Move to prepare';
    },81);
  };
  const cancel = () => {
    const id = gesture?.id;gesture = null;ball.move(null);resetFeedback();
    if(previewTimer!==undefined)clearTimeout(previewTimer);previewTimer=undefined;
    if (id !== undefined && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  };
  const down = (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (gesture || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) ||
      (typeof target?.closest === 'function' && target.closest('button, a, input, select, textarea, [role=button], [data-basketball-ui]'))) return;
    const point=pointFor(event),rect=pad.getBoundingClientRect(),rotated=elementPointerIsRotated(pad);
    const width=rotated?rect.height:rect.width,height=rotated?rect.width:rect.height,targetBall=ball.target();
    if(!targetBall || point.x<0 || point.x>1 || point.y<0 || point.y>1 ||
      Math.hypot((point.x-targetBall.x)*width,(point.y-targetBall.y)*height)>targetBall.radius*Math.min(width,height)+8)return;
    event.preventDefault();event.stopPropagation();
    gesture={id:event.pointerId,offset:{x:targetBall.x-point.x,y:targetBall.y-point.y},tracker:new BasketballFlickTracker(point,performance.now(),width,height)};
    try {pad.setPointerCapture(event.pointerId);pad.style.setProperty('--basketball-feedback-opacity', '1');pad.classList.add('is-grabbing');} catch {cancel();}
  };
  const up = (event: PointerEvent) => {
    if (!gesture || gesture.id!==event.pointerId) return;
    event.preventDefault();event.stopPropagation();
    const point=pointFor(event),launch=gesture.tracker.release(point,performance.now());
    follow(point);
    // Launch before returning the held ball home: origin is its actual release position.
    try {shoot(launch);} finally {cancel();}
  };
  const cancelled = (event: PointerEvent) => {if(event.pointerId===gesture?.id) cancel();};
  const hidden = () => {if(document.visibilityState==='hidden') cancel();};
  resetFeedback();
  pad.addEventListener('pointerdown',down);pad.addEventListener('pointermove',move);pad.addEventListener('pointerup',up);
  pad.addEventListener('pointercancel',cancelled);pad.addEventListener('lostpointercapture',cancelled);
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
  onBallTarget:()=>BasketballBallTarget|null;
  onBallMove:(point:BasketballScreenPoint|null)=>void;
}
export function BasketballControls({view,exploring,paused,onEnter,onLeave,onSpot,onShoot,onBallTarget,onBallMove}:BasketballControlsProps) {
  const pad=useRef<HTMLDivElement>(null),shoot=useRef(onShoot),ballTarget=useRef(onBallTarget),ballMove=useRef(onBallMove);
  shoot.current=onShoot;ballTarget.current=onBallTarget;ballMove.current=onBallMove;
  useEffect(()=>{
    if(!pad.current || !view?.active || paused) return;
    return attachBasketballFlickPad(pad.current,gesture=>shoot.current(gesture),{target:()=>ballTarget.current(),move:point=>ballMove.current(point)});
  },[view?.active,view?.spotId,paused]);
  if(!view || paused) return null;
  if(!view.active) return view.nearby && exploring ? <button className="basketball-enter" onClick={onEnter}>PLAY BASKETBALL</button> : null;
  const outcome=view.recentResult?.outcome;
  const status=outcome==='make' ? 'BUCKET!' : outcome==='miss' ? 'Try again' : 'Grab ball, flick up';
  return <section className="basketball-controls" aria-label="Basketball shooting controls">
    <div className="basketball-screen" ref={pad} role="group" aria-label="Grab the ball, flick upward and release">
      <div className="basketball-feedback" aria-hidden="true">
        <div className="basketball-feedback-meters"><div className="basketball-meter-row"><span>POWER</span><div className="basketball-power-meter"><i className="basketball-power-fill" /></div></div><div className="basketball-meter-row"><span>AIM</span><div className="basketball-aim-meter"><i className="basketball-aim-center" /><i className="basketball-aim-marker" /></div></div></div>
        <small data-basketball-feedback>Grab ball, flick up</small>
      </div>
    </div>
    <div className="basketball-score"><span><b>{view.makes}</b>/{view.attempts} made</span><span><b>{view.streak}</b> streak</span></div>
    <p className={`basketball-result ${outcome==='make'?'is-make':''}`} aria-live="polite">{status}</p>
    <button className="basketball-leave" data-basketball-ui onClick={onLeave}>LEAVE</button>
    <div className="basketball-spots" data-basketball-ui aria-label="Choose shooting spot">{BASKETBALL_COURT.spots.map((spot,index)=><button key={spot.id} aria-label={`Spot ${index+1}`} aria-pressed={view.spotId===spot.id} onClick={()=>onSpot(spot.id)}>{index+1}</button>)}</div>
  </section>;
}
