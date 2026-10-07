import type { PieceMetadata } from './pieceSync';
import type { ServerRole } from './permissions';
import type { ProtectionQuote } from './protectionSync';
export interface ProtectionStatus { creditBalance: number | null; quote: ProtectionQuote | null; quotes: { unprotected: ProtectionQuote | null; protected: ProtectionQuote | null }; purchased: boolean; protectionEnabled: boolean; pendingQuote: boolean; pendingPurchase: boolean; protectedUntil: number | null; notice: string | null }

export interface StrokePoint { x: number; y: number; z: number; pressure: number }
export interface SharedStroke {
  strokeId: string; playerId?: string; pieceId?: string; surfaceId: string;
  colour: string; tool: string; brushSize: number; points: StrokePoint[];
  operation?: 'paint' | 'erase'; opacity?: number; layerIndex?: number; face?: string;
  sequence?: number; revision?: number;
}
export interface PlayerCosmetics { outfit: string; top: string; bottom: string; accessory: string }
export interface PlayerState {
  position: number[]; rotation: number[]; movement?: string; tool?: string; jumping?: boolean;
  animation?: string; emote?: string; visibleHeldItem?: string; flightState?: string; cosmetics?: PlayerCosmetics;
}
export interface SharedPlayer {
  playerId: string;
  /** Legacy/server-preformatted label retained for protocol 1 and older snapshots. */
  displayName: string;
  /** Aippy profile identity fields are deliberately kept separate. */
  username?: string;
  nickName?: string;
  role?: ServerRole;
  state?: PlayerState;
}
export type ConnectionPhase = 'solo' | 'connecting' | 'connected' | 'disconnected';
export interface MultiplayerStatus { phase: ConnectionPhase; playerCount: number; notice?: string; role?: ServerRole; canDeletePieces?: boolean; canAdminPaint?: boolean }
export interface ChatMessage { username?: string; nickName?: string; id: string; playerId: string; displayName: string; text: string; timestamp: number }
/** Local UI view of identities already supplied by snapshot/join/leave events. */
export interface OnlinePlayer { playerId: string; username: string; nickName: string; role?: ServerRole }
export interface ChatMuteState { muted: boolean; mutedUntil: number | null; remainingMs: number | null; receivedAt: number; reason: string }
export interface MultiplayerView { chatMute?: ChatMuteState | null; onlinePlayers?: OnlinePlayer[]; ownPlayerId?: string | null; adminResult?: { type: string; targetUsername: string; amount?: number; balance?: number; permanent?: boolean; bannedUntil?: number; serverTime?: number }; protection?: ProtectionStatus; chat: ChatMessage[]; revision: number; accountFeaturesAvailable: boolean; worldItemCount: number; pieces?: PieceMetadata[]; selectedPieceId?: string | null; piecePickSequence?: number; playerPickSequence?: number; selectedPlayer?: { online?: boolean; playerId: string; username: string; nickName: string; role?: ServerRole } | null; roleChange?: { targetUsername: string; previousRole: ServerRole; role: ServerRole; serverTime: number } }
export type Message = Record<string, unknown> & { type: string };

export function readPoint(value: unknown): StrokePoint | null {
  const p = value as StrokePoint;
  if (!p || ![p.x, p.y, p.z].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  return { x: p.x, y: p.y, z: p.z, pressure: Number.isFinite(p.pressure) ? Math.max(0.05, Math.min(1, p.pressure)) : 1 };
}
export function readStroke(value: unknown): SharedStroke | null {
  const s = value as SharedStroke & { id?: string };
  if (!s || typeof (s.strokeId ?? s.id) !== 'string' || typeof s.surfaceId !== 'string' ||
      typeof s.colour !== 'string' || !/^#[0-9a-f]{6}$/i.test(s.colour) ||
      !Number.isFinite(s.brushSize) || s.brushSize <= 0) return null;
  return {
    strokeId: s.strokeId ?? s.id!, playerId: s.playerId,
    pieceId: typeof s.pieceId === 'string' && s.pieceId.length <= 100 ? s.pieceId : undefined,
    surfaceId: s.surfaceId,
    colour: s.colour, tool: typeof s.tool === 'string' ? s.tool : 'spray',
    brushSize: s.brushSize,
    operation: s.operation === 'erase' || s.tool === 'eraser' ? 'erase' : 'paint',
    opacity: Number.isFinite(s.opacity) ? Math.max(0.05, Math.min(1, s.opacity!)) : 1,
    layerIndex: Number.isInteger(s.layerIndex) ? Math.max(0, Math.min(7, s.layerIndex!)) : undefined,
    face: typeof s.face === 'string' ? s.face.slice(0, 40) : undefined,
    sequence: Number.isSafeInteger(s.sequence) ? s.sequence : undefined,
    revision: Number.isSafeInteger(s.revision) ? s.revision : undefined,
    points: Array.isArray(s.points) ? s.points.slice(0, 20_000).map(readPoint).filter((p): p is StrokePoint => !!p) : [],
  };
}
export function readPlayerState(value: unknown): PlayerState | null {
  const s = value as PlayerState;
  if (!s || !Array.isArray(s.position) || s.position.length !== 3 ||
      !s.position.every(n => Number.isFinite(n)) || !Array.isArray(s.rotation) ||
      s.rotation.length < 3 || !s.rotation.every(n => Number.isFinite(n))) return null;
  return {
    position: s.position.slice(0, 3), rotation: s.rotation.slice(0, 3),
    movement: typeof s.movement === 'string' ? s.movement : 'idle',
    tool: typeof s.tool === 'string' ? s.tool : 'off', jumping: s.jumping === true,
    animation: typeof s.animation === 'string' ? s.animation.slice(0, 40) : 'idle',
    emote: typeof s.emote === 'string' ? s.emote.slice(0, 40) : '',
    visibleHeldItem: typeof s.visibleHeldItem === 'string' ? s.visibleHeldItem.slice(0, 40) : 'none',
    flightState: typeof s.flightState === 'string' ? s.flightState.slice(0, 40) : 'grounded',
    cosmetics: readCosmetics(s.cosmetics),
  };
}

export function readCosmetics(value: unknown): PlayerCosmetics | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (!['outfit','top','bottom','accessory'].every(k => typeof v[k] === 'string' && (v[k] as string).length <= 40)) return undefined;
  return { outfit: v.outfit as string, top: v.top as string, bottom: v.bottom as string, accessory: v.accessory as string };
}
export function readPlayer(value: unknown): SharedPlayer | null {
  const p = value as SharedPlayer & { id?: string };
  if (!p || typeof (p.playerId ?? p.id) !== 'string') return null;
  const username = readIdentityField(p.username, 40);
  const nickName = readIdentityField(p.nickName, 40);
  const displayName = readIdentityField(p.displayName, 40) ?? (nickName || (username ? '@' + username : 'PLAYER'));
  const role = p.role === 'player' || p.role === 'moderator' || p.role === 'admin' || p.role === 'owner' ? p.role : undefined;
  return { playerId: p.playerId ?? p.id!, displayName, username, nickName, ...(role ? { role } : {}), state: readPlayerState(p.state) ?? undefined };
}

function readIdentityField(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}
