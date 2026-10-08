import { performanceLog } from './performanceLog';
import type { CityChunk, PaintCache } from '@/game/cityChunkTypes';
import type { PosterArtwork } from '@/game/worldTypes';
import { addPosterOverlay } from '@/game/posterOverlay';

const STORAGE_PREFIX = 'sidestreet_world_paint_v1:';
const POSTER_STORAGE_PREFIX = 'sidestreet_world_posters_v1:';

type EncodedLayer = Array<string | string[] | null>;
type EncodedChunk = Record<string, EncodedLayer[]>;
type EncodedPosters = Record<string, PosterArtwork[]>;

function encodeImage(image: ImageData): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export function savePersistentChunkPaint(cache: PaintCache, key: string, chunk?: CityChunk, failedSaves?: Map<string, string>): void {
  const prefix = `${key}:`;
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const encoded: EncodedChunk = {};
  try {
    const raw = failedSaves?.get(storageKey) ?? window.localStorage.getItem(storageKey);
    if (raw) {
      const previous = JSON.parse(raw) as EncodedChunk;
      if (typeof previous === 'object' && previous !== null && !Array.isArray(previous)) {
        Object.assign(encoded, previous);
      }
    }
  } catch (error) {
    console.warn('[Aippy] Existing paint data could not be read before saving.', error);
  }
  cache.forEach((layers, cacheKey) => {
    if (!cacheKey.startsWith(prefix)) return;
    const wallIndex = cacheKey.slice(prefix.length);
    encoded[wallIndex] = layers.map((faces, layerIndex) => faces.map((image, face) => {
      const overlay = image ? encodeImage(image) : null;
      const pending = chunk?.walls[Number(wallIndex)]?.pendingPaintImages?.get(`${layerIndex}:${face}`);
      if (pending?.length) return overlay ? [...pending, overlay] : pending.length === 1 ? pending[0] : pending;
      return overlay;
    }));
  });
  if (Object.keys(encoded).length === 0) return;
  const serialized = JSON.stringify(encoded);
  try {
    window.localStorage.setItem(storageKey, serialized);
    failedSaves?.delete(storageKey);
  } catch (error) {
    // Preserve the complete base and overlay for this running game even if storage is full.
    failedSaves?.set(storageKey, serialized);
    console.warn('[Aippy] Painted world could not be fully saved on this device.', error);
  }
}

export function savePersistentChunkPosters(key: string, chunk: CityChunk): void {
  const encoded: EncodedPosters = {};
  chunk.walls.forEach((wall, wallIndex) => {
    if (wall.posters?.length) encoded[String(wallIndex)] = wall.posters;
  });
  const storageKey = `${POSTER_STORAGE_PREFIX}${key}`;
  try {
    if (Object.keys(encoded).length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(encoded));
    }
  } catch (error) {
    console.warn('[Aippy] High-quality posters could not be fully saved on this device.', error);
  }
}

export function restorePersistentChunkPaint(
  key: string,
  chunk: CityChunk,
  isCached: (wallIndex: number) => boolean,
  shouldRestore: () => boolean = () => true,
  failedSaves?: Map<string, string>,
): void {
  let encoded: EncodedChunk;
  try {
    const storageKey = `${STORAGE_PREFIX}${key}`;
    const raw = failedSaves?.get(storageKey) ?? window.localStorage.getItem(storageKey);
    if (!raw) return;
    encoded = JSON.parse(raw) as EncodedChunk;
  } catch (error) {
    console.warn('[Aippy] A saved paint section could not be read.', error);
    return;
  }
  if (typeof encoded !== 'object' || encoded === null || Array.isArray(encoded)) return;
  Object.entries(encoded).forEach(([wallKey, rawLayers]) => {
    const wallIndex = Number(wallKey);
    if (isCached(wallIndex)) return;
    const wall = chunk.walls[wallIndex];
    if (!wall || !Array.isArray(rawLayers)) return;
    rawLayers.forEach((rawFaces, layerIndex) => {
      if (!Array.isArray(rawFaces)) return;
      while (wall.layers.length <= layerIndex) wall.createLayer();
      const layer = wall.layers[layerIndex];
      if (!layer) return;
      rawFaces.forEach((rawImage, faceIndex) => {
        const sources = typeof rawImage === 'string' ? [rawImage] :
          Array.isArray(rawImage) ? rawImage.filter((source): source is string => typeof source === 'string') : [];
        if (!sources.length) return;
        const faceKey = `${layerIndex}:${faceIndex}`;
        wall.pendingPaintImages ??= new Map();
        wall.pendingPaintImages.set(faceKey, sources);
        const decoded: Array<HTMLImageElement | null> = Array(sources.length).fill(null);
        let remaining = sources.length;
        const finish = () => performanceLog.measure('paint.restoreImage',()=>{
          remaining--;
          if (remaining > 0 || wall.pendingPaintImages?.get(faceKey) !== sources) return;
          if (!chunk.group.parent || !shouldRestore()) return;
          const context = layer.ensureFace(faceIndex);
          if (!context) return;
          // Paint made during image decoding remains above the saved background.
          const overlay = document.createElement('canvas');
          overlay.width = context.canvas.width; overlay.height = context.canvas.height;
          overlay.getContext('2d')?.drawImage(context.canvas, 0, 0);
          context.save(); context.setTransform(1, 0, 0, 1, 0, 0);
          context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
          context.clearRect(0, 0, context.canvas.width, context.canvas.height);
          decoded.forEach(image => { if (image) context.drawImage(image, 0, 0, context.canvas.width, context.canvas.height); });
          context.drawImage(overlay, 0, 0);
          context.restore();
          wall.pendingPaintImages.delete(faceKey);
          layer.textures[faceIndex].needsUpdate = true; wall.dirty = true;
        },key);
        sources.forEach((source, index) => {
          const image = new Image();
          image.onload = () => { decoded[index] = image; finish(); };
          image.onerror = error => { console.warn('[Aippy] A saved paint image could not be restored.', error); finish(); };
          image.src = source;
        });
      });
    });
  });
}

function isPosterArtwork(value: unknown): value is PosterArtwork {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const validTuple = (candidate: unknown, length: number) => (
    Array.isArray(candidate) && candidate.length === length &&
    candidate.every((part) => typeof part === 'number' && Number.isFinite(part))
  );
  return typeof record.image === 'string' && record.image.startsWith('data:image/') &&
    validTuple(record.position, 3) && validTuple(record.quaternion, 4) &&
    typeof record.width === 'number' && Number.isFinite(record.width) && record.width > 0 &&
    typeof record.height === 'number' && Number.isFinite(record.height) && record.height > 0;
}

export function restorePersistentChunkPosters(key: string, chunk: CityChunk, shouldRestore: () => boolean = () => true): void {
  let encoded: EncodedPosters;
  try {
    const raw = window.localStorage.getItem(`${POSTER_STORAGE_PREFIX}${key}`);
    if (!raw) return;
    encoded = JSON.parse(raw) as EncodedPosters;
  } catch (error) {
    console.warn('[Aippy] Saved high-quality posters could not be read.', error);
    return;
  }
  if (typeof encoded !== 'object' || encoded === null || Array.isArray(encoded)) return;
  Object.entries(encoded).forEach(([wallKey, savedPosters]) => {
    const wall = chunk.walls[Number(wallKey)];
    if (!wall || !Array.isArray(savedPosters)) return;
    const posters = savedPosters.filter(isPosterArtwork);
    wall.posters = posters;
    posters.forEach((artwork) => {
      const image = new Image();
      image.onload = () => {
        if (!chunk.group.parent || !shouldRestore()) return;
        addPosterOverlay(wall, artwork, image);
      };
      image.onerror = (error) => console.warn('[Aippy] A saved poster image could not be restored.', error);
      image.src = artwork.image;
    });
  });
}
