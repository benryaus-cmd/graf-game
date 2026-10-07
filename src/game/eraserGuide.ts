import * as THREE from 'three';
import { PAINT_WORKSPACE_LAYER } from '@/game/paintWorkspace';
import { WORKSPACE_EDGE_ORDER } from '@/game/worldOverlayOrder';

export class EraserGuide {
  private enabled = false;
  private readonly circle: THREE.LineLoop;
  private readonly normal = new THREE.Vector3();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly hide = () => { this.circle.visible = false; };
  constructor(scene: THREE.Scene, private readonly target: EventTarget) {
    const points = Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 32), Math.sin(i * Math.PI / 32), 0));
    this.circle = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false, toneMapped: false }));
    this.circle.name = 'eraser-outline'; this.circle.visible = false;
    this.circle.renderOrder = WORKSPACE_EDGE_ORDER + 1;
    this.circle.layers.enable(PAINT_WORKSPACE_LAYER);
    scene.add(this.circle);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) target.addEventListener(event, this.hide);
  }
  setEnabled(enabled: boolean): void { this.enabled = enabled; if (!enabled) this.hide(); }
  show(hit: THREE.Intersection, radius: number): void {
    if (!this.enabled || !hit.face || !Number.isFinite(radius) || radius <= 0) return;
    this.normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    this.normal.copy(hit.face.normal).applyNormalMatrix(this.normalMatrix);
    this.circle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.normal);
    this.circle.position.copy(hit.point); this.circle.scale.setScalar(radius); this.circle.visible = true;
  }
  dispose(): void {
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) this.target.removeEventListener(event, this.hide);
    this.circle.removeFromParent(); this.circle.geometry.dispose(); (this.circle.material as THREE.Material).dispose();
  }
}
