import test from 'node:test';
import assert from 'node:assert/strict';
import { BasketballFlickTracker } from '../src/game/basketballGesture';

function stroke(tracker: BasketballFlickTracker, start = 1000) {
  tracker.move({x:.5,y:.8},start);
  tracker.move({x:.5,y:.72},start+50);
  tracker.move({x:.5,y:.64},start+100);
  tracker.move({x:.5,y:.56},start+150);
  return tracker.release({x:.5,y:.56},start+160);
}
test('final flick uses recent velocity after arbitrary preparation and holding',()=>{
  const fresh=new BasketballFlickTracker({x:.5,y:.8},1000,384,606);
  const prepared=new BasketballFlickTracker({x:.4,y:.6},0,384,606);
  prepared.move({x:.5,y:.8},500);prepared.move({x:.5,y:.8},900);
  const a=stroke(fresh),b=stroke(prepared);
  assert.ok(a);assert.deepEqual(a,b);
  assert.ok(a.dy>0 && a.durationMs<=140);
});
test('moving to a static position then lifting cannot shoot',()=>{
  const tracker=new BasketballFlickTracker({x:.5,y:.8},0,384,606);
  tracker.move({x:.5,y:.5},100);
  assert.equal(tracker.release({x:.5,y:.5},300),null);
});
test('tap, small movement, sideways or downward release cannot shoot',()=>{
  for(const end of [{x:.5,y:.8},{x:.5,y:.77},{x:.9,y:.75},{x:.5,y:.95}]) {
    const tracker=new BasketballFlickTracker({x:.5,y:.8},0,384,606);
    tracker.move(end,100);assert.equal(tracker.release(end,110),null);
  }
});
test('direction reversal resets the final upward stroke requirement',()=>{
  const tracker=new BasketballFlickTracker({x:.5,y:.8},0,384,606);
  tracker.move({x:.5,y:.4},80);tracker.move({x:.5,y:.7},120);
  tracker.move({x:.5,y:.66},160);
  assert.equal(tracker.release({x:.5,y:.66},170),null);
});
test('a large gradual final flick retains usable uncapped velocity',()=>{
  const tracker=new BasketballFlickTracker({x:.5,y:.8},0,384,606);
  for(let i=1;i<=6;i++)tracker.move({x:.5,y:.8-i*25/606},i*50);
  const gesture=tracker.release({x:.5,y:.8-150/606},300);
  assert.ok(gesture);assert.ok(Math.abs(gesture.dy/(gesture.durationMs/1000)*4-500/(384*.65)*4)<1e-8);
});
test('high-speed bounding preserves diagonal release direction and capped power',()=>{
  const tracker=new BasketballFlickTracker({x:.2,y:.9},0,384,606);
  // Maintain real continuous movement, so this is a final flick rather than a gap.
  for(let i=1;i<=7;i++)tracker.move({x:.2+i*150/7/384,y:.9-i*300/7/606},i*20);
  const gesture=tracker.release({x:.2+150/384,y:.9-300/606},140);
  assert.ok(gesture);assert.ok(Math.abs(Math.atan2(gesture.dx,gesture.dy)-Math.atan2(150,300))<1e-10);
  assert.equal(Math.min(9.1,gesture.dy/(gesture.durationMs/1000)*4),9.1);
});
test('a stationary preparation gap requires a fresh full upward flick',()=>{
  const tracker=new BasketballFlickTracker({x:.5,y:.9},0,384,606);
  tracker.move({x:.5,y:.9-150/606},50);
  tracker.move({x:.5,y:.9-150/606},2050);
  tracker.move({x:.5,y:.9-170/606},2100);
  assert.equal(tracker.release({x:.5,y:.9-170/606},2100),null,'old preparation cannot qualify a tiny release');
  const full=new BasketballFlickTracker({x:.5,y:.9},0,384,606);
  full.move({x:.5,y:.9-150/606},50);
  full.move({x:.5,y:.9-150/606},2050);
  for(let i=1;i<=6;i++)full.move({x:.5,y:.9-(150+i*25)/606},2050+i*50);
  assert.ok(full.release({x:.5,y:.9-300/606},2350),'a fresh deliberate flick after the hold launches');
});
