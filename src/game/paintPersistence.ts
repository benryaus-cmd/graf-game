import type { CityChunk, PaintCache } from '@/game/cityChunkTypes';
import type { PosterArtwork } from '@/game/worldTypes';
import { addPosterOverlay } from '@/game/posterOverlay';

const STORAGE_PREFIX = 'sidestreet_world_paint_v1:';
const POSTER_STORAGE_PREFIX = 'sidestreet_world_posters_v1:';

type EncodedLayer = Array<string | null>;
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

export function savePersistentChunkPaint(cache: PaintCache, key: string): void {
  const prefix = `${key}:`;
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const encoded: EncodedChunk = {};
  try {
    const raw = window.localStorage.getItem(storageKey);
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
    encoded[wallIndex] = layers.map((faces) => faces.map((image) => image ? encodeImage(image) : null));
  });
  if (Object.keys(encoded).length === 0) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(encoded));
  } catch (error) {
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
): void {
  let encoded: EncodedChunk;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
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
        if (typeof rawImage !== 'string') return;
        const image = new Image();
        image.onload = () => {
          if (!chunk.group.parent) return;
          const context = layer.ensureFace(faceIndex);
          if (!context) return;
          context.drawImage(image, 0, 0, context.canvas.width, context.canvas.height);
          layer.textures[faceIndex].needsUpdate = true;
          wall.dirty = true;
        };
        image.onerror = (error) => console.warn('[Aippy] A saved paint image could not be restored.', error);
        image.src = rawImage;
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

export function restorePersistentChunkPosters(key: string, chunk: CityChunk): void {
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
        if (!chunk.group.parent) return;
        addPosterOverlay(wall, artwork, image);
      };
      image.onerror = (error) => console.warn('[Aippy] A saved poster image could not be restored.', error);
      image.src = artwork.image;
    });
  });
}