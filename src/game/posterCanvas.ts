import type { PosterArtwork, WorldEngine } from '@/game/worldTypes';
import type { PosterPlacementSession } from '@/game/posterPlacement';
import { addPosterOverlay } from '@/game/posterOverlay';

export function commitPosterPlacement(
  world: WorldEngine,
  session: PosterPlacementSession,
): boolean | null {
  if (session.commitSignal === session.lastCommitSignal) return null;
  session.lastCommitSignal = session.commitSignal;
  const target = session.target;
  if (!session.valid || !target) return false;
  while (target.wall.layers.length === 0) target.wall.createLayer();
  const layer = target.wall.layers[0];
  const context = layer?.ensureFace(target.face);
  if (!layer || !context) return false;
  const dimensions = target.wall.faceDimensions[target.face] ?? { width: 1, height: 1 };
  const xScale = context.canvas.width / Math.max(0.01, dimensions.width);
  const yScale = context.canvas.height / Math.max(0.01, dimensions.height);
  context.save();
  context.setTransform(xScale, 0, 0, yScale, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    session.image,
    target.centerX - target.width / 2,
    target.centerY - target.height / 2,
    target.width,
    target.height,
  );
  context.restore();

  const artwork: PosterArtwork = {
    image: session.image.src,
    position: target.position,
    quaternion: target.quaternion,
    width: target.width,
    height: target.height,
  };
  addPosterOverlay(target.wall, artwork, session.image);
  target.wall.posters ??= [];
  target.wall.posters.push(artwork);
  layer.textures[target.face].needsUpdate = true;
  target.wall.dirty = true;
  world.savePaint();
  return true;
}