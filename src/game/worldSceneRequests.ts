import type { WorldEngine } from '@/game/worldTypes';
import { paintArtworkNearBot } from '@/game/cityBots';
import {
  createPosterPlacementSession, disposePosterPlacementSession, type PosterPlacementSession,
} from '@/game/posterPlacement';
import type { BotArtworkRequest } from '@/game/useBotArtwork';

interface MutableRef<T> { current: T }
interface ArtworkCallback { current: (sequence: number, placed: boolean) => void }
interface ValidityCallback { current: (valid: boolean) => void }

export function loadPosterImage(
  request: { sequence: number; dataUrl: string } | null,
  worldRef: MutableRef<WorldEngine | null>,
  sessionRef: MutableRef<PosterPlacementSession | null>,
  sizeRef: MutableRef<number>,
  commitRef: MutableRef<number>,
  validityRef: ValidityCallback,
): () => void {
  if (!request) return () => {};
  const image = new Image();
  let active = true;
  image.onload = () => {
    if (!active) return;
    if (sessionRef.current) disposePosterPlacementSession(worldRef.current, sessionRef.current);
    sessionRef.current = createPosterPlacementSession(
      request.sequence, image, sizeRef.current, commitRef.current,
    );
  };
  image.onerror = () => validityRef.current(false);
  image.src = request.dataUrl;
  return () => {
    active = false;
    if (sessionRef.current?.sequence === request.sequence) {
      disposePosterPlacementSession(worldRef.current, sessionRef.current);
      sessionRef.current = null;
    }
  };
}

export function loadBotArtwork(
  request: BotArtworkRequest | null,
  worldRef: MutableRef<WorldEngine | null>,
  placedRef: ArtworkCallback,
): () => void {
  if (!request) return () => {};
  const world = worldRef.current;
  if (!world) {
    placedRef.current(request.sequence, false);
    return () => {};
  }
  const image = new Image();
  let active = true;
  const finish = (placed: boolean) => placedRef.current(request.sequence, placed);
  image.onload = () => {
    if (!active) return;
    const placed = paintArtworkNearBot(world, request.botIndex, image);
    if (placed) world.savePaint();
    finish(placed);
  };
  image.onerror = () => finish(false);
  image.src = request.dataUrl;
  return () => { active = false; };
}