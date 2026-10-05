import type { Message } from './protocol';

export class WorldOrder {
  revision = 0;
  sequence = 0;
  snapshot(value: Message | Record<string, unknown>): void {
    this.sequence = Number.isSafeInteger(value.sequence) ? value.sequence as number : 0;
    this.revision = Number.isSafeInteger(value.revision) ? value.revision as number : 0;
  }
  accept(value: Message | Record<string, unknown>): boolean {
    for (const key of ['stroke', 'artwork', 'message', 'item']) {
      const nested = value[key];
      if (!Number.isSafeInteger(value.sequence) && nested && typeof nested === 'object') value = { ...value, ...nested };
    }
    if (!Number.isSafeInteger(value.sequence)) return true;
    const sequence = value.sequence as number;
    // The live server excludes the sender from stroke broadcasts. Its sequence is global,
    // so legitimate own writes create gaps in this connection's stream. WebSocket preserves
    // received message order; use monotonic ordering, not a contiguous-sequence assumption.
    if (sequence <= this.sequence) return false;
    this.sequence = sequence;
    if (Number.isSafeInteger(value.revision)) this.revision = value.revision as number;
    return true;
  }
}
