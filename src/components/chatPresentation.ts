import type { ChatMessage } from '@/multiplayer/protocol';

export function unreadMessages(messages: ChatMessage[], seen: ReadonlySet<string>): number {
  return new Set(messages.filter(message => !seen.has(message.id)).map(message => message.id)).size;
}
export function isChatNearBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight <= 48;
}
