import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetPreviewPreference } from '@/game/assetPreviewPreference';

// Pinned models are hosted separately: Aippy's single-file HTML must not embed GLB bytes.
const ASSET_BASE = 'https://raw.githubusercontent.com/benryaus-cmd/graf-game/77b8bb73af715da9dbd691dbddae109316e394fd/public/assets/preview/';
export type Model = { scene: THREE.Group; animations: THREE.AnimationClip[] };
type Load = (url: string, signal: AbortSignal) => Promise<Model>;
export async function loadModel(url: string, signal: AbortSignal): Promise<Model> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Asset HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  return new GLTFLoader().parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1));
}
export function release(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
    }
    if (object instanceof THREE.SkinnedMesh && object.skeleton.boneTexture) textures.add(object.skeleton.boneTexture);
  });
  const images = new Set<{ close: () => void }>();
  textures.forEach(texture => {
    const image = texture.source?.data;
    if (image && typeof image.close === 'function') images.add(image);
    texture.dispose();
  });
  images.forEach(image => image.close());
  materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
  root.removeFromParent();
}
function fit(root: THREE.Group, dimension: 'x' | 'y', size: number): void {
  const bounds = new THREE.Box3().setFromObject(root), extent = bounds.getSize(new THREE.Vector3())[dimension];
  if (!Number.isFinite(extent) || extent <= 0) throw new Error('Empty preview model');
  root.scale.multiplyScalar(size / extent);
  const scaled = new THREE.Box3().setFromObject(root), center = scaled.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(center.x, scaled.min.y, center.z));
}
const controllers = new WeakMap<THREE.Group, AssetPreview>();
export function updateAssetPreviewAvatar(avatar: THREE.Group, delta: number, walking: boolean, airborne: boolean): void {
  controllers.get(avatar)?.animate(delta, walking, airborne);
}

export class AssetPreview {
  private readonly base = new THREE.Group();
  private character: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentAction = '';
  private closed = false;
  private requests = { character: null as AbortController | null };
  private wanted: AssetPreviewPreference = { model: 'original', building: false };

  constructor(private readonly scene: THREE.Scene, private readonly avatar: THREE.Group, private readonly load: Load = loadModel) {
    this.base.name = 'existing-avatar';
    this.base.add(...avatar.children); avatar.add(this.base);
    controllers.set(avatar, this);
  }

  async configure(preference: AssetPreviewPreference): Promise<void> {
    if (this.closed) return;
    this.wanted = preference;
    if (preference.model === 'original') {
      this.requests.character?.abort(); this.requests.character = null;
      this.base.visible = true;
      if (this.character) this.character.visible = false;
    } else if (this.character) { this.character.visible = true; this.base.visible = false; }
    if (preference.model === 'hoodie' && !this.character && !this.requests.character) await this.request('character');
  }

  private async request(kind: 'character'): Promise<void> {
    const controller = new AbortController(); this.requests[kind] = controller;
    let model: Model | undefined;
    try {
      model = await this.load(`${ASSET_BASE}male-hoodie.glb`, controller.signal);
      if (this.closed || controller.signal.aborted || this.requests[kind] !== controller) { release(model.scene); return; }
      fit(model.scene, 'y', 1.9); model.scene.name = 'quaternius-hoodie';
      this.character = model.scene; this.avatar.add(model.scene);
      this.mixer = new THREE.AnimationMixer(model.scene);
      model.animations.forEach(clip => this.actions.set(clip.name, this.mixer!.clipAction(clip)));
      this.base.visible = this.wanted.model !== 'hoodie'; model.scene.visible = !this.base.visible;
      this.animate(0, false, false);
    } catch {
      if (model) release(model.scene);
      // Optional visuals must never block the city, player movement or painting.
    } finally { if (this.requests[kind] === controller) this.requests[kind] = null; }
  }

  animate(delta: number, walking: boolean, airborne: boolean): void {
    if (!this.character?.visible || !this.avatar.visible || !this.mixer) return;
    const emote = this.avatar.userData.activeEmote as { name: string; elapsed: number } | null;
    const name = emote?.name === 'joy' ? 'Wave' : walking && !airborne ? 'Walk' : 'Idle';
    if (name !== this.currentAction) {
      const next = this.actions.get(name), previous = this.actions.get(this.currentAction);
      if (next) { next.reset().play(); if (previous) next.crossFadeFrom(previous, 0.15, false); }
      this.currentAction = name;
    }
    this.mixer.update(Math.min(Math.max(delta, 0), 0.05));
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true; Object.values(this.requests).forEach(request => request?.abort());
    this.mixer?.stopAllAction(); if (this.character) { this.mixer?.uncacheRoot(this.character); release(this.character); }
    this.avatar.add(...this.base.children); this.base.removeFromParent(); controllers.delete(this.avatar);
  }
}
