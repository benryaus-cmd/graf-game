import * as THREE from 'three';
import { addPosterOverlay } from '../game/posterOverlay';
import type { PaintWall, PosterArtwork } from '../game/worldTypes';
import { decodeSurface, encodeSurface } from './surfaces';
import type { Message } from './protocol';
import { ArtworkUpload } from './artworkUpload';
import { artworkAssetRef } from './artworkAssets';

interface SharedArtwork extends PosterArtwork { id: string; surfaceId: string; face: string; assetRef: string; sequence?: number }
export function readArtwork(value: unknown): SharedArtwork | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const id = v.id ?? v.artworkId, assetRef = artworkAssetRef(v.assetRef);
  const tuple = (value: unknown, size: number): value is number[] => Array.isArray(value) && value.length === size && value.every(n => typeof n === 'number' && Number.isFinite(n));
  let quaternion = v.quaternion ?? v.rotation;
  if (tuple(quaternion, 3)) quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...quaternion as [number,number,number])).toArray();
  if (typeof id !== 'string' || !assetRef || typeof v.surfaceId !== 'string' || !decodeSurface(v.surfaceId) ||
      !tuple(v.position, 3) || !tuple(quaternion, 4) || !Number.isFinite(v.width) || !Number.isFinite(v.height) ||
      (v.width as number) <= 0 || (v.height as number) <= 0 || (v.width as number) > 100 || (v.height as number) > 100) return null;
  return { id, surfaceId: v.surfaceId, face: typeof v.face === 'string' ? v.face : String(decodeSurface(v.surfaceId)!.face),
    assetRef, image: assetRef, position: v.position as [number,number,number], quaternion: quaternion as [number,number,number,number],
    width: v.width as number, height: v.height as number, sequence: Number.isSafeInteger(v.sequence) ? v.sequence as number : undefined };
}

export class ArtworkSync {
  private records = new Map<string, SharedArtwork>();
  private local = new Map<string, SharedArtwork>();
  private mounted = new Map<string, { wall: PaintWall; mesh: THREE.Object3D }>();
  private loading = new Map<string, PaintWall>();
  private generation = 0;
  private session = 0;
  constructor(private send: (message: Message) => boolean, private notice: (text: string) => void,
    private image: () => HTMLImageElement = () => new Image(), private upload = new ArtworkUpload()) {}
  async placed(wall: PaintWall, face: number, artwork: PosterArtwork, share = true): Promise<void> {
    if (!wall.surfaceId) return;
    const id = crypto.randomUUID(), session = this.session;
    const record: SharedArtwork = { ...artwork, id, assetRef: artwork.image, surfaceId: encodeSurface(wall.surfaceId, face, 0), face: String(face) };
    this.records.set(id, record); this.local.set(id, record);
    // The existing placement has already drawn it. Keep its mesh instead of drawing the server echo.
    const parent = wall.layers[0]?.mesh ?? wall.mesh;
    const mesh = [...parent.children].reverse().find(child => child.userData.posterArtwork && ![...this.mounted.values()].some(m => m.mesh === child));
    if (mesh) this.mounted.set(id, { wall, mesh });
    this.applyOrder();
    if (!share) { this.notice('Poster placed locally. Reconnect before placing a shared poster.'); return; }
    let assetRef: string;
    try { assetRef = await this.upload.assetRef(artwork.image); }
    catch (error) {
      if (session === this.session) this.notice((error instanceof Error ? error.message : 'Poster upload failed.') + ' The poster remains local.');
      return;
    }
    // Never publish under a new connection identity after a disconnect or room change.
    if (session !== this.session) return;
    Object.assign(record, { assetRef, image: assetRef });
    this.records.set(id, record); this.local.set(id, record);
    if (!this.send({ type: 'artwork_place', actionId: crypto.randomUUID(), artworkId: id, assetRef,
      surfaceId: record.surfaceId, face: record.face, position: record.position,
      rotation: record.quaternion, width: record.width, height: record.height })) this.notice('Poster placed locally; it could not be shared while disconnected.');
  }
  snapshot(values: unknown[]): void {
    this.generation++; this.loading.clear(); this.records.clear();
    for (const value of values) { const record = readArtwork(value); if (record) this.records.set(record.id, record); }
    for (const [id, record] of this.local) if (!this.records.has(id)) this.records.set(id, record);
    for (const id of [...this.mounted.keys()]) if (!this.records.has(id)) this.remove(id);
    this.applyOrder();
  }
  accept(message: Message): void {
    const record = readArtwork(message.artwork ?? message);
    if (!record) return;
    const existing = this.records.get(record.id);
    if (existing) Object.assign(existing, record);
    else this.records.set(record.id, record);
    const local = this.local.get(record.id); if (local) Object.assign(local, record);
    this.applyOrder();
  }
  refresh(walls: Map<string, PaintWall>): void {
    for (const [id, mounted] of this.mounted) if (walls.get(mounted.wall.surfaceId!) !== mounted.wall) this.remove(id);
    for (const [id, wall] of this.loading) if (walls.get(wall.surfaceId!) !== wall) this.loading.delete(id);
    for (const record of [...this.records.values()].sort((a,b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity))) {
      const surface = decodeSurface(record.surfaceId)!; const wall = walls.get(surface.wallId);
      if (!wall || this.mounted.has(record.id) || this.loading.has(record.id)) continue;
      const generation = this.generation; const image = this.image(); this.loading.set(record.id, wall);
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        if (generation !== this.generation || this.loading.get(record.id) !== wall) return;
        this.loading.delete(record.id);
        addPosterOverlay(wall, record, image);
        const parent = wall.layers[0]?.mesh ?? wall.mesh;
        const mesh = parent.children[parent.children.length - 1];
        if (mesh) this.mounted.set(record.id, { wall, mesh });
        this.applyOrder();
      };
      image.onerror = () => {
        if (generation !== this.generation || this.loading.get(record.id) !== wall) return;
        // Keep the failed load marked so the frame loop does not repeatedly retry it. Resync retries.
        this.notice('A shared poster image could not be loaded. Use Resync to retry.');
      };
      image.src = record.assetRef;
    }
  }
  clear(): void {
    this.generation++; this.session++; this.loading.clear();
    for (const id of [...this.mounted.keys()]) this.remove(id);
    this.records.clear(); this.local.clear();
  }
  interrupted(): void { this.session++; }
  private remove(id: string): void {
    const mounted = this.mounted.get(id); if (!mounted) return;
    mounted.mesh.removeFromParent();
    if (mounted.mesh instanceof THREE.Mesh) {
      mounted.mesh.geometry.dispose();
      for (const material of Array.isArray(mounted.mesh.material) ? mounted.mesh.material : [mounted.mesh.material]) {
        if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose(); material.dispose();
      }
    }
    this.mounted.delete(id);
  }
  private applyOrder(): void {
    for (const [id, mounted] of this.mounted) mounted.mesh.renderOrder = 90 + (this.records.get(id)?.sequence ?? 1_000_000_000);
  }
}
