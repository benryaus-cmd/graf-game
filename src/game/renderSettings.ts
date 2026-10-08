/** Device-local rendering preferences. They never change network or paint authority. */
export interface RenderSettings { renderScale: number; fogDensity: number; horizonDistance: number; horizon: boolean; scenery: boolean; streamBudgetMs: number; retentionSeconds: number; liveStrokeDistance: number; detailDistance:number; skylineDistance:number; skylineMinHeight:number; skylineWidth:number; skyline:boolean; exposure:number }
export const DEFAULT_RENDER_SETTINGS: Readonly<RenderSettings> = Object.freeze({ renderScale: 1, fogDensity: .011, horizonDistance: 192, horizon: true, scenery: true, streamBudgetMs: 2, retentionSeconds: 5, liveStrokeDistance: 30, detailDistance:96, skylineDistance:480, skylineMinHeight:24, skylineWidth:1.05, skyline:true, exposure:1.15 });
const KEY='graffciti.render-settings.v1';
export function normaliseRenderSettings(value: unknown): RenderSettings {
  const v=(value && typeof value==='object' ? value : {}) as Partial<RenderSettings>;
  const number=(key:keyof RenderSettings,min:number,max:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.max(min,Math.min(max,v[key] as number)):DEFAULT_RENDER_SETTINGS[key] as number;
  return { renderScale:number('renderScale',.35,3), fogDensity:number('fogDensity',0,.2), horizonDistance:number('horizonDistance',48,768), horizon:typeof v.horizon==='boolean'?v.horizon:true, scenery:typeof v.scenery==='boolean'?v.scenery:true, streamBudgetMs:number('streamBudgetMs',.25,12), retentionSeconds:number('retentionSeconds',0,30), liveStrokeDistance:number('liveStrokeDistance',5,240), detailDistance:number('detailDistance',4,144), skylineDistance:number('skylineDistance',48,1152), skylineMinHeight:number('skylineMinHeight',5,56), skylineWidth:number('skylineWidth',.5,3), skyline:typeof v.skyline==='boolean'?v.skyline:true, exposure:number('exposure',.1,3) };
}
function read(){try{return normaliseRenderSettings(JSON.parse(localStorage.getItem(KEY)??'null'));}catch{return {...DEFAULT_RENDER_SETTINGS};}}
let current=read(); const listeners=new Set<()=>void>();
export const getRenderSettings=()=>current;
export const subscribeRenderSettings=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function setRenderSettings(patch:Partial<RenderSettings>){current=normaliseRenderSettings({...current,...patch});try{localStorage.setItem(KEY,JSON.stringify(current));}catch{/* Session preferences still work. */}listeners.forEach(listener=>listener());}
export const resetRenderSettings=()=>setRenderSettings({...DEFAULT_RENDER_SETTINGS});
