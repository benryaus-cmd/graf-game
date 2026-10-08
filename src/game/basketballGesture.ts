import type { BasketballGesture } from './basketballPhysics';

export interface BasketballScreenPoint {x:number;y:number}
interface MotionSample extends BasketballScreenPoint {at:number}

/** Preparation is free movement; normal release always throws using recent velocity. */
export class BasketballFlickTracker {
  private samples: MotionSample[];
  private lastMotionAt = -Infinity;
  private readonly shortEdge:number;
  constructor(point:BasketballScreenPoint,at:number,private width:number,private height:number) {
    this.samples=[{...point,at}];this.shortEdge=Math.min(width,height);
  }
  move(point:BasketballScreenPoint,at:number):void {
    const previous=this.samples[this.samples.length-1];
    const dx=(point.x-previous.x)*this.width,dy=(previous.y-point.y)*this.height;
    if(Math.hypot(dx,dy)>.01) {
      if(at-this.lastMotionAt>80) {
        // A pause is preparation, not part of the next flick. Keep its stationary endpoint.
        this.samples=[{...previous,at:Math.max(previous.at,at-80)}];
      }
      this.lastMotionAt=at;
      // Forget earlier preparation when the gesture changes away from an upward flick.
      if(dy<=0 || dy<=Math.abs(dx))this.samples=[{...point,at}];
    }
    this.samples.push({...point,at});
    // Retain one sample preceding the velocity window for boundary interpolation.
    while(this.samples.length>2 && this.samples[1].at<at-140)this.samples.shift();
  }
  preview(at:number):BasketballGesture|null {
    if(at-this.lastMotionAt>80)return null;
    const end=this.samples[this.samples.length-1],cutoff=at-140;
    let start=this.samples[0];
    for(let i=1;i<this.samples.length;i++) {
      const next=this.samples[i];
      if(next.at>=cutoff) {
        if(start.at<cutoff && next.at>start.at) {
          const ratio=(cutoff-start.at)/(next.at-start.at);
          start={x:start.x+(next.x-start.x)*ratio,y:start.y+(next.y-start.y)*ratio,at:cutoff};
        }
        break;
      }
      start=next;
    }
    const scale=this.shortEdge*.65;
    const rawDx=(end.x-start.x)*this.width/scale,rawDy=Math.max(0,(start.y-end.y)*this.height/scale);
    const bound=Math.max(1,Math.abs(rawDx),rawDy);
    return {dx:rawDx/bound,dy:rawDy/bound,durationMs:Math.max(40,at-start.at)};
  }
  release(point:BasketballScreenPoint,at:number):BasketballGesture {
    this.move(point,at);
    return this.preview(at) ?? {dx:0,dy:0,durationMs:140};
  }
}
