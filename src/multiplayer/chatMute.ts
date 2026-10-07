import type { ChatMuteState, Message } from './protocol';

/** Presentation data from the existing server messages. Never enforces a shared mute. */
export function readChatMute(message: Message, now = Date.now()): ChatMuteState | null {
  if (message.type !== 'chat_mute_state' && message.type !== 'chat_muted') return null;
  if (message.type === 'chat_mute_state' && typeof message.muted !== 'boolean') return null;
  const muted = message.type === 'chat_muted' || message.muted === true;
  const parsedUntil = typeof message.mutedUntil === 'string' ? Date.parse(message.mutedUntil) : message.mutedUntil;
  const mutedUntil = typeof parsedUntil === 'number' && Number.isFinite(parsedUntil) && parsedUntil >= 0 && parsedUntil <= 8.64e15 ? parsedUntil : null;
  const remainingMs = typeof message.remainingMs === 'number' && Number.isFinite(message.remainingMs) && message.remainingMs >= 0 ? message.remainingMs : mutedUntil === null ? null : Math.max(0, mutedUntil - now);
  return { muted, mutedUntil: muted ? mutedUntil : null, remainingMs: muted ? remainingMs : 0, receivedAt: now, reason: muted && typeof message.reason === 'string' ? message.reason.slice(0, 500) : '' };
}

function remaining(state: ChatMuteState, now: number): number | null {
  return state.remainingMs === null ? null : Math.max(0, state.remainingMs - Math.max(0, now - state.receivedAt));
}
export function isChatMuteActive(state: ChatMuteState | null | undefined, now = Date.now()): boolean {
  // Missing timing cannot imply a permanent mute; the server checks any retry.
  return !!state?.muted && (remaining(state, now) ?? 0) > 0;
}
export function chatMuteLabel(state: ChatMuteState | null | undefined, now = Date.now()): string {
  if (!state?.muted) return '';
  const ms = remaining(state, now);
  return ms === null ? 'MUTED · server checks your next message' : ms > 0 ? `MUTED · ${Math.ceil(ms / 60000)}m remaining` : 'MUTE TIME ELAPSED · server checks your next message';
}
