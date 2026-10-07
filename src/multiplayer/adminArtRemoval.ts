import type { AdminArtRemovalProgress } from './protocol';

function username(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^@/, '').toLowerCase();
  return normalized && normalized.length <= 40 && !/\s/.test(normalized) && ![...normalized].some(character => character.charCodeAt(0) < 32) ? normalized : null;
}

/** Read only the server's removal counts; correlate subsequent events to the
 * requesting target and, once started, the server-issued job identity. */
export function readAdminArtRemovalProgress(
  value: unknown,
  expected?: { targetUsername: string; jobId?: string },
): AdminArtRemovalProgress | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!['admin_remove_user_art_started', 'admin_remove_user_art_progress', 'admin_remove_user_art_complete'].includes(String(v.type))) return null;
  const targetUsername = username(v.targetUsername);
  if (!targetUsername || typeof v.jobId !== 'string' || !v.jobId.trim() || v.jobId.length > 120 ||
      (expected && targetUsername !== username(expected.targetUsername)) ||
      (expected?.jobId !== undefined && v.jobId !== expected.jobId)) return null;
  const counters = ['total', 'removed', 'removedPieces', 'removedArtworks', 'removedStrokes', 'remaining'] as const;
  if (counters.some(key => typeof v[key] !== 'number' || !Number.isSafeInteger(v[key]) || (v[key] as number) < 0) ||
      typeof v.serverTime !== 'number' || !Number.isFinite(v.serverTime) || v.serverTime < 0) return null;
  return {
    type: v.type as AdminArtRemovalProgress['type'], jobId: v.jobId, targetUsername,
    total: v.total as number, removed: v.removed as number, removedPieces: v.removedPieces as number,
    removedArtworks: v.removedArtworks as number, removedStrokes: v.removedStrokes as number,
    remaining: v.remaining as number, serverTime: v.serverTime,
  };
}
