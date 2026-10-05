import type { Message } from './protocol';

// The deployed server has AIPPY_AUTH_MODE=disabled. Capability names are not account verification.
export const ACCOUNT_FEATURES_REASON = 'Inventory, pickups and trading need verified Aippy accounts. Not available yet.';
export class AccountFeatures {
  readonly available = false;
  readonly reason = ACCOUNT_FEATURES_REASON;
  worldItems = new Map<string, Record<string, unknown>>();
  constructor(private transmit: (message: Message) => boolean) {}
  requestInventory(): boolean { return this.send({ type: 'inventory_get' }); }
  trade(message: Message): boolean { return this.send(message); }
  itemAction(message: Message): boolean { return this.send(message); }
  private send(message: Message): boolean { return this.available && this.transmit(message); }
  snapshotWorldItems(values: unknown[]): void {
    this.worldItems.clear();
    for (const value of values) this.add(value);
  }
  private add(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (typeof item.id === 'string') this.worldItems.set(item.id, item);
  }
  worldItemEvent(message: Message): void {
    if (message.type === 'item_spawn' || message.type === 'item_drop') this.add(message.item);
    else if (typeof message.itemId === 'string') this.worldItems.delete(message.itemId);
  }
}
