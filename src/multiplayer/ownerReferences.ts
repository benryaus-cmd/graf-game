import * as THREE from 'three';
import type { Message } from './protocol';
import { ArtworkUpload } from './artworkUpload';
import { artworkAssetRef } from './artworkAssets';
import { PAINT_WORKSPACE_LAYER } from '../game/paintWorkspace';
import { REFERENCE_ABOVE_ORDER } from '../game/worldOverlayOrder';

export interface OwnerReferenceDraft {
  referenceId?: string; url: string; name: string; surfaceId: string;
  position: [number, number, number]; quaternion: [number, number, number, number];
  width: number; height: number; opacity: number; aboveArt: boolean;
}
export interface OwnerReferenceRecord extends Omit<OwnerReferenceDraft, 'url' | 'referenceId'> {
  id: string; referenceId: string; assetRef: string; createdAt: number; updatedAt: number;
}
interface RenderedReference { record: OwnerReferenceRecord; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; image: HTMLImageElement; started: boolean; settled: boolean; timer: ReturnType<typeof setTimeout> | null }
const LIMIT = 50;
const tuple = (value: unknown, size: number): boolean => Array.isArray(value) && value.length === size && value.every(n => typeof n === 'number' && Number.isFinite(n));
function validPlacement(value: Record<string, unknown>): boolean {
  return typeof value.name === 'string' && typeof value.surfaceId === 'string' && !!value.surfaceId &&
    tuple(value.position, 3) && tuple(value.quaternion, 4) && (value.quaternion as number[]).some(n => n !== 0) &&
    typeof value.width === 'number' && Number.isFinite(value.width) && value.width > 0 &&
    typeof value.height === 'number' && Number.isFinite(value.height) && value.height > 0 &&
    typeof value.opacity === 'number' && Number.isFinite(value.opacity) && value.opacity >= .05 && value.opacity <= 1 && typeof value.aboveArt === 'boolean';
}
function readRecord(value: unknown): OwnerReferenceRecord | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>, id = v.referenceId ?? v.id, assetRef = artworkAssetRef(v.assetRef);
  if (typeof id !== 'string' || !id || !assetRef || !validPlacement(v) ||
    typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt) || typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt)) return null;
  return { id, referenceId: id, assetRef, name: v.name as string, surfaceId: v.surfaceId as string,
    position: [...v.position as number[]] as OwnerReferenceRecord['position'], quaternion: [...v.quaternion as number[]] as OwnerReferenceRecord['quaternion'],
    width: v.width as number, height: v.height as number, opacity: v.opacity as number, aboveArt: v.aboveArt as boolean,
    createdAt: v.createdAt, updatedAt: v.updatedAt };
}

/** Private owner presentation meshes. All persistence occurs only after explicit requests and server replies. */
export class OwnerReferences {
  private enabled = false;
  private generation = 0;
  private activeLoads = 0;
  private rendered = new Map<string, RenderedReference>();
  constructor(private scene: THREE.Scene, private send: (message: Message) => boolean,
    private changed: () => void, private uploader: Pick<ArtworkUpload, 'assetRef'> = new ArtworkUpload()) {}
  get records(): readonly OwnerReferenceRecord[] { return [...this.rendered.values()].map(value => value.record); }
  setAccess(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled; ++this.generation;
    if (!enabled) { this.clear(); this.changed(); }
  }
  snapshot(values: unknown[]): void {
    if (!this.enabled) return;
    this.clear();
    for (const value of Array.isArray(values) ? values : []) {
      const record = readRecord(value);
      if (record && (this.rendered.has(record.referenceId) || this.rendered.size < LIMIT)) this.mount(record);
    }
    this.changed();
  }
  accept(message: Message): void {
    if (!this.enabled) return;
    if (message.type === 'owner_reference_list') { this.snapshot(Array.isArray(message.references) ? message.references : []); return; }
    if (message.type === 'owner_reference_saved') {
      const record = readRecord(message.reference);
      if (!record || (!this.rendered.has(record.referenceId) && this.rendered.size >= LIMIT)) return;
      this.mount(record); this.changed();
    } else if (message.type === 'owner_reference_deleted' && typeof message.referenceId === 'string') {
      const prior = this.rendered.get(message.referenceId);
      if (prior) { this.destroy(prior); this.rendered.delete(message.referenceId); this.pump(); this.changed(); }
    }
  }
  list(): boolean { return this.enabled && this.send({ type: 'owner_reference_list' }); }
  remove(referenceId: string): boolean { return this.enabled && !!referenceId && this.send({ type: 'owner_reference_delete', referenceId }); }
  async save(draft: OwnerReferenceDraft): Promise<boolean> {
    const opacity = draft && Number.isFinite(draft.opacity) ? Math.max(.05, Math.min(1, draft.opacity)) : NaN;
    if (!this.enabled || !draft || typeof draft.url !== 'string' || !draft.url || !validPlacement({ ...draft, opacity } as unknown as Record<string, unknown>) ||
      (draft.referenceId !== undefined && (typeof draft.referenceId !== 'string' || !draft.referenceId)) || (!draft.referenceId && this.rendered.size >= LIMIT)) return false;
    const generation = this.generation;
    // Capture immutable placement before any decode/upload waits or caller edits.
    const placement = { name: draft.name, surfaceId: draft.surfaceId, position: [...draft.position], quaternion: [...draft.quaternion],
      width: draft.width, height: draft.height, opacity, aboveArt: draft.aboveArt, ...(draft.referenceId ? { referenceId: draft.referenceId } : {}) };
    try {
      // ArtworkUpload accepts arbitrary https sources as existing assets. Never give
      // it a local/external URL: convert to image data first so it uses the upload store.
      let source = draft.url;
      if (!source.startsWith('data:')) {
        const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) return false;
        const blob = await response.blob();
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || !blob.size || blob.size > 5 * 1024 * 1024) return false;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        source = `data:${blob.type};base64,${btoa(binary)}`;
      }
      if (!this.enabled || generation !== this.generation) return false;
      const assetRef = artworkAssetRef(await this.uploader.assetRef(source));
      if (!assetRef || !this.enabled || generation !== this.generation) return false;
      return this.send({ type: 'owner_reference_save', assetRef, ...placement });
    } catch { return false; }
  }
  dispose(): void { this.enabled = false; ++this.generation; this.clear(); }
  private mount(record: OwnerReferenceRecord): void {
    const prior = this.rendered.get(record.referenceId); if (prior) this.destroy(prior);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: true, toneMapped: false, side: THREE.DoubleSide, opacity: record.opacity });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.position.fromArray(record.position); mesh.quaternion.fromArray(record.quaternion); mesh.scale.set(record.width, record.height, 1);
    mesh.renderOrder = record.aboveArt ? REFERENCE_ABOVE_ORDER : 2;
    mesh.layers.enable(PAINT_WORKSPACE_LAYER); mesh.raycast = () => {}; mesh.visible = false;
    const image = new Image(); image.crossOrigin = 'anonymous';
    const entry: RenderedReference = { record, mesh, image, started: false, settled: false, timer: null }; this.rendered.set(record.referenceId, entry); this.scene.add(mesh);
    image.onload = () => {
      if (entry.settled || !this.enabled || this.rendered.get(record.referenceId) !== entry) return;
      const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
      material.map = texture; material.needsUpdate = true; mesh.visible = true;
      this.settle(entry);
    };
    image.onerror = () => { if (!entry.settled) this.settle(entry); };
    this.pump();
  }
  private destroy(entry: RenderedReference): void {
    if (entry.started && !entry.settled) this.activeLoads--;
    if (entry.timer !== null) clearTimeout(entry.timer); entry.timer = null;
    entry.settled = true;
    entry.image.onload = null; entry.image.onerror = null; entry.image.src = '';
    entry.mesh.removeFromParent(); entry.mesh.geometry.dispose(); entry.mesh.material.map?.dispose(); entry.mesh.material.dispose();
  }
  private settle(entry: RenderedReference): void {
    entry.settled = true; if (entry.started) this.activeLoads--;
    if (entry.timer !== null) clearTimeout(entry.timer); entry.timer = null;
    entry.image.onload = null; entry.image.onerror = null; this.pump();
  }
  private pump(): void {
    if (!this.enabled) return;
    for (const entry of this.rendered.values()) {
      if (this.activeLoads >= 7) break;
      if (entry.started || entry.settled) continue;
      entry.started = true; this.activeLoads++;
      entry.timer = setTimeout(() => { if (!entry.settled) { this.settle(entry); entry.image.src = ''; } }, 30_000);
      entry.image.src = entry.record.assetRef;
    }
  }
  private clear(): void { for (const entry of this.rendered.values()) this.destroy(entry); this.rendered.clear(); }
}
