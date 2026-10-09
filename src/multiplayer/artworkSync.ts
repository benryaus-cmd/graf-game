import * as THREE from 'three';
import { addPosterOverlay } from '../game/posterOverlay';
import type { PaintWall, PosterArtwork } from '../game/worldTypes';
import { decodeSurface, encodeSurface } from './surfaces';
import type { Message } from './protocol';
import { ArtworkUpload } from './artworkUpload';
import { artworkAssetRef } from './artworkAssets';

export interface SharedArtwork extends PosterArtwork { id: string; surfaceId: string; face: string; assetRef: string; sequence?: number; ownerPlayerId?: string; ownerUsername?: string; ownerNickName?: string }
interface PosterLoad { wall: PaintWall; image: HTMLImageElement; assetRef: string; token: object; timer: ReturnType<typeof setTimeout> }
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
    width: v.width as number, height: v.height as number, sequence: Number.isSafeInteger(v.sequence) ? v.sequence as number : undefined,
    ownerPlayerId: typeof v.ownerPlayerId === 'string' ? v.ownerPlayerId.slice(0,120) : undefined,
    ownerUsername: typeof v.ownerUsername === 'string' ? v.ownerUsername.replace(/^@/, '').trim().slice(0,40) : undefined,
    ownerNickName: typeof v.ownerNickName === 'string' ? v.ownerNickName.trim().slice(0,40) : undefined };
}

export class ArtworkSync {
  private static readonly MAX_CONCURRENT_IMAGE_LOADS = 7;
  private static readonly IMAGE_LOAD_TIMEOUT_MS = 20_000;
  private records = new Map<string, SharedArtwork>();
  private recordsByWall = new Map<string, SharedArtwork[]>();
  private local = new Map<string, SharedArtwork>();
  private mounted = new Map<string, { wall: PaintWall; mesh: THREE.Object3D }>();
  private loading = new Map<string, PosterLoad>();
  private failed = new Set<string>();
  private activeLoads = new Map<string, object>();
  private generation = 0;
  private session = 0;
  private loadingIndicatorVisible = false;
  constructor(private send: (message: Message) => boolean, private notice: (text: string) => void,
    private image: () => HTMLImageElement = () => new Image(), private upload = new ArtworkUpload(),
    private scheduleTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout> = (callback, ms) => setTimeout(callback, ms),
    private cancelTimeout: (timer: ReturnType<typeof setTimeout>) => void = timer => clearTimeout(timer)) {}
  async placed(wall: PaintWall, face: number, artwork: PosterArtwork, share = true): Promise<void> {
    if (!wall.surfaceId) return;
    const id = crypto.randomUUID(), session = this.session;
    const record: SharedArtwork = { ...artwork, id, assetRef: artwork.image, surfaceId: encodeSurface(wall.surfaceId, face, 0), face: String(face) };
    this.records.set(id, record); this.local.set(id, record); this.index(record);
    // The existing placement has already drawn it. Keep its mesh instead of drawing the server echo.
    const parent = wall.mesh;
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
  removeArtwork(id: string): void {
    const existing = this.records.get(id);
    if (existing) this.unindex(existing);

    this.cancelLoad(id);
    this.failed.delete(id);
    this.records.delete(id);
    this.local.delete(id);
    this.remove(id);
    this.updateLoadingIndicator();
  }

  snapshot(values: unknown[]): void {
    this.generation++; this.cancelAllLoads(); this.failed.clear(); this.records.clear(); this.recordsByWall.clear();
    for (const value of values) { const record = readArtwork(value); if (record) this.records.set(record.id, record); }
    for (const id of this.records.keys()) this.local.delete(id);
    for (const [id, record] of this.local) if (!this.records.has(id)) this.records.set(id, record);
    for (const record of this.records.values()) this.index(record, false);
    for (const records of this.recordsByWall.values()) records.sort((a, b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity));
    for (const id of [...this.mounted.keys()]) if (!this.records.has(id)) this.remove(id);
    this.applyOrder();
  }
  accept(message: Message): void {
    this.upsert([message.artwork ?? message]);
  }
  entries(): SharedArtwork[] { return [...this.records.values()]; }
  imageStats(){return {loading:this.loading.size,mounted:this.mounted.size,records:this.records.size};}
  meshFor(id: string): THREE.Object3D | null { return this.mounted.get(id)?.mesh ?? null; }
  unloadArtwork(id: string): void { if (!this.local.has(id)) this.removeArtwork(id); }
  upsert(values: readonly unknown[]): void {
    const affected = new Set<string>();
    for (const value of values) {
      const record = readArtwork(value); if (!record) continue;
      const existing = this.records.get(record.id);
      if (existing) {
        if (existing.assetRef !== record.assetRef || existing.surfaceId !== record.surfaceId || existing.width !== record.width || existing.height !== record.height || existing.position.some((v,i) => v !== record.position[i]) || existing.quaternion.some((v,i) => v !== record.quaternion[i])) {
          this.cancelLoad(existing.id); this.failed.delete(existing.id); this.remove(existing.id);
        }
        this.unindex(existing);
      }
      this.records.set(record.id, record); this.index(record, false); this.local.delete(record.id);
      const surface = decodeSurface(record.surfaceId); if (surface) affected.add(surface.wallId);
    }
    for (const id of affected) this.recordsByWall.get(id)?.sort((a,b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity));
    this.applyOrder();
  }
  refresh(walls: Map<string, PaintWall>, demand?: {canLoad:(wall:PaintWall,record:SharedArtwork)=>boolean;maxConcurrent:number}): void {
    const allowed=(wall:PaintWall,record:SharedArtwork)=>this.local.has(record.id)||!demand||demand.canLoad(wall,record);
    const maxConcurrent=Math.max(1,Math.min(7,Math.round(demand?.maxConcurrent??ArtworkSync.MAX_CONCURRENT_IMAGE_LOADS)));
    for(const[id,mounted]of this.mounted){const record=this.records.get(id);if(record)mounted.mesh.visible=allowed(mounted.wall,record);}
    for(const[id,load]of this.loading){const record=this.records.get(id);if(record&&!allowed(load.wall,record))this.cancelLoad(id,load);}
    for (const [id, mounted] of this.mounted) if (walls.get(mounted.wall.surfaceId!) !== mounted.wall) this.remove(id);
    for (const [id, load] of this.loading) if (walls.get(load.wall.surfaceId!) !== load.wall) this.cancelLoad(id, load);
    for (const [wallId, wall] of walls) {
      const records = this.recordsByWall.get(wallId);
      if (!records) continue;
      for (const record of records) {
        if (this.activeLoads.size >= maxConcurrent) return;
        if(!allowed(wall,record))continue;
        if (this.mounted.has(record.id) || this.loading.has(record.id) || this.failed.has(record.id)) continue;
        const generation = this.generation; const image = this.image(); const loadToken = {};
        image.decoding = 'async';
        const load = { wall, image, assetRef: record.assetRef, token: loadToken, timer: undefined as unknown as ReturnType<typeof setTimeout> };
        this.loading.set(record.id, load); this.activeLoads.set(record.id, loadToken);
        this.updateLoadingIndicator();
        const finish = () => {
          if (this.activeLoads.get(record.id) === loadToken) this.activeLoads.delete(record.id);
          this.cancelTimeout(load.timer);
          this.updateLoadingIndicator();
        };
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          finish();
          if (generation !== this.generation || this.loading.get(record.id) !== load) return;
          this.loading.delete(record.id);
          this.updateLoadingIndicator();
          const current = this.records.get(record.id);
          if (!current || current.assetRef !== load.assetRef) return;
          const mesh = addPosterOverlay(wall, current, image);
          this.mounted.set(record.id, { wall, mesh });
          this.applyOrder();
          this.updateLoadingIndicator();
        };
        image.onerror = () => {
          finish();
          if (generation !== this.generation || this.loading.get(record.id) !== load) return;
          this.loading.delete(record.id); this.failed.add(record.id);
          this.updateLoadingIndicator();
          // Retain failure state until resync so refresh does not repeat a broken request.
          this.notice('A shared poster image could not be loaded. Use Resync to retry.');
        };
        load.timer = this.scheduleTimeout(() => {
          finish();
          if (generation !== this.generation || this.loading.get(record.id) !== load) return;
          this.loading.delete(record.id); this.failed.add(record.id);
          this.updateLoadingIndicator();
          image.onload = () => {}; image.onerror = () => {}; image.src = '';
          this.notice('A shared poster image timed out. Use Resync to retry.');
        }, ArtworkSync.IMAGE_LOAD_TIMEOUT_MS);
        image.src = record.assetRef;
      }
    }
  }
  clear(): void {
    this.generation++; this.session++; this.cancelAllLoads(); this.failed.clear(); this.recordsByWall.clear();
    for (const id of [...this.mounted.keys()]) this.remove(id);
    this.records.clear(); this.local.clear();
    this.loadingIndicatorVisible = false;
    document.getElementById('graffiti-loading-indicator')?.remove();
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
  private index(record: SharedArtwork, sort = true): void {
    const surface = decodeSurface(record.surfaceId); if (!surface) return;
    let records = this.recordsByWall.get(surface.wallId);
    if (!records) this.recordsByWall.set(surface.wallId, records = []);
    records.push(record);
    if (sort) records.sort((a, b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity));
  }
  private unindex(record: SharedArtwork): void {
    const surface = decodeSurface(record.surfaceId); if (!surface) return;
    const records = this.recordsByWall.get(surface.wallId); if (!records) return;
    const index = records.findIndex(candidate => candidate.id === record.id);
    if (index >= 0) records.splice(index, 1);
    if (!records.length) this.recordsByWall.delete(surface.wallId);
  }
  private cancelLoad(id: string, load = this.loading.get(id)): void {
    if (!load) return;
    this.cancelTimeout(load.timer);
    if (this.loading.get(id) === load) this.loading.delete(id);
    if (this.activeLoads.get(id) === load.token) this.activeLoads.delete(id);
    load.image.onload = () => {};
    load.image.onerror = () => {};
    load.image.src = '';
    this.updateLoadingIndicator();
  }
  private updateLoadingIndicator(): void {
    const loading = this.loading.size > 0 || this.activeLoads.size > 0;

    if (loading === this.loadingIndicatorVisible) return;

    this.loadingIndicatorVisible = loading;

    const id = 'graffiti-loading-indicator';
    let element = document.getElementById(id);

    if (!loading) {
      element?.remove();
      return;
    }

    if (element) return;

    element = document.createElement('div');
    element.id = id;
    element.textContent = 'GRAFFITI LOADING…';

    Object.assign(element.style, {
      position: 'fixed',
      left: '50%',
      bottom: '90px',
      transform: 'translateX(-50%)',
      zIndex: '2147483646',
      background: 'rgba(5, 18, 35, 0.78)',
      color: '#d9ecff',
      border: '1px solid rgba(65, 160, 255, 0.85)',
      borderRadius: '5px',
      padding: '3px 5px',
      fontFamily: 'monospace',
      fontSize: '7px',
      lineHeight: '1.15',
      letterSpacing: '0.7px',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    });

    document.body.appendChild(element);
  }
  private cancelAllLoads(): void {
    for (const [id, load] of [...this.loading]) this.cancelLoad(id, load);
    this.loading.clear();
    this.activeLoads.clear();
    this.updateLoadingIndicator();
  }
}
