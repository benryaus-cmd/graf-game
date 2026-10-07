import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getRenderSettings, subscribeRenderSettings, setRenderSettings, resetRenderSettings, type RenderSettings } from '@/game/renderSettings';
import { performanceLog, savePerformanceRun, copyRunReport } from '@/game/performanceLog';
import { elementPointerPoint } from '@/game/pointerCoordinates';

export default function DeveloperPanel({onClose,onFiles}:{onClose:()=>void;onFiles:()=>void}) {
  const settings=useSyncExternalStore(subscribeRenderSettings,getRenderSettings);const panel=useRef<HTMLElement>(null);
  const [collapsed,setCollapsed]=useState(false),[label,setLabel]=useState('City walk'),[notice,setNotice]=useState(''),[,refresh]=useState(0),[report,setReport]=useState('');
  const drag=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
  useEffect(()=>{const timer=setInterval(()=>refresh(v=>v+1),1000);return()=>clearInterval(timer);},[]);
  const change=(patch:Partial<RenderSettings>)=>{setRenderSettings(patch);performanceLog.event('Settings: '+JSON.stringify(patch));};
  const range=(name:string,key:keyof RenderSettings,min:number,max:number,step:number)=> <label className="paint-range"><span><b>{name}</b><i>{settings[key]}</i></span><input aria-label={name} type="range" min={min} max={max} step={step} value={settings[key] as number} onChange={e=>change({[key]:Number(e.target.value)})}/></label>;
  const stop=()=>{const result=savePerformanceRun();setNotice(result.saved?'Test saved on this device.':'Test kept for this session; device storage unavailable.');refresh(v=>v+1);};
  return <section ref={panel} className={'developer-live-panel'+(collapsed?' is-collapsed':'')} aria-label="Live game settings" onPointerDown={e=>e.stopPropagation()}>
    <header onPointerDown={e=>{if((e.target as HTMLElement).closest('button'))return;const p=panel.current!,shell=p.closest<HTMLElement>('.game-shell')!;const point=elementPointerPoint(shell,e);drag.current={id:e.pointerId,x:point.x*shell.clientWidth,y:point.y*shell.clientHeight,left:p.offsetLeft,top:p.offsetTop};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current,p=panel.current;if(!d||!p||d.id!==e.pointerId)return;const shell=p.closest<HTMLElement>('.game-shell')!,point=elementPointerPoint(shell,e);p.style.left=Math.max(0,Math.min(shell.clientWidth-p.offsetWidth,d.left+point.x*shell.clientWidth-d.x))+'px';p.style.top=Math.max(0,Math.min(shell.clientHeight-48,d.top+point.y*shell.clientHeight-d.y))+'px';p.style.maxHeight=`calc(100% - ${p.offsetTop}px)`;}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
      <strong>{performanceLog.active?'● TESTING':'LIVE SETTINGS'}</strong><button aria-label={collapsed?'Expand live settings':'Collapse live settings'} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'▾':'−'}</button><button aria-label="Close live settings" onClick={onClose}>×</button>
    </header>
    {!collapsed&&<div className="developer-live-body">
      <p className="ui-notice">Drag the header to move this panel. Changes apply immediately and stay on this device.</p>
      {range('RENDER SCALE','renderScale',.65,1.5,.05)}{range('HAZE','fogDensity',.001,.025,.001)}{range('CITY HORIZON (m)','horizonDistance',120,288,24)}{range('LIVE STROKES (m)','liveStrokeDistance',10,120,5)}{range('LOAD BUDGET (ms)','streamBudgetMs',.5,8,.5)}{range('KEEP CHUNKS (s)','retentionSeconds',0,15,1)}
      <div className="button-row"><button aria-pressed={settings.horizon} onClick={()=>change({horizon:!settings.horizon})}>SKYLINE {settings.horizon?'ON':'OFF'}</button><button aria-pressed={settings.scenery} onClick={()=>change({scenery:!settings.scenery})}>TREE DETAIL {settings.scenery?'ON':'OFF'}</button></div>
      <section className="tool-section"><h3>PERFORMANCE TEST</h3><label className="ui-field">RUN NAME<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={60}/></label>
      <div className="button-row"><button onClick={()=>{if(performanceLog.active)stop();else {performanceLog.start(label,settings);setNotice('Recording. Collapse this panel and walk around.');refresh(v=>v+1);}}}>{performanceLog.active?'STOP & SAVE':'START TEST'}</button><button onClick={async()=>{const text=copyRunReport(performanceLog.runs);try{await navigator.clipboard.writeText(text);setNotice('Last 3 runs copied.');}catch{setReport(text);setNotice('Select and copy the report below.');}}}>COPY LAST 3 RUNS</button></div>
      {performanceLog.latest&&<p className="developer-stats">{performanceLog.liveFps} FPS · draws {performanceLog.latest.calls} · triangles {performanceLog.latest.triangles.toLocaleString()}<br/>Textures {performanceLog.latest.textures} · chunks {performanceLog.latest.chunks} · queued {performanceLog.latest.queued}</p>}
      {performanceLog.runs.slice(-3).reverse().map((run,i)=><p className="ui-notice" key={run.startedAt+i}>{run.label}: {run.fps} FPS · p95 {run.frameMs.p95} ms · max {run.render.calls.max} draws</p>)}
      {notice&&<p role="status" className="ui-notice">{notice}</p>}{report&&<textarea aria-label="Performance report to copy" readOnly value={report} onFocus={e=>e.target.select()}/>}
      </section><div className="button-row"><button onClick={()=>{resetRenderSettings();performanceLog.event('Reset rendering defaults');}}>RESET SETTINGS</button><button onClick={onFiles}>PROJECT FILE VIEWER</button></div>
    </div>}
  </section>;
}
