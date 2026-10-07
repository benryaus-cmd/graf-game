import { readStroke, type Message, type SharedStroke, type StrokeHistoryState } from './protocol';
import { readPieceMetadata, type PieceMetadata } from './pieceSync';
import { readArtwork, type SharedArtwork } from './artworkSync';

export interface SpatialConfig { enabled: boolean; cellSizeM: number; playerNearM: number; playerMediumM: number; playerFarM: number; playerNearHz: number; playerMediumHz: number; playerFarHz: number; livePaintM: number; worldRadiusM: number; worldSyncMs: number }
export interface SpatialStatus { enabled: boolean; requested: boolean; reason: string | null; config: SpatialConfig | null }
export interface SpatialWorldDelta { upsertPieces: PieceMetadata[]; removePieceIds: string[]; upsertArtworks: SharedArtwork[]; removeArtworkIds: string[]; upsertStrokes: SharedStroke[]; removeStrokeIds: string[] }
export interface StrokeGestureUndone { pieceId: string; gestureId: string; strokeIds: string[] }
export interface StrokeGestureRedone { pieceId: string; gestureId: string; strokes: SharedStroke[] }

const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const readIds = (value: unknown): string[] => [...new Set(array(value).filter((id): id is string => typeof id === 'string' && !!id && id.length <= 200))];
export function readSpatialStatus(message: Message): SpatialStatus | null {
  if (message.type !== 'spatial_status' || typeof message.enabled !== 'boolean' || typeof message.requested !== 'boolean') return null;
  const value = message.config as Record<string,unknown> | null;
  const keys = ['cellSizeM','playerNearM','playerMediumM','playerFarM','playerNearHz','playerMediumHz','playerFarHz','livePaintM','worldRadiusM','worldSyncMs'];
  const config = value && typeof value.enabled === 'boolean' && keys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && (value[key] as number) > 0) ? value as unknown as SpatialConfig : null;
  return { enabled: message.enabled, requested: message.requested, reason: typeof message.reason === 'string' ? message.reason.slice(0,160) : null, config };
}
export function readSpatialDelta(message: Message): SpatialWorldDelta | null {
  if (message.type !== 'spatial_world_delta') return null;
  return { upsertPieces: array(message.upsertPieces).map(readPieceMetadata).filter((v): v is PieceMetadata => !!v), removePieceIds: readIds(message.removePieceIds), upsertArtworks: array(message.upsertArtworks).map(readArtwork).filter((v): v is SharedArtwork => !!v), removeArtworkIds: readIds(message.removeArtworkIds), upsertStrokes: array(message.upsertStrokes).map(readStroke).filter((v): v is SharedStroke => !!v), removeStrokeIds: readIds(message.removeStrokeIds) };
}
export function readStrokeHistory(message: Message): StrokeHistoryState | null {
  if (message.type !== 'stroke_history_state' || typeof message.pieceId !== 'string' || !message.pieceId || typeof message.canUndo !== 'boolean' || typeof message.canRedo !== 'boolean' ||
    !['undoDepth','redoDepth','limit'].every(key => Number.isSafeInteger(message[key]) && (message[key] as number) >= 0)) return null;
  return { pieceId: message.pieceId, canUndo: message.canUndo, canRedo: message.canRedo, undoDepth: message.undoDepth as number, redoDepth: message.redoDepth as number, limit: message.limit as number };
}
export function readGestureUndone(message: Message): StrokeGestureUndone | null {
  return message.type === 'stroke_gesture_undone' && typeof message.pieceId === 'string' && typeof message.gestureId === 'string' && Array.isArray(message.strokeIds) ? { pieceId: message.pieceId, gestureId: message.gestureId, strokeIds: readIds(message.strokeIds) } : null;
}
export function readGestureRedone(message: Message): StrokeGestureRedone | null {
  return message.type === 'stroke_gesture_redone' && typeof message.pieceId === 'string' && typeof message.gestureId === 'string' && Array.isArray(message.strokes) ? { pieceId: message.pieceId, gestureId: message.gestureId, strokes: message.strokes.map(readStroke).filter((s): s is SharedStroke => !!s) } : null;
}
