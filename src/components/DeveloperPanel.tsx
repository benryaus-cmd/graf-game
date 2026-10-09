import { useEffect, useState, useSyncExternalStore } from 'react';
import { getRenderSettings, subscribeRenderSettings, setRenderSettings, resetRenderSettings, DEFAULT_RENDER_SETTINGS, MAX_STREET_LIGHTS, type RenderSettings } from '@/game/renderSettings';
import { performanceLog, savePerformanceRun, copyRunReport } from '@/game/performanceLog';

export default function DeveloperPanel({onClose,onFiles,onMorningPreset}:{onClose:()=>void;onFiles:()=>void;onMorningPreset?:()=>void}) {
  const settings=useSyncExternalStore(subscribeRenderSettings,getRenderSettings);
  const [collapsed,setCollapsed]=useState(false),[label,setLabel]=useState('City walk'),[notice,setNotice]=useState(''),[,refresh]=useState(0),[report,setReport]=useState(''),[baseline,setBaseline]=useState(true);
  useEffect(()=>{performanceLog.showFps(true);const timer=setInterval(()=>refresh(v=>v+1),1000);return()=>{clearInterval(timer);performanceLog.showFps(false);};},[]);
  const change=(patch:Partial<RenderSettings>)=>setRenderSettings(patch);
  const number=(name:string,key:keyof RenderSettings,min:number,max:number,step:number)=> <NumberSetting key={key} name={name} field={key} value={settings[key] as number} min={min} max={max} step={step} onChange={change}/>;
  const toggle=(name:string,key:'horizon'|'scenery'|'skyline'|'groundExtension'|'fogCull'|'skyMatch'|'flatSky'|'customFog'|'streetLights'|'lampPools'|'playerLight'|'heightLod')=><div className="developer-toggle"><button aria-pressed={settings[key]} onClick={()=>change({[key]:!settings[key]})}>{name} {settings[key]?'ON':'OFF'}</button><button aria-label={'Reset '+name} onClick={()=>change({[key]:DEFAULT_RENDER_SETTINGS[key]})}>↺</button></div>;
  const select=(name:string,key:'skyMode'|'fogStyle',options:string[])=><div className="developer-number"><label htmlFor={'dev-'+key}>{name}</label><div><select id={'dev-'+key} aria-label={name} value={settings[key]} onChange={e=>change({[key]:e.target.value})}>{options.map(option=><option key={option} value={option}>{option.toUpperCase()}</option>)}</select><button aria-label={'Reset '+name} onClick={()=>change({[key]:DEFAULT_RENDER_SETTINGS[key]})}>↺</button></div></div>;
  const color=(name:string,key:'fogColor'|'groundColor')=><div className="developer-number"><label>{name}</label><div><input type="color" aria-label={name} value={settings[key]} onChange={e=>change({[key]:e.target.value})}/><button aria-label={'Reset '+name} onClick={()=>change({[key]:DEFAULT_RENDER_SETTINGS[key]})}>↺</button></div></div>;
  const stop=()=>{const result=savePerformanceRun();setNotice(result.saved?'Test saved on this device.':'Test kept for this session; device storage unavailable.');refresh(v=>v+1);};
  return <section className={'developer-live-panel'+(collapsed?' is-collapsed':'')} aria-label="Live game settings" onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    <header>
      <strong>{performanceLog.active?(performanceLog.phase==='baseline'?`BASELINE ${performanceLog.baselineRemaining()}s`:'● RECORDING'):'LIVE SETTINGS'} · {performanceLog.liveFps} FPS</strong><button aria-label={collapsed?'Expand live settings':'Collapse live settings'} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'▾':'−'}</button><button aria-label="Close live settings" onClick={onClose}>×</button>
    </header>
    {!collapsed&&<div className="developer-live-body">
      <p className="ui-notice">Changes apply immediately and stay on this device.</p>
      <div className="developer-settings-grid">
      {number('RENDER SCALE','renderScale',.35,3,.05)}{number('HAZE','fogDensity',0,.2,.001)}
      {number('DETAIL RANGE (m)','detailDistance',4,144,4)}{number('3D BLOCKS (m)','horizonDistance',48,768,24)}
      {number('FLAT SKYLINE (m)','skylineDistance',48,1152,24)}{number('LANDMARK HEIGHT (m)','skylineMinHeight',5,56,1)}
      {number('HEIGHT SPLIT (m)','lodHeightThreshold',1,80,1)}{toggle('HEIGHT RANGES','heightLod')}
      {number('SHORT · DETAIL (m)','shortDetailDistance',4,144,1)}{number('TALL · DETAIL (m)','tallDetailDistance',4,144,1)}
      {number('SHORT · SIMPLE 3D (m)','shortProxyDistance',0,768,1)}{number('TALL · SIMPLE 3D (m)','tallProxyDistance',0,768,1)}
      {number('SHORT · FLAT 2D (m)','shortFlatDistance',0,1152,1)}{number('TALL · FLAT 2D (m)','tallFlatDistance',0,1152,1)}
      {number('SILHOUETTE WIDTH','skylineWidth',.5,3,.05)}{number('EXPOSURE','exposure',.1,3,.05)}
      {number('LIVE STROKES (m)','liveStrokeDistance',5,240,5)}{number('LOAD BUDGET (ms)','streamBudgetMs',.25,12,.25)}
      {number('KEEP CHUNKS (s)','retentionSeconds',0,30,1)}{number('PREFETCH (m)','prefetchDistance',0,24,1)}
      {select('SKY / TIME','skyMode',['game','day','sunset','pastel','rain','night'])}{select('FOG STYLE','fogStyle',['exp','linear'])}
      {number('FOG START (m)','fogNear',0,1198,1)}{number('SOLID FOG (m)','fogFar',1,1199,1)}
      {number('GROUND REACH (chunks)','groundChunks',1,20,1)}{color('GROUND COLOUR','groundColor')}
      {number('SHARED IMAGES (m)','imageLoadDistance',3,240,1)}{number('IMAGE LOADS AT ONCE','imageConcurrency',1,7,1)}
      {number('AMBIENT LIGHT','ambientScale',0,5,.05)}{number('SUN / MOON LIGHT','sunScale',0,5,.05)}
      {number('NEARBY REAL LIGHTS','lampCount',0,MAX_STREET_LIGHTS,1)}{number('LIGHTS ON WITHIN (m)','lampActivationDistance',2,120,1)}
      {number('LAMP POWER','lampIntensity',0,150,1)}{number('LAMP REACH (m)','lampDistance',2,40,1)}
      {number('GLOW POOL RADIUS (m)','lampRadius',1,12,.5)}{number('LAMP FADE (m)','lampFadeDistance',0,30,1)}
      {number('PLAYER LIGHT POWER','playerLightIntensity',0,50,.5)}{color('CUSTOM FOG COLOUR','fogColor')}
      {toggle('GROUND EXTENSION','groundExtension')}{toggle('FOG CULLING','fogCull')}
      {toggle('MATCH SKY TO HAZE','skyMatch')}{toggle('SOLID HAZE SKY','flatSky')}
      {toggle('CUSTOM FOG COLOUR','customFog')}{toggle('STREET LIGHTS','streetLights')}
      {toggle('CHEAP GLOW POOLS','lampPools')}{toggle('PLAYER LIGHT','playerLight')}
      {toggle('CITY PROXIES','horizon')}{toggle('FLAT SKYLINE','skyline')}{toggle('TREE DETAIL','scenery')}
      </div><p className="ui-notice">Type a value, then Enter or tap away. ↺ resets that setting. Linear fog becomes solid at SOLID FOG distance; EXP uses HAZE. Shared-image range controls remote artwork downloads and display. Ground reach is visual only. Set nearby real lights to 0 for cheap glow only. With HEIGHT RANGES on, SHORT means below HEIGHT SPLIT and TALL means at or above it. Each gets detail, simple 3D and flat 2D ranges; otherwise the global ranges apply. Flat 2D overlaps the 3D cutoff by 2 m. LIGHTS ON WITHIN is distance from the player. The nearest lamps inside that distance receive real light, up to NEARBY REAL LIGHTS. LAMP REACH is how far illumination travels from each lamp. Detailed range is limited to resident chunks. Lower haze reveals the distant skyline.</p>
      <section className="tool-section"><h3>PERFORMANCE TEST</h3><label className="ui-field">RUN NAME<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={60}/></label>
      <label className="ui-checkbox"><input type="checkbox" checked={baseline} disabled={performanceLog.active} onChange={e=>setBaseline(e.target.checked)}/>Include 5-second blank-scene baseline</label><div className="button-row"><button onClick={()=>{if(performanceLog.active)stop();else {performanceLog.start(label,settings,performance.now(),{baselineSeconds:baseline?5:0});setNotice(baseline?'City hidden for 5 seconds. Stand still; it returns automatically.':'Recording. Collapse this panel and walk around.');refresh(v=>v+1);}}}>{performanceLog.active?'STOP LOGGING':'START LOGGING'}</button><button onClick={async()=>{if(performanceLog.active)performanceLog.checkpoint();const text=copyRunReport(performanceLog.runs);try{await navigator.clipboard.writeText(text);setNotice('Current log copied.');}catch{setReport(text);setNotice('Select and copy the report below.');}}}>COPY LOG</button></div>
      {performanceLog.latest&&<p className="developer-stats">{performanceLog.liveFps} FPS · draws {performanceLog.latest.calls} · triangles {performanceLog.latest.triangles.toLocaleString()}<br/>Textures {performanceLog.latest.textures} · chunks {performanceLog.latest.chunks} · queued {performanceLog.latest.queued}</p>}
      {!performanceLog.active&&performanceLog.lastRun&&<p className="ui-notice">{performanceLog.lastRun.label}: {performanceLog.lastRun.fps} FPS · p95 {performanceLog.lastRun.frameMs.p95} ms · {performanceLog.lastRun.status==='interrupted'?'RECOVERED UNFINISHED LOG':'SAVED LOG'}</p>}<p className="ui-notice">Only the latest test is kept. Recording checkpoints locally about every {performanceLog.checkpointIntervalMs/1000}s. A hard crash may lose the tail since the last checkpoint.</p>
      {notice&&<p role="status" className="ui-notice">{notice}</p>}{report&&<textarea aria-label="Performance report to copy" readOnly value={report} onFocus={e=>e.target.select()}/>}
      </section><div className="button-row"><button onClick={()=>{resetRenderSettings();}}>RESET SETTINGS</button>{onMorningPreset&&<button onClick={onMorningPreset}>MORNING PRESET</button>}<button onClick={onFiles}>PROJECT FILE VIEWER</button></div>
    </div>}
  </section>;
}

function NumberSetting({name,field,value,min,max,step,onChange}:{name:string;field:keyof RenderSettings;value:number;min:number;max:number;step:number;onChange:(patch:Partial<RenderSettings>)=>void}){
 const [draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
 const commit=()=>{const parsed=draft.trim()?Number(draft):NaN;const next=Number.isFinite(parsed)?Math.max(min,Math.min(max,parsed)):value;setDraft(String(next));onChange({[field]:next});};
 return <div className="developer-number"><label htmlFor={'dev-'+field}>{name}</label><div><input id={'dev-'+field} aria-label={name} type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><button aria-label={'Reset '+name} onClick={()=>{const next=DEFAULT_RENDER_SETTINGS[field] as number;setDraft(String(next));onChange({[field]:next});}}>↺</button></div></div>;
}
