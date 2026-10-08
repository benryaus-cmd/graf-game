import { normaliseRenderSettings, type RenderSettings } from './renderSettings';

export interface FrameMetrics { calls:number; triangles:number; textures:number; geometries:number; chunks:number; queued:number; cpuMs:number }
export interface RunEvent { at:number; message:string }
type Phase = 'baseline' | 'world';
type Status = 'recording' | 'completed' | 'interrupted';
interface Cost { count:number; totalMs:number; maxMs:number }
export interface SampleContext { position:[number,number,number]; view:string; painting:boolean; surface?:string; viewport?:[number,number]; pixelRatio?:number; horizon?:{plain:number;flat:number;queued:number} }
interface Summary { frames:number; fps:number; frameMs:{p50:number;p95:number;p99:number;max:number}; render:Record<keyof FrameMetrics,{average:number;max:number}> }
interface TimeSample { from:number; to:number; phase:Phase; settingsFrom:number; settingsTo:number; frames:number; measuredMs:number; fps:number; maxFrameMs:number; renderSamples:number; render:FrameMetrics; renderMax:FrameMetrics; context:SampleContext }
export interface PerformanceRun extends Summary {
  version:2; label:string; startedAt:string; updatedAt:string; durationMs:number; status:Status;
  settings:RenderSettings; currentSettings:RenderSettings; settingsChanges:{at:number; settings:RenderSettings}[];
  phases:Record<Phase,Summary>; samples:TimeSample[]; operations:Record<string,Cost>; overhead:Record<string,Cost>;
  events:RunEvent[]; discardedEvents:number; environment:string; checkpointIntervalMs:number; checkpointBytes:number;
}
interface LogStorage { getItem(key:string):string|null; setItem(key:string,value:string):void; removeItem(key:string):void }
const KEY='graffciti.performance-log.v2', LEGACY_KEY='graffciti.performance-runs.v1';
const fields:(keyof FrameMetrics)[]=['calls','triangles','textures','geometries','chunks','queued','cpuMs'];
const zero=()=>Object.fromEntries(fields.map(key=>[key,0])) as unknown as FrameMetrics;
const round=(value:number)=>Math.round(value*100)/100;

class Accumulator {
  frames=0; total=0; max=0; count=0; sums=zero(); maxima=zero(); histogram=new Uint32Array(10001);
  reset(){this.frames=0;this.total=0;this.max=0;this.count=0;this.histogram.fill(0);for(const k of fields){this.sums[k]=0;this.maxima[k]=0;}}
  add(ms:number|null,metrics:FrameMetrics) {
    if(ms!==null&&ms>0&&Number.isFinite(ms)){this.frames++;this.total+=ms;this.max=Math.max(this.max,ms);this.histogram[Math.min(10000,Math.round(ms))]++;}
    this.count++;for(const key of fields){this.sums[key]+=metrics[key];this.maxima[key]=Math.max(this.maxima[key],metrics[key]);}
  }
  summary():Summary {
    const targets=[.5,.95,.99].map(f=>Math.ceil(this.frames*f)), quantiles=[0,0,0];let count=0,index=0;
    if(this.frames)for(let i=0;i<this.histogram.length&&index<3;i++){count+=this.histogram[i];while(index<3&&count>=targets[index])quantiles[index++]=i;}
    return {frames:this.frames,fps:this.total?round(this.frames/this.total*1000):0,frameMs:{p50:quantiles[0],p95:quantiles[1],p99:quantiles[2],max:round(this.max)},render:Object.fromEntries(fields.map(k=>[k,{average:round(this.sums[k]/Math.max(1,this.count)),max:round(this.maxima[k])}])) as Summary['render']};
  }
}

/** One on-demand log. Numeric aggregation per frame; no per-frame storage, DOM or JSON. */
export class PerformanceLog {
  active=false; monitorVisible=false; phase:Phase='world'; latest:FrameMetrics|null=null; liveFps=0; lastRun:PerformanceRun|null=null;
  saved=false; checkpointIntervalMs=2000; checkpointBytes=0; lastCheckpointAt=0;
  describeEnvironment=()=>typeof navigator==='undefined'?'Node test':navigator.userAgent;
  private listeners=new Set<()=>void>(); private label='';private startedAt='';private environment='';private startAt=0;private baselineUntil=0;
  private previous:number|null=null;private pulseStart=0;private pulseFrames=0;private windowFrom=0;private windowRevision=0;private window=new Accumulator();
  private accumulators={baseline:new Accumulator(),world:new Accumulator()};private samples:TimeSample[]=[];
  private events:RunEvent[]=[];private discardedEvents=0;private settings!:RenderSettings;private currentSettings!:RenderSettings;
  private changes:PerformanceRun['settingsChanges']=[];private operations:Record<string,Cost>={};private overhead:Record<string,Cost>={};
  private context:SampleContext={position:[0,0,0],view:'unknown',painting:false};
  constructor(private storage:LogStorage|null=null){
    try {const current=storage?.getItem(KEY),legacy=current?null:storage?.getItem(LEGACY_KEY);const raw=current??legacy;this.lastRun=readPerformanceRuns(raw?JSON.parse(raw):null)[0]??null;
      if(this.lastRun&&legacy){storage?.setItem(KEY,JSON.stringify(this.lastRun));storage?.removeItem(LEGACY_KEY);}else if(current)storage?.removeItem(LEGACY_KEY);
      if(this.lastRun?.status==='recording'){this.lastRun.status='interrupted';this.lastRun.events.push({at:this.lastRun.durationMs,message:'Recovered unfinished test from its last checkpoint. Crash, reload or forced close cannot be distinguished.'});}
    }catch{/* Corrupt or unavailable device storage must not block the game. */}
  }
  get runs():PerformanceRun[]{return this.active?[this.snapshot()]:this.lastRun?[this.lastRun]:[];}
  subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  start(label:string,settings:RenderSettings,now=performance.now(),options:{baselineSeconds?:number}={}) {
    if(this.active)this.stop(now);this.active=true;this.lastRun=null;this.saved=false;this.label=label.trim().slice(0,60)||'City walk';
    this.startedAt=new Date().toISOString();this.environment=this.describeEnvironment();this.startAt=now;this.baselineUntil=now+Math.min(10,Math.max(0,options.baselineSeconds??0))*1000;
    this.phase=this.baselineUntil>now?'baseline':'world';this.previous=null;this.pulseStart=now;this.pulseFrames=0;this.liveFps=0;this.windowFrom=0;this.windowRevision=0;this.window.reset();
    this.accumulators.baseline.reset();this.accumulators.world.reset();this.samples=[];this.events=[];this.discardedEvents=0;this.changes=[];this.operations={};this.overhead={};
    this.settings={...settings};this.currentSettings={...settings};this.checkpointIntervalMs=2000;this.checkpointBytes=0;
    this.event(this.phase==='baseline'?'Blank-scene baseline: world simulation continues; stand still.':'World recording started',now);
    this.checkpoint(now);this.listeners.forEach(listener=>listener());
  }
  baselineRemaining(now=performance.now()){return this.active&&this.phase==='baseline'?Math.max(0,Math.ceil((this.baselineUntil-now)/1000)):0;}
  advancePhase(now=performance.now()) {
    if(!this.active||this.phase!=='baseline'||now<this.baselineUntil)return;
    this.sample(now);this.phase='world';this.previous=null;this.pulseStart=now;this.pulseFrames=0;this.event('Blank scene ended; city rendering restored',now);
  }
  settingsChanged(settings:RenderSettings,now=performance.now()) {
    if(!this.active||Object.keys(settings).every(k=>settings[k as keyof RenderSettings]===this.currentSettings[k as keyof RenderSettings]))return;
    this.currentSettings={...settings};this.changes.push({at:round(now-this.startAt),settings:{...settings}});
  }
  event(message:string,now=performance.now()) {
    if(!this.active)return;this.events.push({at:round(Math.max(0,now-this.startAt)),message:message.slice(0,500)});
    if(this.events.length>400){this.events.shift();this.discardedEvents++;}
  }
  frame(now:number,metrics:FrameMetrics,hidden:boolean) {
    if(!this.active)return;this.latest=metrics;
    if(hidden){this.sample(now);this.previous=null;this.pulseStart=0;this.pulseFrames=0;this.event('Background interval excluded',now);return;}
    const ms=this.previous===null?null:now-this.previous;this.previous=now;
    this.accumulators[this.phase].add(ms,metrics);this.window.add(ms,metrics);
    this.monitorFps(now);
  }
  showFps(visible:boolean){this.monitorVisible=visible;this.pulseStart=0;this.pulseFrames=0;}
  monitorFps(now:number){if(!this.pulseStart)this.pulseStart=now;this.pulseFrames++;if(now-this.pulseStart>=750){this.liveFps=Math.round(this.pulseFrames/(now-this.pulseStart)*1000);this.pulseStart=now;this.pulseFrames=0;}}
  sample(now=performance.now(),context=this.context) {
    if(!this.active)return;this.context=context;
    if(this.window.count){const w=this.window,summary=w.summary();this.samples.push({from:this.windowFrom,to:round(now-this.startAt),phase:this.phase,settingsFrom:this.windowRevision,settingsTo:this.changes.length,frames:w.frames,measuredMs:round(w.total),fps:summary.fps,maxFrameMs:round(w.max),renderSamples:w.count,render:Object.fromEntries(fields.map(k=>[k,summary.render[k].average])) as unknown as FrameMetrics,renderMax:{...w.maxima},context});this.compactSamples();}
    this.window.reset();this.windowFrom=round(now-this.startAt);this.windowRevision=this.changes.length;
  }
  private compactSamples(){
    if(this.samples.length<=600)return;const compacted:TimeSample[]=[];
    for(let i=0;i<this.samples.length;i++){
      const a=this.samples[i],b=this.samples[i+1];
      if(i<300&&b&&a.phase===b.phase){const count=a.renderSamples+b.renderSamples,frames=a.frames+b.frames,total=a.measuredMs+b.measuredMs;
        compacted.push({...a,to:b.to,settingsTo:b.settingsTo,frames,measuredMs:round(total),fps:total?round(frames/total*1000):0,maxFrameMs:Math.max(a.maxFrameMs,b.maxFrameMs),renderSamples:count,render:Object.fromEntries(fields.map(k=>[k,round((a.render[k]*a.renderSamples+b.render[k]*b.renderSamples)/count)])) as unknown as FrameMetrics,renderMax:Object.fromEntries(fields.map(k=>[k,Math.max(a.renderMax[k],b.renderMax[k])])) as unknown as FrameMetrics,context:b.context});i++;
      }else compacted.push(a);
    }this.samples=compacted;
  }
  cost(name:string,ms:number,detail='',now=performance.now()) {
    if(!this.active||!Number.isFinite(ms)||ms<0)return;const cost=this.operations[name]??={count:0,totalMs:0,maxMs:0};cost.count++;cost.totalMs+=ms;cost.maxMs=Math.max(cost.maxMs,ms);
    if(ms>=4)this.event(`${name}: ${round(ms)} ms${detail?' · '+detail:''}`,now);
  }
  measure<T>(name:string,work:()=>T,detail=''):T {
    if(!this.active)return work();const start=performance.now();try{return work();}finally{const end=performance.now();this.cost(name,end-start,detail,end);this.recordOverhead('scopeCollection',performance.now()-end);}
  }
  recordOverhead(name:string,ms:number){if(!this.active)return;const cost=this.overhead[name]??={count:0,totalMs:0,maxMs:0};cost.count++;cost.totalMs+=ms;cost.maxMs=Math.max(cost.maxMs,ms);}
  snapshot(now=performance.now(),status:Status=this.active?'recording':'completed'):PerformanceRun {
    const phases={baseline:this.accumulators.baseline.summary(),world:this.accumulators.world.summary()};
    const costs=(values:Record<string,Cost>)=>Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{count:v.count,totalMs:round(v.totalMs),maxMs:round(v.maxMs)}]));
    return {...phases.world,version:2,label:this.label,startedAt:this.startedAt,updatedAt:new Date().toISOString(),durationMs:round(Math.max(0,now-this.startAt)),status,settings:{...this.settings},currentSettings:{...this.currentSettings},settingsChanges:this.changes.map(c=>({...c,settings:{...c.settings}})),phases,samples:[...this.samples],operations:costs(this.operations),overhead:costs(this.overhead),events:[...this.events],discardedEvents:this.discardedEvents,environment:this.environment,checkpointIntervalMs:this.checkpointIntervalMs,checkpointBytes:this.checkpointBytes};
  }
  checkpoint(now=performance.now()):boolean {
    const start=performance.now();if(this.active){this.sample(now);this.lastRun=this.snapshot(now);}this.lastCheckpointAt=now;
    if(!this.lastRun||!this.storage){this.saved=false;return false;}
    try{const text=JSON.stringify(this.lastRun);this.checkpointBytes=text.length*2;this.storage.setItem(KEY,text);this.storage.removeItem(LEGACY_KEY);this.saved=true;
      const elapsed=performance.now()-start;this.recordOverhead('checkpoint',elapsed);if(elapsed>8)this.checkpointIntervalMs=Math.min(10000,this.checkpointIntervalMs+2000);
    }catch{this.saved=false;this.event('Device storage unavailable; copy this log before closing',now);}return this.saved;
  }
  stop(now=performance.now(),status:Status='completed'):PerformanceRun|null {
    if(!this.active)return null;this.sample(now);this.event(status==='completed'?'Recording stopped':'World closed during recording',now);this.lastRun=this.snapshot(now,status);this.active=false;this.phase='world';this.checkpoint(now);this.listeners.forEach(listener=>listener());return this.lastRun;
  }
}

export function readPerformanceRuns(value:unknown):PerformanceRun[]{
  const v=(Array.isArray(value)?value[value.length-1]:value) as Partial<PerformanceRun>|null;
  const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const summary=(s:unknown):boolean=>{const r=s as Summary;return !!r&&finite(r.frames)&&finite(r.fps)&&!!r.frameMs&&['p50','p95','p99','max'].every(k=>finite(r.frameMs[k as keyof Summary['frameMs']]))&&!!r.render&&fields.every(k=>!!r.render[k]&&finite(r.render[k].average)&&finite(r.render[k].max));};
  if(!v||typeof v.label!=='string'||typeof v.startedAt!=='string'||!finite(v.durationMs)||!summary(v)||!Array.isArray(v.events))return [];
  const validMetrics=(m:FrameMetrics)=>!!m&&fields.every(k=>finite(m[k]));
  const samples=Array.isArray(v.samples)?v.samples.filter(s=>s&&finite(s.from)&&finite(s.to)&&finite(s.frames)&&finite(s.measuredMs)&&finite(s.renderSamples)&&validMetrics(s.render)&&validMetrics(s.renderMax)&&s.context&&Array.isArray(s.context.position)&&s.context.position.length===3&&s.context.position.every(Number.isFinite)).slice(-600):[];
  const costs=(c:unknown)=>c&&typeof c==='object'?Object.fromEntries(Object.entries(c as Record<string,Cost>).filter(([,n])=>n&&finite(n.count)&&finite(n.totalMs)&&finite(n.maxMs))):{};
  return [{...v,version:2,label:v.label.slice(0,60),updatedAt:typeof v.updatedAt==='string'?v.updatedAt:v.startedAt,status:v.status==='recording'||v.status==='interrupted'?v.status:'completed',settings:normaliseRenderSettings(v.settings),currentSettings:normaliseRenderSettings(v.currentSettings??v.settings),settingsChanges:Array.isArray(v.settingsChanges)?v.settingsChanges.filter(c=>c&&finite(c.at)&&c.settings).map(c=>({at:c.at,settings:normaliseRenderSettings(c.settings)})):[],phases:{baseline:summary(v.phases?.baseline)?v.phases!.baseline:new Accumulator().summary(),world:summary(v.phases?.world)?v.phases!.world:v},samples,operations:costs(v.operations),overhead:costs(v.overhead),events:v.events.filter(e=>e&&finite(e.at)&&typeof e.message==='string').slice(-400),discardedEvents:finite(v.discardedEvents)?v.discardedEvents!:0,environment:typeof v.environment==='string'?v.environment:'Legacy log',checkpointIntervalMs:finite(v.checkpointIntervalMs)?v.checkpointIntervalMs!:2000,checkpointBytes:finite(v.checkpointBytes)?v.checkpointBytes!:0} as PerformanceRun];
}
function deviceStorage(){try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export const performanceLog=new PerformanceLog(deviceStorage());
export function copyRunReport(runs:readonly PerformanceRun[]):string{return runs.length?'GraffCiti performance log v2\n'+JSON.stringify(runs[runs.length-1],null,2):'No completed or active test log yet. Start recording, then copy the current log.';}
export function savePerformanceRun(){const run=performanceLog.stop();return {run,saved:performanceLog.saved};}
