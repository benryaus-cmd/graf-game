import type { ChatMessage, Message } from './protocol';

export function readChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as ChatMessage;
  if (typeof v.id !== 'string' || !v.id || typeof v.playerId !== 'string' || typeof v.text !== 'string' || !Number.isFinite(v.timestamp) || Math.abs(v.timestamp) > 8.64e15) return null;
  return { id: v.id, playerId: v.playerId, displayName: typeof v.displayName === 'string' ? v.displayName.slice(0, 40) : 'PLAYER', text: v.text.slice(0, 500), timestamp: v.timestamp };
}

export class ChatSync {
  messages: ChatMessage[] = [];
  private lastSent = -Infinity;
  constructor(private transmit: (message: Message) => boolean, private changed: (messages: ChatMessage[]) => void) {}
  snapshot(values: unknown[]): void {
    this.messages = [];
    for (const value of values.slice(-100)) this.add(value, false);
    this.changed([...this.messages]);
  }
  accept(message: Message): void { this.add(message.message ?? message, true); }
  private add(value: unknown, notify: boolean): void {
    const message = readChatMessage(value);
    if (!message || this.messages.some(m => m.id === message.id)) return;
    this.messages = [...this.messages, message].sort((a,b) => a.timestamp - b.timestamp).slice(-100);
    if (notify) this.changed([...this.messages]);
  }
  send(value: string): boolean {
    const text = value.trim().slice(0, 500); const now = performance.now();
    if (!text || now - this.lastSent < 1000) return false;
    if (!this.transmit({ type: 'chat_message', text })) return false;
    this.lastSent = now; return true;
  }
  clear(): void { this.messages = []; this.lastSent = -Infinity; this.changed([]); }
}
