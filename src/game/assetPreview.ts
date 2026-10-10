import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetPreviewPreference } from '@/game/assetPreviewPreference';
import { getCharacterModel, normalizeCharacterModelId, type CharacterModelId } from './characterCatalog';
import { CharacterModelPool, type CharacterModelLease } from './characterModelPool';
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
const characterModels = new CharacterModelPool(loadModel, release);
export interface CharacterModelState { model: CharacterModelId; phase: 'loading' | 'ready' | 'error' }
export function updateAssetPreviewAvatar(avatar: THREE.Group, delta: number, walking: boolean, airborne: boolean): void {
  controllers.get(avatar)?.animate(delta, walking, airborne);
}

export class AssetPreview {
  onModelState?: (state: CharacterModelState) => void;
  private readonly base = new THREE.Group();
  private character: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentAction = '';
  private closed = false;
  private request: AbortController | null = null;
  private requestModel: CharacterModelId = 'original';
  private pending: Promise<void> | null = null;
  private currentModel: CharacterModelId = 'original';
  private characterLease: CharacterModelLease | null = null;

  constructor(private readonly scene: THREE.Scene, private readonly avatar: THREE.Group, private readonly load: Load = loadModel) {
    this.base.name = 'existing-avatar';
    this.base.add(...avatar.children); avatar.add(this.base);
    // Never show the retired original character between GLB loads.
    this.base.visible = false;
    controllers.set(avatar, this);
  }

  async configure(preference: { model: CharacterModelId; building?: boolean } | AssetPreviewPreference): Promise<void> {
    if (this.closed) return;
    const wanted = normalizeCharacterModelId(preference.model);
    if (this.request && this.requestModel === wanted) { await this.pending; return; }
    if (this.character && this.currentModel === wanted && !this.request) return;
    this.request?.abort(); this.request = null;
    // Keep the previous real model visible until the new one is ready.
    const controller = new AbortController();
    this.request = controller; this.requestModel = wanted;
    this.onModelState?.({ model: wanted, phase: 'loading' });
    this.pending = this.requestCharacter(wanted, controller);
    await this.pending;
  }

  private async requestCharacter(id: CharacterModelId, controller: AbortController): Promise<void> {
    let lease: CharacterModelLease | undefined;
    try {
      const definition = getCharacterModel(id);
      if (!definition.url) throw Error('Character model unavailable');
      if (this.load === loadModel) lease = await characterModels.acquire(definition.url, controller.signal);
      else {
        const model = await this.load(definition.url, controller.signal);
        lease = { model, release: () => release(model.scene) };
      }
      if (this.closed || controller.signal.aborted || this.request !== controller) { lease.release(); return; }
      const model = lease.model;
      fit(model.scene, 'y', 1.9); model.scene.name = `quaternius-${id}`;
      this.clearCharacter();
      this.characterLease = lease; this.currentModel = id;
      this.character = model.scene; this.avatar.add(model.scene);
      this.mixer = new THREE.AnimationMixer(model.scene);
      model.animations.forEach(clip => this.actions.set(clip.name, this.mixer!.clipAction(clip)));
      this.base.visible = false;
      this.animate(0, false, false);
      this.onModelState?.({ model: id, phase: 'ready' });
    } catch {
      if (this.characterLease === lease) this.clearCharacter();
      else lease?.release();
      if (!this.closed && !controller.signal.aborted && this.request === controller) {
        this.onModelState?.({ model: id, phase: 'error' });
      }
    } finally {
      if (this.request === controller) { this.request = null; this.pending = null; }
    }
  }

  private clearCharacter() {
    this.mixer?.stopAllAction();
    if (this.character) this.mixer?.uncacheRoot(this.character);
    this.characterLease?.release();
    this.characterLease = null; this.character = null; this.mixer = null;
    this.actions.clear(); this.currentAction = ''; this.currentModel = 'original';
    this.base.visible = false;
  }

  animate(delta: number, walking: boolean, airborne: boolean): void {
    if (!this.character?.visible || !this.avatar.visible || !this.mixer) return;
    const emote = this.avatar.userData.activeEmote as { name: string; elapsed: number } | null;
    const clips = getCharacterModel(this.currentModel).animations ?? { idle: 'Idle', walk: 'Walk', jump: 'Jump', wave: 'Wave' };
    const wanted = emote?.name === 'joy' && clips.wave ? clips.wave : airborne && clips.jump ? clips.jump : walking && !airborne ? clips.walk : clips.idle;
    const name = this.actions.has(wanted) ? wanted : this.actions.has(clips.idle) ? clips.idle : this.actions.keys().next().value ?? '';
    if (name !== this.currentAction) {
      const next = this.actions.get(name), previous = this.actions.get(this.currentAction);
      if (next) { next.reset().play(); if (previous) next.crossFadeFrom(previous, 0.15, false); }
      this.currentAction = name;
    }
    this.mixer.update(Math.min(Math.max(delta, 0), 0.05));
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true; this.request?.abort(); this.request = null;
    this.clearCharacter();
    this.avatar.add(...this.base.children); this.base.removeFromParent(); controllers.delete(this.avatar);
  }
}
