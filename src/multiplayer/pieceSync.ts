import type { Message } from './protocol';

export interface PieceBounds { min: [number, number, number]; max: [number, number, number] }
export interface PieceMetadata {
  pieceId: string;
  anchor: [number, number, number];
  bounds: PieceBounds;
  chunkX?: number;
  chunkZ?: number;
  owner?: string | number;
  createdAt?: number;
  completedAt?: number;
  currentWindowStartedAt?: number;
  currentWindowEndsAt?: number;
  currentWindowLikes?: number;
  lifetimeLikes?: number;
  survivalGeneration?: number;
  strokeIds: string[];
  status?: string;
  revision?: number;
  sequence?: number;
}

export function choosePieceAtWorldPoint(
  pieces: Iterable<PieceMetadata>,
  point: readonly [number, number, number],
  tolerance = 0.1,
): PieceMetadata | null {
  const matches = [...pieces].filter(piece => piece.bounds.min.every((minimum, axis) =>
    point[axis] >= minimum - tolerance && point[axis] <= piece.bounds.max[axis] + tolerance));
  matches.sort((a, b) => (b.createdAt ?? b.sequence ?? 0) - (a.createdAt ?? a.sequence ?? 0));
  return matches[0] ?? null;
}

const MAX_COORDINATE = 1_000_000;
const MAX_EXTENT = 10_000;
const MAX_COUNT = 1_000_000_000;
const MAX_STROKES = 10_000;
const OPTIMISTIC_TTL_MS = 30_000;

function vector(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3 ||
      !value.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_COORDINATE)) return null;
  return [value[0], value[1], value[2]];
}

function timestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.length <= 64) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function count(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_COUNT
    ? value as number : undefined;
}

function safeOptionalInt(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Math.abs(value as number) <= MAX_COORDINATE ? value as number : undefined;
}

function safeRevision(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

export function readPieceMetadata(value: unknown): PieceMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const anchor = vector(v.anchor);
  const boundsValue = v.bounds as Record<string, unknown> | null;
  const min = boundsValue && vector(boundsValue.min);
  const max = boundsValue && vector(boundsValue.max);
  if (typeof v.pieceId !== 'string' || !v.pieceId.trim() || v.pieceId.length > 100 || !anchor || !min || !max) return null;
  for (let axis = 0; axis < 3; axis++) {
    if (min[axis] > max[axis] || max[axis] - min[axis] > MAX_EXTENT) return null;
  }
  const strokeIds = Array.isArray(v.strokeIds)
    ? [...new Set(v.strokeIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 120))].slice(0, MAX_STROKES)
    : [];
  const createdAt = timestamp(v.createdAt);
  const completedAt = timestamp(v.completedAt);
  const currentWindowStartedAt = timestamp(v.currentWindowStartedAt);
  const currentWindowEndsAt = timestamp(v.currentWindowEndsAt);
  if (currentWindowStartedAt !== undefined && currentWindowEndsAt !== undefined && currentWindowEndsAt < currentWindowStartedAt) return null;
  const owner = typeof v.owner === 'string' && v.owner.length <= 120 ? v.owner
    : typeof v.owner === 'number' && Number.isFinite(v.owner) ? v.owner : undefined;
  return {
    pieceId: v.pieceId.trim(), anchor, bounds: { min, max },
    chunkX: safeOptionalInt(v.chunkX), chunkZ: safeOptionalInt(v.chunkZ), owner,
    createdAt, completedAt, currentWindowStartedAt, currentWindowEndsAt,
    currentWindowLikes: count(v.currentWindowLikes), lifetimeLikes: count(v.lifetimeLikes),
    survivalGeneration: count(v.survivalGeneration), strokeIds,
    status: typeof v.status === 'string' && v.status.length <= 32 ? v.status : undefined,
    revision: safeRevision(v.revision), sequence: safeRevision(v.sequence),
  };
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `piece-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class PieceSync {
  readonly pieces = new Map<string, PieceMetadata>();
  private readonly optimistic = new Map<string, number>();

  constructor(
    private readonly send: (message: Message) => boolean,
    private readonly onChange: (pieces: PieceMetadata[], removedStrokeIds?: string[]) => void = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(values: unknown[]): void {
    const next = new Map<string, PieceMetadata>();
    const authoritative = new Set<string>();
    for (const value of values.slice(0, 10_000)) {
      const piece = readPieceMetadata(value);
      if (piece) { next.set(piece.pieceId, piece); authoritative.add(piece.pieceId); }
    }
    // A local create may be excluded from a snapshot until the server publishes its echo.
    for (const [id, createdAt] of this.optimistic) {
      const local = this.pieces.get(id);
      if (!next.has(id) && this.now() - createdAt < OPTIMISTIC_TTL_MS && local) next.set(id, local);
      else if (!next.has(id)) { this.pieces.delete(id); this.optimistic.delete(id); }
    }
    this.pieces.clear();
    for (const [id, piece] of next) {
      this.pieces.set(id, piece);
      if (authoritative.has(id)) this.optimistic.delete(id);
    }
    this.notify();
  }

  accept(message: Message): void {
    if (message.type === 'piece_removed') {
      const pieceId = typeof message.pieceId === 'string' && message.pieceId.length <= 100 ? message.pieceId : '';
      if (!pieceId) return;
      const old = this.pieces.get(pieceId);
      const suppliedIds = Array.isArray(message.strokeIds)
        ? message.strokeIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 120)
        : [];
      const removedIds = [...new Set([...suppliedIds, ...(old?.strokeIds ?? [])])];
      this.pieces.delete(pieceId);
      this.optimistic.delete(pieceId);
      this.notify(removedIds);
      return;
    }
    if (!['piece_created', 'piece_updated', 'piece_completed', 'piece_liked'].includes(message.type)) return;
    const raw = message.piece ?? message.metadata;
    if (!raw || typeof raw !== 'object') return;
    const candidate = raw as Record<string, unknown>;
    const id = typeof candidate.pieceId === 'string' ? candidate.pieceId : '';
    const existing = this.pieces.get(id);
    const piece = readPieceMetadata(existing ? { ...existing, ...candidate } : raw);
    if (!piece) return;
    this.pieces.set(piece.pieceId, piece);
    this.optimistic.delete(piece.pieceId);
    this.notify();
  }

  create(anchorValue: unknown, boundsValue: unknown): string | null {
    const pieceId = makeId();
    const piece = readPieceMetadata({ pieceId, anchor: anchorValue, bounds: boundsValue, strokeIds: [], status: 'active' });
    if (!piece) return null;
    if (!this.send({ type: 'piece_create', pieceId, anchor: piece.anchor, bounds: piece.bounds })) return null;
    this.pieces.set(pieceId, piece);
    this.optimistic.set(pieceId, this.now());
    this.notify();
    return pieceId;
  }

  complete(pieceId: string): boolean {
    const piece = this.pieces.get(pieceId);
    if (!piece) return false;
    return this.send({ type: 'piece_complete', pieceId });
  }

  like(pieceId: string): boolean {
    if (!this.pieces.has(pieceId)) return false;
    return this.send({ type: 'piece_like', pieceId });
  }

  clear(): void {
    this.pieces.clear();
    this.optimistic.clear();
    this.notify();
  }

  private notify(removedStrokeIds?: string[]): void {
    this.onChange([...this.pieces.values()], removedStrokeIds);
  }
}
