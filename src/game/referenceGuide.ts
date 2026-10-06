import * as THREE from 'three';
import type { PaintWorkspaceSelection, WorldEngine } from './worldTypes';
import { PAINT_WORKSPACE_LAYER } from './paintWorkspace';
import { elementPointerPoint } from './pointerCoordinates';

export interface ReferenceSettings { url: string; name: string; visible: boolean; moving: boolean; opacity: number; scale: number; x: number; y: number; rotation: number }
export function referenceFit(imageWidth: number, imageHeight: number, width: number, height: number) {
  const scale = Math.min(width / Math.max(1, imageWidth), height / Math.max(1, imageHeight));
  return { width: imageWidth * scale, height: imageHeight * scale };
}

/** Local presentation mesh. It has no paint contexts, persistence or multiplayer actions. */
export class ReferenceGuide {
  private mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  private settings: ReferenceSettings | null = null;
  private source = '';
  private generation = 0;
  private aspect = { width: 1, height: 1 };
  constructor(private world: WorldEngine) {
    this.mesh.visible = false;
    this.mesh.layers.enable(PAINT_WORKSPACE_LAYER);
    this.mesh.raycast = () => {}; // A guide cannot be selected as artwork or block a paint hit.
    this.world.scene.add(this.mesh);
  }
  set(settings: ReferenceSettings | null): void {
    this.settings = settings;
    if ((settings?.url ?? '') !== this.source) {
      this.source = settings?.url ?? '';
      const generation = ++this.generation;
      this.mesh.material.map?.dispose(); this.mesh.material.map = null;
      this.mesh.material.needsUpdate = true;
      if (settings?.url) {
        const image = new Image();
        image.onload = () => {
          if (generation !== this.generation) return;
          this.aspect = { width: image.naturalWidth, height: image.naturalHeight };
          const texture = new THREE.Texture(image);
          texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
          this.mesh.material.map = texture; this.mesh.material.needsUpdate = true;
          this.refresh();
        };
        image.src = settings.url;
      }
    }
    this.refresh();
  }
  refresh(): void {
    const s = this.settings, selection = this.world.paintWorkspace?.selection;
    this.mesh.visible = !!(s?.visible && selection && this.mesh.material.map);
    if (!s || !selection) return;
    const right = new THREE.Vector3().crossVectors(selection.up, selection.normal).normalize();
    const fit = referenceFit(this.aspect.width, this.aspect.height, selection.width, selection.height);
    this.mesh.position.copy(selection.center).addScaledVector(right, s.x * selection.width).addScaledVector(selection.up, s.y * selection.height).addScaledVector(selection.normal, .04);
    this.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, selection.up, selection.normal));
    this.mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s.rotation * Math.PI / 180));
    this.mesh.scale.set(fit.width * s.scale, fit.height * s.scale, 1);
    this.mesh.material.opacity = s.opacity;
    this.mesh.updateMatrixWorld();
  }
  point(event: { clientX: number; clientY: number }, element: HTMLElement): THREE.Vector2 | null {
    const selection: PaintWorkspaceSelection | null | undefined = this.world.paintWorkspace?.selection;
    if (!selection) return null;
    const point = elementPointerPoint(element, event);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(point.x * 2 - 1, 1 - point.y * 2), this.world.paintWorkspace?.active ? this.world.paintWorkspace.camera : this.world.cameraMode === 'map' ? this.world.mapCamera : this.world.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(selection.normal, selection.center), new THREE.Vector3());
    if (!hit) return null;
    const delta = hit.sub(selection.center), right = new THREE.Vector3().crossVectors(selection.up, selection.normal).normalize();
    return new THREE.Vector2(delta.dot(right) / selection.width, delta.dot(selection.up) / selection.height);
  }
  dispose(): void {
    ++this.generation;
    this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.map?.dispose(); this.mesh.material.dispose();
  }
}
