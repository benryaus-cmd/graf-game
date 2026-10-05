export interface StrokePoint { x: number; y: number; z: number; pressure: number }
export interface SharedStroke {
  strokeId: string; playerId?: string; surfaceId: string;
  colour: string; tool: string; brushSize: number; points: StrokePoint[];
}
export interface PlayerState {
  position: number[]; rotation: number[]; movement?: string; tool?: string; jumping?: boolean;
}
export interface SharedPlayer { playerId: string; displayName: string; state?: PlayerState }
export type ConnectionPhase = 'solo' | 'connecting' | 'connected' | 'disconnected';
export interface MultiplayerStatus { phase: ConnectionPhase; playerCount: number; notice?: string }
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
    strokeId: s.strokeId ?? s.id!, playerId: s.playerId, surfaceId: s.surfaceId,
    colour: s.colour, tool: typeof s.tool === 'string' ? s.tool : 'spray',
    brushSize: s.brushSize,
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
  };
}
export function readPlayer(value: unknown): SharedPlayer | null {
  const p = value as SharedPlayer & { id?: string };
  if (!p || typeof (p.playerId ?? p.id) !== 'string') return null;
  return { playerId: p.playerId ?? p.id!, displayName: typeof p.displayName === 'string' ? p.displayName.slice(0, 40) : 'PLAYER', state: readPlayerState(p.state) ?? undefined };
}
