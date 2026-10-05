import type { Message } from './protocol';

export interface ProtectionBounds { min: [number, number, number]; max: [number, number, number] }
export interface ProtectionQuote { pieceId: string; bounds: ProtectionBounds; cost: number; durationSeconds: number }
export interface PieceProtection { pieceId: string; protectedUntil: number; addedSeconds?: number }
export type ProtectionErrorCode = 'insufficient_credits' | 'protected_area_overlap' | 'invalid_bounds' | 'piece_not_found' | 'not_piece_owner';
export const PROTECTION_REQUEST_TIMEOUT_MS = 12_000;

const protectionErrors: Record<ProtectionErrorCode, string> = {
  insufficient_credits: 'You do not have enough credits to protect this piece.',
  protected_area_overlap: 'This area overlaps another protected piece.',
  invalid_bounds: 'The selected area is invalid. Resize it and request a new quote.',
  piece_not_found: 'This graffiti piece is no longer available.',
  not_piece_owner: 'Only the piece owner can protect this graffiti.',
};

function readBounds(value: unknown): ProtectionBounds | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const vector = (raw: unknown): [number, number, number] | null => Array.isArray(raw) && raw.length === 3 && raw.every(n => typeof n === 'number' && Number.isFinite(n))
    ? [raw[0], raw[1], raw[2]] : null;
  const min = vector(candidate.min), max = vector(candidate.max);
  if (!min || !max || min.some((n, axis) => n > max[axis])) return null;
  return { min, max };
}
function key(pieceId: string, bounds: ProtectionBounds): string { return `${pieceId}:${bounds.min.join(',')}:${bounds.max.join(',')}`; }
function readTime(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.length <= 64) { const parsed = Date.parse(value); if (Number.isFinite(parsed) && parsed >= 0) return parsed; }
  return null;
}
function readCount(value: unknown, positive = false): number | null {
  return Number.isSafeInteger(value) && (value as number) >= (positive ? 1 : 0) ? value as number : null;
}

/** Tracks server-confirmed quotes and purchases. Requests only mark pending state; they never charge credits locally. */
export class ProtectionSync {
  creditBalance: number | null = null;
  quote: ProtectionQuote | null = null;
  currentPieceId: string | null = null;
  currentBounds: ProtectionBounds | null = null;
  pendingQuotePieceId: string | null = null;
  pendingPurchasePieceId: string | null = null;
  notice: string | null = null;
  errorCode: ProtectionErrorCode | null = null;
  readonly protections = new Map<string, PieceProtection>();
  private inFlightQuote: { pieceId: string; bounds: ProtectionBounds } | null = null;
  private desiredQuote: { pieceId: string; bounds: ProtectionBounds } | null = null;
  private quoteRequestedAt: number | null = null;
  private purchaseRequestedAt: number | null = null;
  private readonly timedOutPurchasePieceIds = new Set<string>();
  private readonly purchaseRequests = new Map<string, ProtectionBounds>();
  private quoteChannelBlocked = false;

  constructor(private readonly transmit: (message: Message) => boolean, private readonly onChange: () => void = () => {}, private readonly now: () => number = Date.now) {}

  setCurrentBounds(pieceId: string | null, value: unknown): boolean {
    const bounds = pieceId ? readBounds(value) : null;
    if (pieceId && !bounds) {
      this.currentPieceId = pieceId; this.currentBounds = null; this.quote = null;
      this.pendingQuotePieceId = null; this.desiredQuote = null; this.notice = 'Selected bounds are invalid. Resize the area and try again.'; this.errorCode = 'invalid_bounds'; this.changed();
      return false;
    }
    const changed = this.currentPieceId !== pieceId || (pieceId && bounds && (!this.currentBounds || key(pieceId, bounds) !== key(this.currentPieceId ?? '', this.currentBounds)));
    if (!changed) return true;
    this.currentPieceId = pieceId;
    this.currentBounds = bounds;
    this.quote = null;
    this.pendingQuotePieceId = null;
    this.notice = null;
    this.errorCode = null;
    if (this.desiredQuote && (this.desiredQuote.pieceId !== pieceId || !bounds || key(this.desiredQuote.pieceId, this.desiredQuote.bounds) !== key(pieceId!, bounds))) this.desiredQuote = null;
    this.changed();
    return true;
  }

  requestQuote(pieceId: string, value: unknown): boolean {
    const bounds = readBounds(value);
    if (!pieceId || !bounds || !this.setCurrentBounds(pieceId, bounds)) return false;
    if (this.quoteChannelBlocked) {
      this.notice = 'Quote requests are paused after a timeout. Reconnect before requesting another quote.';
      this.changed(); return false;
    }
    this.quote = null; this.notice = null; this.errorCode = null;
    const request = { pieceId, bounds };
    if (this.inFlightQuote) { this.desiredQuote = request; this.pendingQuotePieceId = pieceId; this.changed(); return true; }
    if (!this.sendQuote(request)) { this.changed(); return false; }
    this.changed(); return true;
  }

  purchase(pieceId: string, value: unknown): boolean {
    const bounds = readBounds(value);
    if (!pieceId || !bounds || this.currentPieceId !== pieceId || !this.currentBounds || key(pieceId, bounds) !== key(pieceId, this.currentBounds) ||
      !this.quote || this.quote.pieceId !== pieceId || key(pieceId, this.quote.bounds) !== key(pieceId, bounds) || this.pendingPurchasePieceId || this.purchaseRequests.has(pieceId)) return false;
    if (!this.transmit({ type: 'protection_purchase', pieceId, bounds })) { this.notice = 'Purchase request could not be sent. Check your connection and try again.'; this.changed(); return false; }
    this.pendingPurchasePieceId = pieceId;
    this.purchaseRequests.set(pieceId, { min: [...bounds.min], max: [...bounds.max] });
    this.purchaseRequestedAt = this.now();
    this.notice = 'Purchase requested. Waiting for server confirmation.';
    this.errorCode = null;
    this.changed(); return true;
  }

  accept(message: Message): boolean {
    if (message.type === 'account_state') {
      const balance = readCount(message.credits);
      if (balance === null) return false;
      // Account role/name data is intentionally left to the caller; this helper only records credits.
      this.creditBalance = balance; this.changed(); return true;
    }
    if (message.type === 'credit_balance') {
      const balance = readCount(message.balance);
      if (balance === null) return false;
      this.creditBalance = balance; this.changed(); return true;
    }
    if (message.type === 'protection_quote_result') {
      const pieceId = typeof message.pieceId === 'string' ? message.pieceId : '';
      const cost = readCount(message.cost), durationSeconds = readCount(message.durationSeconds, true);
      if (!pieceId || cost === null || durationSeconds === null || !this.inFlightQuote || this.inFlightQuote.pieceId !== pieceId) return false;
      const completed = this.inFlightQuote;
      this.inFlightQuote = null; this.pendingQuotePieceId = null; this.quoteRequestedAt = null;
      const stillCurrent = this.currentPieceId === completed.pieceId && !!this.currentBounds && key(completed.pieceId, completed.bounds) === key(this.currentPieceId, this.currentBounds);
      if (stillCurrent) { this.quote = { ...completed, cost, durationSeconds }; this.notice = null; this.errorCode = null; }
      const queued = this.desiredQuote; this.desiredQuote = null;
      if (queued && this.currentPieceId === queued.pieceId && this.currentBounds && key(queued.pieceId, queued.bounds) === key(this.currentPieceId, this.currentBounds) && key(queued.pieceId, queued.bounds) !== key(completed.pieceId, completed.bounds)) {
        if (this.sendQuote(queued)) this.pendingQuotePieceId = queued.pieceId;
      }
      this.changed(); return true;
    }
    if (message.type === 'protection_purchased') {
      const pieceId = typeof message.pieceId === 'string' ? message.pieceId : '';
      const cost = readCount(message.cost), balance = readCount(message.balance), protectedUntil = readTime(message.protectedUntil);
      if (!pieceId || cost === null || balance === null || protectedUntil === null || !this.purchaseRequests.has(pieceId)) return false;
      this.creditBalance = balance;
      this.protections.set(pieceId, { pieceId, protectedUntil });
      if (this.pendingPurchasePieceId === pieceId) { this.pendingPurchasePieceId = null; this.purchaseRequestedAt = null; }
      this.timedOutPurchasePieceIds.delete(pieceId);
      this.purchaseRequests.delete(pieceId);
      this.quote = null; this.notice = 'Protection purchased and confirmed by the server.'; this.errorCode = null; this.changed(); return true;
    }
    if (message.type === 'piece_protection_updated') {
      const pieceId = typeof message.pieceId === 'string' ? message.pieceId : '';
      const protectedUntil = readTime(message.protectedUntil), addedSeconds = readCount(message.addedSeconds, true);
      if (!pieceId || protectedUntil === null || addedSeconds === null) return false;
      this.protections.set(pieceId, { pieceId, protectedUntil, addedSeconds }); this.changed(); return true;
    }
    if (message.type === 'error') return this.acceptError(message);
    return false;
  }

  reset(): void {
    this.creditBalance = null; this.quote = null; this.currentPieceId = null; this.currentBounds = null;
    this.pendingQuotePieceId = null; this.pendingPurchasePieceId = null; this.notice = null;
    this.errorCode = null; this.inFlightQuote = null; this.desiredQuote = null; this.quoteRequestedAt = this.purchaseRequestedAt = null;
    this.timedOutPurchasePieceIds.clear(); this.purchaseRequests.clear(); this.quoteChannelBlocked = false; this.protections.clear(); this.changed();
  }

  tick(now = this.now()): boolean {
    let timedOut = false;
    if (this.inFlightQuote && this.quoteRequestedAt !== null && now - this.quoteRequestedAt >= PROTECTION_REQUEST_TIMEOUT_MS) {
      this.inFlightQuote = null; this.desiredQuote = null; this.pendingQuotePieceId = null; this.quoteRequestedAt = null;
      this.quoteChannelBlocked = true;
      this.quote = null; this.notice = 'Quote request timed out. Reconnect before requesting another quote.'; this.errorCode = null; timedOut = true;
    }
    if (this.pendingPurchasePieceId && this.purchaseRequestedAt !== null && now - this.purchaseRequestedAt >= PROTECTION_REQUEST_TIMEOUT_MS) {
      this.timedOutPurchasePieceIds.add(this.pendingPurchasePieceId);
      this.pendingPurchasePieceId = null; this.purchaseRequestedAt = null;
      this.notice = 'Purchase was not confirmed. Check the server balance before trying again.'; this.errorCode = null; timedOut = true;
    }
    if (timedOut) this.changed();
    return timedOut;
  }

  purchaseBoundsFor(pieceId: string): ProtectionBounds | null {
    const bounds = this.purchaseRequests.get(pieceId);
    return bounds ? { min: [...bounds.min], max: [...bounds.max] } : null;
  }

  private sendQuote(request: { pieceId: string; bounds: ProtectionBounds }): boolean {
    if (!this.transmit({ type: 'protection_quote', pieceId: request.pieceId, bounds: request.bounds })) {
      this.pendingQuotePieceId = null; this.notice = 'Quote request could not be sent. Check your connection and try again.'; return false;
    }
    this.inFlightQuote = { pieceId: request.pieceId, bounds: { min: [...request.bounds.min], max: [...request.bounds.max] } };
    this.pendingQuotePieceId = request.pieceId;
    this.quoteRequestedAt = this.now();
    return true;
  }

  private acceptError(message: Message): boolean {
    const code = message.code;
    if (typeof code !== 'string' || !(code in protectionErrors)) return false;
    const relevantCode = code as ProtectionErrorCode;
    const pieceId = typeof message.pieceId === 'string' ? message.pieceId : undefined;
    const purchaseMatches = !!this.pendingPurchasePieceId && (!pieceId || pieceId === this.pendingPurchasePieceId);
    const matchedPurchaseId = purchaseMatches ? this.pendingPurchasePieceId : undefined;
    const timedOutPurchaseMatches = !!pieceId && this.timedOutPurchasePieceIds.has(pieceId);
    const quoteMatches = !!this.inFlightQuote && (!pieceId || pieceId === this.inFlightQuote.pieceId);
    if (!purchaseMatches && !timedOutPurchaseMatches && !quoteMatches) return false;
    if (purchaseMatches) { this.pendingPurchasePieceId = null; this.purchaseRequestedAt = null; }
    if (timedOutPurchaseMatches && pieceId) this.timedOutPurchasePieceIds.delete(pieceId);
    if (timedOutPurchaseMatches && pieceId) this.purchaseRequests.delete(pieceId);
    if (matchedPurchaseId) this.purchaseRequests.delete(matchedPurchaseId);
    if (quoteMatches && this.inFlightQuote) {
      const completed = this.inFlightQuote;
      this.pendingQuotePieceId = null; this.inFlightQuote = null; this.quoteRequestedAt = null;
      const queued = this.desiredQuote; this.desiredQuote = null;
      if (queued && this.currentPieceId === queued.pieceId && this.currentBounds && key(queued.pieceId, queued.bounds) === key(this.currentPieceId, this.currentBounds) && key(queued.pieceId, queued.bounds) !== key(completed.pieceId, completed.bounds)) {
        if (this.sendQuote(queued)) this.pendingQuotePieceId = queued.pieceId;
      }
    }
    this.notice = protectionErrors[relevantCode];
    this.errorCode = relevantCode;
    this.changed(); return true;
  }

  private changed(): void { this.onChange(); }
}
