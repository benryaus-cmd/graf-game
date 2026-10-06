import type { Message } from './protocol';
import { artworkAssetRef } from './artworkAssets';

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
  title?: string;
  revision?: number;
  sequence?: number;
  protected?: boolean;
  protectedUntil?: number;
  protectionBounds?: PieceBounds;
  protectionAddedSeconds?: number;
  flattened?: boolean;
  assetRef?: string;
  surfaceId?: string;
  face?: string;
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  width?: number;
  height?: number;
  flattenedAt?: number;
}

export function choosePieceAtWorldPoint(
  pieces: Iterable<PieceMetadata>,
  point: readonly [number, number, number],
  tolerance = 0.1,
): PieceMetadata | null {
  const matches = [...pieces].filter(piece => {
    const bounds = piece.protectionBounds ?? piece.bounds;
    return bounds.min.every((minimum, axis) => point[axis] >= minimum - tolerance && point[axis] <= bounds.max[axis] + tolerance);
  });
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

function readProtectionBounds(value: unknown): PieceBounds | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const min = vector(candidate.min), max = vector(candidate.max);
  if (!min || !max || min.some((n, axis) => n > max[axis] || max[axis] - n > MAX_EXTENT)) return undefined;
  return { min, max };
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

function quaternionVector(value: unknown): [number, number, number, number] | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every(v => typeof v === 'number' && Number.isFinite(v))
  ) return undefined;

  return [value[0], value[1], value[2], value[3]];
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

  const flatAssetRef = artworkAssetRef(v.assetRef);
  const flatSurfaceId =
    typeof v.surfaceId === 'string' && v.surfaceId.length <= 200
      ? v.surfaceId
      : undefined;

  const flatFace =
    typeof v.face === 'string' && v.face.length <= 40
      ? v.face
      : undefined;

  const flatPosition = vector(v.position) ?? undefined;
  const flatQuaternion = quaternionVector(v.quaternion);

  const flatWidth =
    typeof v.width === 'number' &&
    Number.isFinite(v.width) &&
    v.width > 0 &&
    v.width <= 100
      ? v.width
      : undefined;

  const flatHeight =
    typeof v.height === 'number' &&
    Number.isFinite(v.height) &&
    v.height > 0 &&
    v.height <= 100
      ? v.height
      : undefined;

  const flattened =
    v.flattened === true &&
    !!flatAssetRef &&
    !!flatSurfaceId &&
    !!flatPosition &&
    !!flatQuaternion &&
    flatWidth !== undefined &&
    flatHeight !== undefined;

  return {
    pieceId: v.pieceId.trim(), anchor, bounds: { min, max },
    chunkX: safeOptionalInt(v.chunkX), chunkZ: safeOptionalInt(v.chunkZ), owner,
    createdAt, completedAt, currentWindowStartedAt, currentWindowEndsAt,
    currentWindowLikes: count(v.currentWindowLikes), lifetimeLikes: count(v.lifetimeLikes),
    survivalGeneration: count(v.survivalGeneration), strokeIds,
    status: typeof v.status === 'string' && v.status.length <= 32 ? v.status : undefined,
    title: typeof v.title === 'string' && v.title.trim().length <= 60 ? v.title.trim() || undefined : undefined,
    revision: safeRevision(v.revision), sequence: safeRevision(v.sequence),
    protected: typeof v.protected === 'boolean' ? v.protected : undefined,
    protectedUntil: timestamp(v.protectedUntil),
    protectionBounds: readProtectionBounds(v.protectionBounds),
    protectionAddedSeconds: count(v.protectionAddedSeconds),
    flattened: flattened || undefined,
    assetRef: flattened ? flatAssetRef! : undefined,
    surfaceId: flattened ? flatSurfaceId! : undefined,
    face: flattened ? flatFace : undefined,
    position: flattened ? flatPosition : undefined,
    quaternion: flattened ? flatQuaternion : undefined,
    width: flattened ? flatWidth : undefined,
    height: flattened ? flatHeight : undefined,
    flattenedAt: flattened ? timestamp(v.flattenedAt) : undefined,
  };
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `piece-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class PieceSync {
  readonly pieces = new Map<string, PieceMetadata>();
  private readonly optimistic = new Map<string, number>();
  private readonly localTitles = new Map<string, string>();

  constructor(
    private readonly send: (message: Message) => boolean,
    private readonly onChange: (pieces: PieceMetadata[], removedStrokeIds?: string[]) => void = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(values: unknown[]): void {
    const next = new Map<string, PieceMetadata>();
    const authoritative = new Set<string>();
    for (const value of values.slice(0, 10_000)) {
      const parsed = readPieceMetadata(value);
      const cachedTitle = parsed && this.localTitles.get(parsed.pieceId);
      const piece = parsed && !parsed.title && cachedTitle ? { ...parsed, title: cachedTitle } : parsed;
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
    if (message.type === 'piece_protection_updated' || message.type === 'protection_purchased') {
      const id = typeof message.pieceId === 'string' ? message.pieceId : '';
      const existing = this.pieces.get(id);
      const until = timestamp(message.protectedUntil);
      if (!existing || until === undefined) return;
      this.pieces.set(id, { ...existing, protected: true, protectedUntil: until, protectionBounds: readProtectionBounds(message.protectionBounds) ?? existing.protectionBounds, protectionAddedSeconds: count(message.addedSeconds) });
      this.notify(); return;
    }
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
      this.localTitles.delete(pieceId);
      this.notify(removedIds);
      return;
    }
    if (!['piece_created', 'piece_updated', 'piece_completed', 'piece_liked', 'piece_flattened'].includes(message.type)) return;
    const raw = message.piece ?? message.metadata;
    if (!raw || typeof raw !== 'object') return;
    const candidate = raw as Record<string, unknown>;
    const id = typeof candidate.pieceId === 'string' ? candidate.pieceId : '';
    const existing = this.pieces.get(id);
    const removedStrokeIds = message.type === 'piece_flattened'
      ? [...new Set([
          ...(existing?.strokeIds ?? []),
          ...(Array.isArray(message.strokeIds)
            ? message.strokeIds.filter(
                (strokeId): strokeId is string =>
                  typeof strokeId === 'string' &&
                  strokeId.length > 0 &&
                  strokeId.length <= 120,
              )
            : []),
        ])]
      : undefined;
    const piece = readPieceMetadata(existing ? { ...existing, ...candidate } : raw);
    if (!piece) return;
    const storedPiece = message.type === 'piece_flattened'
      ? { ...piece, strokeIds: [] }
      : piece;
    if (storedPiece.title) this.localTitles.set(storedPiece.pieceId, storedPiece.title);
    this.pieces.set(storedPiece.pieceId, storedPiece);
    this.optimistic.delete(storedPiece.pieceId);
    this.notify(removedStrokeIds);
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

  complete(pieceId: string, title?: string): boolean {
    const piece = this.pieces.get(pieceId);
    if (!piece) return false;
    const cleanTitle = (title ?? piece.title)?.trim().slice(0, 60);
    if (!this.send({ type: 'piece_complete', pieceId, ...(cleanTitle ? { title: cleanTitle } : {}) })) return false;
    if (cleanTitle) {
      this.cacheTitle(pieceId, cleanTitle);
      this.pieces.set(pieceId, { ...piece, title: cleanTitle });
      this.notify();
    }
    return true;
  }

  setLocalTitle(pieceId: string, title: string): boolean {
    const piece = this.pieces.get(pieceId);
    const cleanTitle = title.trim().slice(0, 60);
    if (!piece) return false;
    if (!cleanTitle) return true;
    this.cacheTitle(pieceId, cleanTitle);
    this.pieces.set(pieceId, { ...piece, title: cleanTitle });
    this.notify();
    return true;
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

  private cacheTitle(pieceId: string, title: string): void {
    this.localTitles.delete(pieceId);
    this.localTitles.set(pieceId, title);
    if (this.localTitles.size > 1000) this.localTitles.delete(this.localTitles.keys().next().value!);
  }
}
