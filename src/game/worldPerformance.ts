import type { WorldEngine } from './worldTypes';
import { performanceLog, savePerformanceRun } from './performanceLog';
/** Hook the existing render call; no second animation loop, GPU readback or per-frame DOM work. */
export function observeWorldPerformance(world:WorldEngine):()=>void {
  const renderer=world.renderer, original=renderer.render;
  const previousEnvironment=performanceLog.describeEnvironment;
  performanceLog.describeEnvironment=()=>`${navigator.userAgent}; game viewport ${renderer.domElement.clientWidth}x${renderer.domElement.clientHeight}; drawing buffer ${renderer.domElement.width}x${renderer.domElement.height}; render pixel ratio ${renderer.getPixelRatio()}; city-streaming-8oct2026`;
  renderer.render=function(scene,camera){
    const screen=this.getRenderTarget()===null, start=performance.now();
    try {original.call(this,scene,camera);} finally {
      if(screen){const now=performance.now();
        const info=this.info, stream=world.scene.userData.cityStreamStats??{};
        performanceLog.frame(now,{calls:info.render.calls,triangles:info.render.triangles,textures:info.memory.textures,geometries:info.memory.geometries,chunks:stream.active??0,queued:stream.queued??0,cpuMs:Math.round((now-start)*100)/100},document.hidden);
      }
    }
  };
  const error=(event:ErrorEvent)=>performanceLog.event('Error: '+event.message);
  const rejected=(event:PromiseRejectionEvent)=>performanceLog.event('Rejected: '+String(event.reason));
  const lost=()=>performanceLog.event('WebGL context lost');const restored=()=>performanceLog.event('WebGL context restored');
  const visibility=()=>{if(document.hidden)performanceLog.frame(performance.now(),performanceLog.latest??{calls:0,triangles:0,textures:0,geometries:0,chunks:0,queued:0,cpuMs:0},true);};
  const pagehide=()=>{if(performanceLog.active){performanceLog.event('Test ended when page closed');savePerformanceRun();}};
  window.addEventListener('pagehide',pagehide);
  window.addEventListener('error',error);window.addEventListener('unhandledrejection',rejected);document.addEventListener('visibilitychange',visibility);
  renderer.domElement.addEventListener('webglcontextlost',lost);renderer.domElement.addEventListener('webglcontextrestored',restored);
  let observer:PerformanceObserver|undefined;
  try {if(PerformanceObserver.supportedEntryTypes.includes('longtask')){observer=new PerformanceObserver(list=>{for(const e of list.getEntries())performanceLog.event('Long task: '+Math.round(e.duration)+' ms');});observer.observe({entryTypes:['longtask']});}}catch{/* Not available in every WebView. */}
  return()=>{renderer.render=original;performanceLog.describeEnvironment=previousEnvironment;observer?.disconnect();window.removeEventListener('pagehide',pagehide);window.removeEventListener('error',error);window.removeEventListener('unhandledrejection',rejected);document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.domElement.removeEventListener('webglcontextrestored',restored);};
}
