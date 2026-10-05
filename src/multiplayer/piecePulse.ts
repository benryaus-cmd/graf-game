import * as THREE from 'three';
import type { PieceBounds } from './pieceSync';

/** Brief world-space outline so VIEW gives a visible target without changing paint data. */
export function pulsePieceBounds(scene: THREE.Scene, bounds: PieceBounds, duration = 2600): () => void {
  const box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
  const helper = new THREE.Box3Helper(box, '#ffe16b');
  helper.renderOrder = 1000;
  const material = helper.material as THREE.LineBasicMaterial;
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  scene.add(helper);

  let frame = 0;
  let stopped = false;
  const start = performance.now();
  const animate = (time: number) => {
    if (stopped) return;
    const elapsed = time - start;
    material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsed / 150));
    if (elapsed >= duration) { stop(); return; }
    frame = requestAnimationFrame(animate);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    scene.remove(helper);
    helper.geometry.dispose();
    material.dispose();
  };
  frame = requestAnimationFrame(animate);
  return stop;
}
