import { useEffect, useRef, useState } from 'react';
import { BASKETBALL_MAX_FLICK_SPEED, basketballFlickSpeed, type BasketballGesture } from '@/game/basketballPhysics';
import type { BasketballView } from '@/game/basketballGame';
import type { BasketballSyncView } from '@/multiplayer/basketballSync';
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
  shared?: BasketballSyncView | null;
  playerNames?: Record<string, string>;
  onInviteHorse?: (playerId: string, spotId: number) => void;
  onAcceptHorse?: () => void;
  exploring: boolean;
  paused: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onSpot: (id: number) => void;
  onShoot: (gesture: BasketballGesture) => void;
  onBallTarget:()=>BasketballBallTarget|null;
  onBallMove:(point:BasketballScreenPoint|null)=>void;
}
export function BasketballControls({view,shared,playerNames = {},onInviteHorse,onAcceptHorse,exploring,paused,onEnter,onLeave,onSpot,onShoot,onBallTarget,onBallMove}:BasketballControlsProps) {
  const sharedMode = !!shared?.connected && shared.available;
  const [selectedOpponent, setSelectedOpponent] = useState('');
  const [horseNotice, setHorseNotice] = useState('');
  const lastHorseFeedback = useRef<number | null>(null);
  const horse = sharedMode && shared.horseAvailable ? shared.court?.horse : null;
  const ownId = shared?.ownSeat?.playerId;
  const participating = !!horse && (horse.phase === 'set' || horse.phase === 'match') && (horse.inviterId === ownId || horse.inviteeId === ownId);
  const waitingTurn = participating && horse.occupantId !== ownId;
  const peers = (shared?.court?.seats ?? []).filter(seat => seat.playerId !== ownId);
  const opponent = peers.some(seat => seat.playerId === selectedOpponent) ? selectedOpponent : peers[0]?.playerId ?? '';
  const freeMark = BASKETBALL_COURT.spots.find(mark => !shared?.court?.seats.some(seat => seat.spotId === mark.id));
  const playerLabel = (playerId: string | null) => playerId === ownId ? 'You' : playerId && playerNames[playerId] || `Player ${(shared?.court?.seats.find(seat => seat.playerId === playerId)?.spotId ?? 0) + 1}`;
  const pad=useRef<HTMLDivElement>(null),shoot=useRef(onShoot),ballTarget=useRef(onBallTarget),ballMove=useRef(onBallMove);
  shoot.current=onShoot;ballTarget.current=onBallTarget;ballMove.current=onBallMove;
  useEffect(() => {
    const feedback = shared?.horseFeedback;
    if (!feedback || feedback.revision === lastHorseFeedback.current) return;
    lastHorseFeedback.current = feedback.revision;
    const notices = feedback.letters.map(({playerId,value}) =>
      playerId === ownId
        ? `YOU GOT ${value.at(-1)}${value.length > 1 ? ' · '+value : ''}`
        : `${(playerNames[playerId] || 'Opponent').toUpperCase()} GOT ${value.at(-1)}`);
    if (feedback.winnerId && ownId) notices.push(feedback.winnerId === ownId ? 'HORSE — YOU WIN' : 'HORSE — YOU LOSE');
    if (!notices.length) return;
    setHorseNotice(notices[0]);
    const timers = notices.slice(1).map((text,index) => setTimeout(() => setHorseNotice(text), (index+1)*1800));
    timers.push(setTimeout(() => setHorseNotice(''), notices.length*1800));
    return () => timers.forEach(clearTimeout);
  }, [shared?.horseFeedback, ownId, playerNames]);

  useEffect(()=>{
    if(!pad.current || !view?.active || paused || waitingTurn || (sharedMode && (!shared.ownSeat || !!shared.pendingShotId))) return;
    return attachBasketballFlickPad(pad.current,gesture=>shoot.current(gesture),{target:()=>ballTarget.current(),move:point=>ballMove.current(point)});
  },[view?.active,view?.spotId,paused,waitingTurn,sharedMode,shared?.ownSeat?.epoch,shared?.pendingShotId]);
  if(!view || paused) return null;
  if(!view.active) {
    if (!view.nearby || !exploring) return null;
    const waiting = sharedMode && shared.entered && !shared.ownSeat;
    if (waiting) return <div className="basketball-enter basketball-waiting" role="status"><span>Waiting for court spot…</span><button onClick={onLeave}>Cancel</button></div>;
    return <div className="basketball-entry"><button className="basketball-enter" onClick={onEnter}>{sharedMode ? 'JOIN SHARED COURT' : shared?.connected ? 'SOLO PRACTICE' : 'PLAY BASKETBALL'}</button>{sharedMode && shared.notice && <p className="basketball-entry-notice" role="status">Court: {shared.notice}</p>}</div>;
  }
  const outcome=view.recentResult?.outcome;
  const status=sharedMode && shared.pendingShotId ? 'Waiting for court…' : waitingTurn ? `Waiting for ${playerLabel(horse!.occupantId)}` : (sharedMode ? shared.notice : null) ?? (outcome==='make' ? 'BUCKET!' : outcome==='miss' ? 'Try again' : 'Grab ball, flick up');
  return <section className="basketball-controls" aria-label="Basketball shooting controls">
    <div className="basketball-screen" ref={pad} role="group" aria-label="Grab the ball, flick upward and release">
      <div className="basketball-feedback" aria-hidden="true">
        <div className="basketball-feedback-meters"><div className="basketball-meter-row"><span>POWER</span><div className="basketball-power-meter"><i className="basketball-power-fill" /></div></div><div className="basketball-meter-row"><span>AIM</span><div className="basketball-aim-meter"><i className="basketball-aim-center" /><i className="basketball-aim-marker" /></div></div></div>
        <small data-basketball-feedback>Grab ball, flick up</small>
      </div>
    </div>
    <div className="basketball-score"><span><b>{view.makes}</b>/{view.attempts} made</span><span>{sharedMode ? "Shared court" : <><b>{view.streak}</b> streak</>}</span></div>
    {horseNotice && <p className="basketball-horse-notice" style={{position:"absolute",left:"50%",top:"37%",transform:"translateX(-50%)",zIndex:30,width:"max-content",maxWidth:"90%",padding:"12px 18px",borderRadius:10,background:"rgba(15,18,16,.93)",border:"2px solid #e2b85a",boxShadow:"0 6px 28px #000a",color:"#ffdf8a",fontWeight:900,fontSize:"clamp(16px,4vw,23px)",textAlign:"center",pointerEvents:"none"}} role="status" aria-live="assertive">{horseNotice}</p>}
    <p className={`basketball-result ${outcome==='make'?'is-make':''}`} aria-live="polite">{status}</p>
    <button className="basketball-leave" data-basketball-ui onClick={onLeave}>LEAVE</button>
    <div className="basketball-spots" data-basketball-ui aria-label={sharedMode ? "Server assigned shooting spot" : "Choose shooting spot"}>{BASKETBALL_COURT.spots.map((spot,index)=><button key={spot.id} disabled={sharedMode} aria-label={`Spot ${index+1}`} aria-pressed={view.spotId===spot.id} onClick={()=>onSpot(spot.id)}>{index+1}</button>)}</div>
    {sharedMode && shared.horseAvailable && <aside className="basketball-horse" data-basketball-ui aria-label="HORSE challenge">
      {horse && <>
        <div className="basketball-horse-letters"><span>{playerLabel(horse.inviterId)} <b>{horse.letters[horse.inviterId] || '—'}</b></span><span>{playerLabel(horse.inviteeId)} <b>{horse.letters[horse.inviteeId] || '—'}</b></span></div>
        {horse.phase === 'invited' ? <>
          <small>{horse.inviteeId === ownId ? `${playerLabel(horse.inviterId)} challenged you` : `Invitation to ${playerLabel(horse.inviteeId)}`}</small>
          {horse.inviteeId === ownId && <button disabled={shared.horsePending || !!shared.pendingShotId || !freeMark || shared.court?.seats.some(seat => seat.spotId === horse.spotId)} onClick={onAcceptHorse}>ACCEPT HORSE</button>}
        </> : horse.phase === 'ended' ? <small>Winner: {playerLabel(horse.winnerId)}</small> : <small><b>{horse.phase.toUpperCase()}</b> · {horse.occupantId === ownId ? 'Your turn' : `${playerLabel(horse.occupantId)} shooting`}</small>}
      </>}
      {(!horse || horse.phase === 'ended') && <details><summary>CHALLENGE TO HORSE</summary>
        <label>Seated players<select aria-label="HORSE opponent" value={opponent} onChange={event => setSelectedOpponent(event.target.value)} disabled={!peers.length || shared.horsePending}>{peers.length ? peers.map(seat => <option key={seat.playerId} value={seat.playerId}>{playerLabel(seat.playerId)}</option>) : <option value="">No other seated players</option>}</select></label>
        <button disabled={!opponent || !freeMark || shared.horsePending || !!shared.pendingShotId} onClick={() => { if (opponent && freeMark) onInviteHorse?.(opponent, freeMark.id); }}>CHALLENGE TO HORSE</button>
        {!freeMark && <small>Need an unused shooting mark</small>}
      </details>}
      {shared.horsePending && <small role="status">Waiting for HORSE confirmation…</small>}
    </aside>}
  </section>;
}
