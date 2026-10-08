import * as THREE from 'three';
import type { WorldEngine } from './worldTypes';
import { performanceLog, type SampleContext } from './performanceLog';
import { getRenderSettings, subscribeRenderSettings } from './renderSettings';

/** Existing render loop only. Timers, observers and measurements run only during a test. */
export function observeWorldPerformance(world:WorldEngine):()=>void {
  const log=performanceLog,renderer=world.renderer,original=renderer.render;
  const previousEnvironment=log.describeEnvironment;
  log.describeEnvironment=()=>`${navigator.userAgent}; game viewport ${renderer.domElement.clientWidth}x${renderer.domElement.clientHeight}; drawing buffer ${renderer.domElement.width}x${renderer.domElement.height}; render pixel ratio ${renderer.getPixelRatio()}; performance-logger-8oct2026`;
  const blank=new THREE.Scene();blank.background=new THREE.Color('#111510');
  renderer.render=function(scene,camera){
    if(this.getRenderTarget()!==null){original.call(this,scene,camera);return;}
    if(!log.active){if(log.monitorVisible)log.monitorFps(performance.now());original.call(this,scene,camera);return;}
    log.advancePhase();const start=performance.now();
    try{original.call(this,log.phase==='baseline'?blank:scene,camera);}finally{
      const now=performance.now(),info=this.info,stream=world.scene.userData.cityStreamStats??{};
      log.frame(now,{calls:info.render.calls,triangles:info.render.triangles,textures:info.memory.textures,geometries:info.memory.geometries,chunks:stream.active??0,queued:stream.queued??0,cpuMs:now-start},document.hidden);
      log.recordOverhead('frameCollection',performance.now()-now);
    }
  };
  const context=():SampleContext=>({position:[world.playerPosition.x,world.playerPosition.y,world.playerPosition.z].map(v=>Math.round(v*10)/10) as [number,number,number],view:world.cameraMode,painting:!!world.paintWorkspace?.active,surface:world.paintWorkspace?.selection?.wall.surfaceId,viewport:[renderer.domElement.clientWidth,renderer.domElement.clientHeight],pixelRatio:renderer.getPixelRatio(),horizon:world.scene.userData.cityHorizonStats?{...world.scene.userData.cityHorizonStats}:undefined});
  let endRecording=()=>{};
  const configure=()=>{
    endRecording();if(!log.active)return;
    let pending:number|null=null,idle=false;
    const cancelCheckpoint=()=>{if(pending!==null){if(idle)window.cancelIdleCallback(pending);else window.clearTimeout(pending);pending=null;}};
    const checkpoint=()=>{pending=null;if(log.active)log.checkpoint();};
    const scheduleCheckpoint=()=>{if(pending!==null||performance.now()-log.lastCheckpointAt<log.checkpointIntervalMs)return;
      idle=typeof window.requestIdleCallback==='function';pending=idle?window.requestIdleCallback(checkpoint,{timeout:1000}):window.setTimeout(checkpoint,0);
    };
    const tick=()=>{if(!log.active||document.hidden)return;const start=performance.now();log.advancePhase(start);log.sample(start,context());log.recordOverhead('sampleCollection',performance.now()-start);scheduleCheckpoint();};
    const timer=window.setInterval(tick,500);
    const flush=(message:string)=>{log.event(message);cancelCheckpoint();log.sample(performance.now(),context());log.checkpoint();};
    const error=(event:ErrorEvent)=>flush('Error: '+event.message);
    const rejected=(event:PromiseRejectionEvent)=>flush('Rejected: '+String(event.reason));
    const lost=()=>flush('WebGL context lost');const restored=()=>flush('WebGL context restored');
    const visibility=()=>{if(document.hidden){log.frame(performance.now(),log.latest??{calls:0,triangles:0,textures:0,geometries:0,chunks:0,queued:0,cpuMs:0},true);flush('Page hidden; checkpoint saved');}else log.event('Page visible again');};
    const pagehide=()=>flush('Page closed or navigated; checkpoint saved');
    window.addEventListener('pagehide',pagehide);window.addEventListener('error',error);window.addEventListener('unhandledrejection',rejected);document.addEventListener('visibilitychange',visibility);
    renderer.domElement.addEventListener('webglcontextlost',lost);renderer.domElement.addEventListener('webglcontextrestored',restored);
    const unsubscribeSettings=subscribeRenderSettings(()=>{const start=performance.now();log.settingsChanged(getRenderSettings(),start);log.recordOverhead('settingsCollection',performance.now()-start);});
    let observer:PerformanceObserver|undefined;
    try{const supported=PerformanceObserver.supportedEntryTypes,entryTypes=['longtask','resource'].filter(t=>supported.includes(t));
      if(entryTypes.length){observer=new PerformanceObserver(list=>{for(const e of list.getEntries()){
        if(e.entryType==='longtask')log.event('Long task: '+Math.round(e.duration)+' ms',e.startTime+e.duration);
        else if(/artwork|\.(gltf|glb|png|jpg|jpeg|webp)(\?|$)/i.test(e.name)){
          try{const url=new URL(e.name);log.cost('asset.requestElapsed',e.duration,(url.hostname+url.pathname).slice(0,160),e.startTime+e.duration);}catch{/* Ignore invalid resource names. */}
        }
      }});observer.observe({entryTypes});}
    }catch{/* Unsupported WebView performance entries are optional. */}
    endRecording=()=>{window.clearInterval(timer);cancelCheckpoint();observer?.disconnect();unsubscribeSettings();window.removeEventListener('pagehide',pagehide);window.removeEventListener('error',error);window.removeEventListener('unhandledrejection',rejected);document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.domElement.removeEventListener('webglcontextrestored',restored);};
    tick();
  };
  const unsubscribe=log.subscribe(configure);configure();
  return()=>{if(log.active)log.stop(performance.now(),'interrupted');endRecording();unsubscribe();renderer.render=original;log.describeEnvironment=previousEnvironment;};
}
