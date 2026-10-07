import type { Message } from './protocol';
import type { ServerRole } from './permissions';

export type AdminAction = 'give-credits' | 'kick' | 'ban' | 'unban' | 'mute' | 'unmute';
export interface AdminActionOptions {
  amount?: number;
  durationSeconds?: number | null;
  durationMinutes?: number | null;
  reason?: string;
}

const MAX_REASON_LENGTH = 500;
const MAX_CREDIT_AMOUNT = 1_000_000_000;
const MIN_BAN_DURATION_SECONDS = 60;
const MAX_BAN_DURATION_SECONDS = 31_536_000;

export function canUseAdminActions(actorRole: ServerRole | null | undefined, targetRole: ServerRole | null | undefined): boolean {
  return actorRole === 'owner' || (actorRole === 'admin' && !!targetRole && targetRole !== 'owner');
}

export function buildAdminAction(
  actorRole: ServerRole | null | undefined,
  targetRole: ServerRole | null | undefined,
  action: AdminAction,
  targetUsername: string,
  options: AdminActionOptions = {},
): Message | null {
  if (action === 'give-credits' ? actorRole !== 'owner' : !canUseAdminActions(actorRole, targetRole)) return null;
  const username = normalizeUsername(targetUsername);
  if (!username) return null;
  const reason = normalizeReason(options.reason);
  if (options.reason !== undefined && reason === null) return null;

  const optionalReason = reason ? { reason } : {};
  if (action === 'give-credits') {
    if (!Number.isSafeInteger(options.amount) || options.amount! < 1 || options.amount! > MAX_CREDIT_AMOUNT) return null;
    return { type: 'admin_give_credits', targetUsername: username, amount: options.amount! };
  }
  if (action === 'kick') return { type: 'admin_kick', targetUsername: username, ...optionalReason };
  if (action === 'ban') {
    if (!(options.durationSeconds === null || (Number.isSafeInteger(options.durationSeconds) &&
      options.durationSeconds! >= MIN_BAN_DURATION_SECONDS && options.durationSeconds! <= MAX_BAN_DURATION_SECONDS))) return null;
    return { type: 'admin_ban', targetUsername: username, durationSeconds: options.durationSeconds!, ...optionalReason };
  }
  if (action === 'unban') return { type: 'admin_unban', targetUsername: username };
  if (action === 'mute') {
    if (!Number.isSafeInteger(options.durationMinutes) || options.durationMinutes! < 1 || options.durationMinutes! > 10080) return null;
    return { type: 'admin_mute', targetUsername: username, durationMinutes: options.durationMinutes!, ...optionalReason };
  }
  if (action === 'unmute') return { type: 'admin_unmute', targetUsername: username };
  return null;
}

function normalizeUsername(value: string): string | null {
  const username = value.trim().replace(/^@/, '');
  if (!username || username.length > 40 || Array.from(username).some(character => character.trim() === '' || (character.codePointAt(0) ?? 32) < 32)) return null;
  return username;
}

function normalizeReason(value: string | undefined): string | null {
  if (value === undefined) return '';
  if (typeof value !== 'string') return null;
  const reason = value.trim();
  return reason.length <= MAX_REASON_LENGTH ? reason : null;
}
