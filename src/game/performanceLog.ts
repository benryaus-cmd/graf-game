import { normaliseRenderSettings, type RenderSettings } from './renderSettings';
export interface FrameMetrics { calls:number; triangles:number; textures:number; geometries:number; chunks:number; queued:number; cpuMs:number }
export interface RunEvent { at:number; message:string }
export interface PerformanceRun { label:string; startedAt:string; durationMs:number; frames:number; fps:number; frameMs:{p50:number;p95:number;p99:number;max:number}; render:Record<keyof FrameMetrics,{average:number;max:number}>; settings:RenderSettings; events:RunEvent[]; environment:string }
const KEY='graffciti.performance-runs.v1'; const fields:(keyof FrameMetrics)[]=['calls','triangles','textures','geometries','chunks','queued','cpuMs'];
const emptyMetrics=()=>Object.fromEntries(fields.map(key=>[key,{average:0,max:0}])) as PerformanceRun['render'];
export class PerformanceLog {
  runs:PerformanceRun[]=[]; active=false; latest:FrameMetrics|null=null; liveFps=0; private pulseStart=0;private pulseFrames=0;
  describeEnvironment=()=>typeof navigator==='undefined'?'Node test':navigator.userAgent;
  private label='';private startedAt='';private environment='';private startAt=0;private previous:number|null=null;private frames=0;private total=0;private histogram=new Uint32Array(10001);private maxFrame=0;private samples=0;private metrics=emptyMetrics();private events:RunEvent[]=[];private settings!:RenderSettings;
  start(label:string,settings:RenderSettings,now=performance.now()) {if(this.active)this.stop(now);this.active=true;this.label=label.trim()||'City walk';this.startedAt=new Date().toISOString();this.environment=this.describeEnvironment();this.startAt=now;this.previous=null;this.frames=0;this.total=0;this.maxFrame=0;this.samples=0;this.histogram.fill(0);this.metrics=emptyMetrics();this.events=[];this.settings={...settings};}
  event(message:string,now=performance.now()){if(!this.active)return;this.events.push({at:Math.round(now-this.startAt),message:message.slice(0,500)});if(this.events.length>100)this.events.shift();}
  frame(now:number,metrics:FrameMetrics,hidden:boolean){this.latest=metrics;
    if(hidden){this.pulseStart=0;this.pulseFrames=0;}else{if(!this.pulseStart)this.pulseStart=now;this.pulseFrames++;if(now-this.pulseStart>=750){this.liveFps=Math.round(this.pulseFrames/(now-this.pulseStart)*1000);this.pulseStart=now;this.pulseFrames=0;}}
    if(!this.active)return;if(hidden){this.previous=null;if(!this.events[this.events.length-1]?.message.includes('Background'))this.event('Background interval excluded',now);return;}
    if(this.previous!==null){const ms=now-this.previous;if(ms>0&&Number.isFinite(ms)){this.frames++;this.total+=ms;this.histogram[Math.min(10000,Math.round(ms))]++;this.maxFrame=Math.max(this.maxFrame,ms);}else this.event('Frame gap excluded: '+Math.round(ms)+' ms',now);}this.previous=now;
    this.samples++;for(const field of fields){const v=metrics[field];this.metrics[field].average+=v;this.metrics[field].max=Math.max(this.metrics[field].max,v);}
  }
  stop(now=performance.now()):PerformanceRun|null {if(!this.active)return null;this.active=false;
    const percentile=(fraction:number)=>{const target=Math.ceil(this.frames*fraction);let count=0;if(!target)return 0;for(let i=0;i<this.histogram.length;i++){count+=this.histogram[i];if(count>=target)return i;}return 10000;};
    const render=emptyMetrics();for(const f of fields)render[f]={average:Math.round(this.metrics[f].average/Math.max(1,this.samples)*100)/100,max:this.metrics[f].max};
    const run:PerformanceRun={label:this.label,startedAt:this.startedAt,durationMs:Math.round(now-this.startAt),frames:this.frames,fps:this.total?Math.round(this.frames/this.total*100000)/100:0,frameMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:Math.round(this.maxFrame)},render,settings:{...this.settings},events:[...this.events],environment:this.environment};
    this.runs=[...this.runs,run].slice(-10);return run;
  }
}
export function copyRunReport(runs:readonly PerformanceRun[]):string{return runs.length?'GraffCiti city tests v1\n'+JSON.stringify(runs.slice(-3),null,2):'No completed test runs yet. Start a test, walk around, then Stop & Save.';}
export const performanceLog=new PerformanceLog();
export function readPerformanceRuns(value:unknown):PerformanceRun[] {
  if(!Array.isArray(value))return [];
  const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  return value.filter(r=>r&&typeof r.label==='string'&&typeof r.startedAt==='string'&&finite(r.durationMs)&&finite(r.frames)&&finite(r.fps)&&r.frameMs&&['p50','p95','p99','max'].every(k=>finite(r.frameMs[k]))&&r.render&&fields.every(k=>r.render[k]&&finite(r.render[k].average)&&finite(r.render[k].max))&&Array.isArray(r.events)).slice(-10).map(r=>({...r,label:r.label.slice(0,60),settings:normaliseRenderSettings(r.settings),events:r.events.filter(e=>e&&finite(e.at)&&typeof e.message==='string').slice(-100)}));
}
try{performanceLog.runs=readPerformanceRuns(JSON.parse(localStorage.getItem(KEY)??'[]'));}catch{/* Fresh or unavailable device storage. */}
export function savePerformanceRun(){const run=performanceLog.stop();try{localStorage.setItem(KEY,JSON.stringify(performanceLog.runs));}catch{return {run,saved:false};}return {run,saved:true};}
