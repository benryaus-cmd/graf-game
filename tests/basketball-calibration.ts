import type { BasketballGesture } from '../src/game/basketballPhysics';

/** Test fixture only: invert the release curve to exercise known physical speeds. */
export function flickDy(speed:number,durationMs=140):number {
  return 1.57*Math.pow(-Math.log(1-speed/8.1),2/3)*durationMs/1000;
}
export function flick(speed:number):BasketballGesture {return {dx:0,dy:flickDy(speed),durationMs:140};}
