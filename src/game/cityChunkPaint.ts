import type { PaintWall } from '@/game/worldTypes';
import type { CityChunk, PaintCache } from '@/game/cityChunkTypes';
import { restorePersistentChunkPaint, restorePersistentChunkPosters } from '@/game/paintPersistence';

export function syncPaintVisibility(wall: PaintWall, visibility: boolean[]): void {
  wall.layers.forEach((layer, index) => {
    layer.mesh.visible = visibility[index] ?? true;
  });
}

export function saveChunkPaint(cache: PaintCache, key: string, chunk: CityChunk): void {
  chunk.walls.forEach((wall, wallIndex) => {
    if (!wall.dirty) return;
    const images = wall.layers.map((layer) => layer.contexts.map((context) => {
      if (!context) return null;
      const image = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
      for (let alpha = 3; alpha < image.data.length; alpha += 4) {
        if (image.data[alpha] > 0) return image;
      }
      return null;
    }));
    if (images.some((layer) => layer.some((image) => image !== null))) {
      cache.set(`${key}:${wallIndex}`, images);
    }
  });
}

export function restoreChunkPaint(
  cache: PaintCache,
  key: string,
  chunk: CityChunk,
  visibility: boolean[],
): void {
  restorePersistentChunkPaint(key, chunk, (wallIndex) => cache.has(`${key}:${wallIndex}`));
  restorePersistentChunkPosters(key, chunk);
  chunk.walls.forEach((wall, wallIndex) => {
    const savedLayers = cache.get(`${key}:${wallIndex}`);
    if (savedLayers) {
      savedLayers.forEach((faces, layerIndex) => {
        while (wall.layers.length <= layerIndex) wall.createLayer();
        const layer = wall.layers[layerIndex];
        if (!layer) return;
        faces.forEach((image, face) => {
          const context = layer.ensureFace(face);
          if (!image || !context) return;
          context.putImageData(image, 0, 0);
          layer.textures[face].needsUpdate = true;
          wall.dirty = true;
        });
      });
    }
    syncPaintVisibility(wall, visibility);
  });
}