import type { BasketballGesture } from './basketballPhysics';

export interface BasketballScreenPoint {x:number;y:number}
interface MotionSample extends BasketballScreenPoint {at:number}

/** Preparation is free movement. Only the last upward stroke and recent velocity launch. */
export class BasketballFlickTracker {
  private samples: MotionSample[];
  private lastMotionAt = -Infinity;
  private strokeX = 0;
  private strokeY = 0;
  private readonly shortEdge:number;
  constructor(point:BasketballScreenPoint,at:number,private width:number,private height:number) {
    this.samples=[{...point,at}];this.shortEdge=Math.min(width,height);
  }
  move(point:BasketballScreenPoint,at:number):void {
    const previous=this.samples[this.samples.length-1];
    const dx=(point.x-previous.x)*this.width,dy=(previous.y-point.y)*this.height;
    if(Math.hypot(dx,dy)>.01) {
      if(at-this.lastMotionAt>80) {
        this.strokeX=0;this.strokeY=0;
        // A pause is preparation, not part of the next flick. Keep its stationary endpoint.
        this.samples=[{...previous,at:Math.max(previous.at,at-80)}];
      }
      this.lastMotionAt=at;
      if(dy>0 && dy>Math.abs(dx)) {this.strokeX+=dx;this.strokeY+=dy;}
      else {this.strokeX=0;this.strokeY=0;this.samples=[];}
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
  release(point:BasketballScreenPoint,at:number):BasketballGesture|null {
    this.move(point,at);
    const gesture=this.preview(at);
    if(!gesture || this.strokeY<this.shortEdge*.25 || this.strokeY<=Math.abs(this.strokeX) || gesture.dy<=Math.abs(gesture.dx))return null;
    return gesture;
  }
}
