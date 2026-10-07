import * as THREE from 'three';
import type { PieceBounds } from './pieceSync';

/** A temporary through-wall art overlay. Only the overlay's resources are owned here. */
export function pulsePieceBounds(
  scene: THREE.Scene,
  bounds: PieceBounds,
  duration = 3400,
  getSources?: () => THREE.Object3D[],
  renderer?: Pick<THREE.WebGLRenderer, 'localClippingEnabled'>,
): () => void {
  const box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max));
  const helper = new THREE.Box3Helper(box, '#ffe16b');
  helper.renderOrder = 1e9 + 1000000;
  const material = helper.material as THREE.LineBasicMaterial;
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  scene.add(helper);
  const previousClipping = renderer?.localClippingEnabled;
  if (renderer) renderer.localClippingEnabled = true;
  const planes = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -bounds.min[0]),
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), bounds.max[0]),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -bounds.min[1]),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), bounds.max[1]),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -bounds.min[2]),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), bounds.max[2]),
  ];
  const overlays: THREE.Mesh[] = [];
  const pulseMaterials: Array<{ material: THREE.Material; opacity: number }> = [];
  const populate = () => {
    if (!getSources || overlays.length) return;
    const seen = new Set<THREE.Object3D>();
    scene.updateWorldMatrix(true, false);
    const sceneInverse = scene.matrixWorld.clone().invert();
    for (const source of getSources()) source.traverse(object => {
      if (seen.has(object)) return;
      seen.add(object);
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!sourceMaterials.some(item => (item as THREE.MeshBasicMaterial).map)) return;
      const materials = sourceMaterials.map(item => {
        const clone = item.clone();
        clone.depthTest = false;
        clone.depthWrite = false;
        clone.transparent = true;
        clone.clippingPlanes = planes;
        clone.clipIntersection = false;
        pulseMaterials.push({ material: clone, opacity: item.opacity });
        return clone;
      });
      const overlay = new THREE.Mesh(mesh.geometry.clone(), Array.isArray(mesh.material) ? materials : materials[0]);
      mesh.updateWorldMatrix(true, false);
      overlay.matrixAutoUpdate = false;
      overlay.matrix.multiplyMatrices(sceneInverse, mesh.matrixWorld);
      overlay.renderOrder = 1e9 + overlays.length;
      overlay.frustumCulled = false;
      overlay.raycast = () => {};
      overlays.push(overlay);
      scene.add(overlay);
    });
  };

  let frame = 0;
  let stopped = false;
  const start = performance.now();
  const animate = (time: number) => {
    if (stopped) return;
    const elapsed = time - start;
    if (elapsed >= duration) { stop(); return; }
    populate();
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsed / 150));
    material.opacity = pulse;
    for (const entry of pulseMaterials) entry.material.opacity = entry.opacity * pulse;
    frame = requestAnimationFrame(animate);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    scene.remove(helper);
    helper.geometry.dispose();
    material.dispose();
    for (const overlay of overlays) {
      scene.remove(overlay);
      overlay.geometry.dispose();
    }
    // Material.dispose does not dispose map textures: those remain owned by the art.
    for (const entry of pulseMaterials) entry.material.dispose();
    if (renderer) renderer.localClippingEnabled = previousClipping!;
  };
  frame = requestAnimationFrame(animate);
  return stop;
}
