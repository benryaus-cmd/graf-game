import type { Message } from './protocol';

export interface ProtectionBounds { min: [number, number, number]; max: [number, number, number] }
export interface ProtectionQuote { pieceId: string; bounds: ProtectionBounds; protectionEnabled: boolean; cost: number; durationSeconds: number; canPurchase: boolean; balance: number; overlapPieceId: string | null }
export interface PieceProtection { pieceId: string; protectedUntil: number | null; addedSeconds?: number }
export interface ProtectionPurchaseRequest { pieceId: string; bounds: ProtectionBounds; protectionEnabled: boolean }
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
  currentPieceId: string | null = null;
  currentBounds: ProtectionBounds | null = null;
  currentProtectionEnabled = false;
  pendingQuotePieceId: string | null = null;
  pendingPurchasePieceId: string | null = null;
  notice: string | null = null;
  errorCode: ProtectionErrorCode | null = null;
  readonly protections = new Map<string, PieceProtection>();
  readonly purchases = new Map<string, ProtectionPurchaseRequest & { protectedUntil: number | null }>();
  private readonly quoteCache = new Map<string, ProtectionQuote>();
  private inFlightQuote: { pieceId: string; bounds: ProtectionBounds; protectionEnabled: boolean } | null = null;
  private desiredQuote: { pieceId: string; bounds: ProtectionBounds; protectionEnabled: boolean } | null = null;
  private queuedQuote: { pieceId: string; bounds: ProtectionBounds; protectionEnabled: boolean } | null = null;
  private quoteRequestedAt: number | null = null;
  private purchaseRequestedAt: number | null = null;
  private readonly timedOutPurchasePieceIds = new Set<string>();
  private readonly purchaseRequests = new Map<string, ProtectionPurchaseRequest & { balanceConfirmed: boolean }>();
  private readonly processedPurchaseAcks = new Set<string>();
  private quoteChannelBlocked = false;

  constructor(private readonly transmit: (message: Message) => boolean, private readonly onChange: () => void = () => {}, private readonly now: () => number = Date.now) {}

  get quote(): ProtectionQuote | null { return this.quoteCache.get(this.modeKey(this.currentProtectionEnabled)) ?? null; }
  get quotes(): { unprotected: ProtectionQuote | null; protected: ProtectionQuote | null } {
    return { unprotected: this.quoteCache.get('unprotected') ?? null, protected: this.quoteCache.get('protected') ?? null };
  }

  setCurrentBounds(pieceId: string | null, value: unknown, protectionEnabled = this.currentProtectionEnabled): boolean {
    const bounds = pieceId ? readBounds(value) : null;
    if (pieceId && !bounds) {
      this.currentPieceId = pieceId; this.currentBounds = null; this.quoteCache.clear();
      this.pendingQuotePieceId = null; this.desiredQuote = this.queuedQuote = null; this.notice = 'Selected bounds are invalid. Resize the area and try again.'; this.errorCode = 'invalid_bounds'; this.changed();
      return false;
    }
    const boundsChanged = this.currentPieceId !== pieceId || (pieceId && bounds && (!this.currentBounds || key(pieceId, bounds) !== key(this.currentPieceId ?? '', this.currentBounds)));
    const modeChanged = protectionEnabled !== this.currentProtectionEnabled;
    if (!boundsChanged && !modeChanged) return true;
    this.currentPieceId = pieceId;
    this.currentBounds = bounds;
    this.currentProtectionEnabled = protectionEnabled;
    if (boundsChanged) {
      this.quoteCache.clear();
      this.pendingQuotePieceId = null;
      this.notice = null;
    }
    this.errorCode = null;
    if (this.desiredQuote && (this.desiredQuote.pieceId !== pieceId || !bounds || key(this.desiredQuote.pieceId, this.desiredQuote.bounds) !== key(pieceId!, bounds))) this.desiredQuote = null;
    if (this.queuedQuote && (this.queuedQuote.pieceId !== pieceId || !bounds || key(this.queuedQuote.pieceId, this.queuedQuote.bounds) !== key(pieceId!, bounds))) this.queuedQuote = null;
    this.changed();
    return true;
  }

  requestQuote(pieceId: string, value: unknown, protectionEnabled = false): boolean {
    const bounds = readBounds(value);
    if (!pieceId || !bounds || !this.setCurrentBounds(pieceId, bounds, protectionEnabled)) return false;
    if (this.quoteChannelBlocked) {
      this.notice = 'Quote requests are paused after a timeout. Reconnect before requesting another quote.';
      this.changed(); return false;
    }
    const cached = this.quoteCache.get(this.modeKey(protectionEnabled));
    if (cached && key(cached.pieceId, cached.bounds) === key(pieceId, bounds)) { this.notice = null; this.errorCode = null; this.changed(); return true; }
    this.notice = null; this.errorCode = null;
    const request = { pieceId, bounds, protectionEnabled };
    if (this.inFlightQuote) { this.desiredQuote = request; this.queuedQuote = null; this.pendingQuotePieceId = pieceId; this.changed(); return true; }
    if (!this.sendQuote(request)) { this.changed(); return false; }
    this.changed(); return true;
  }

  requestBothQuotes(pieceId: string, value: unknown): boolean {
    const bounds = readBounds(value);
    if (!pieceId || !bounds || !this.setCurrentBounds(pieceId, bounds, this.currentProtectionEnabled)) return false;
    if (this.quoteChannelBlocked) return false;
    const requests = [this.currentProtectionEnabled, !this.currentProtectionEnabled]
      .filter(enabled => {
        const cached = this.quoteCache.get(this.modeKey(enabled));
        const cachedForBounds = cached && key(cached.pieceId, cached.bounds) === key(pieceId, bounds);
        const inFlightForBounds = this.inFlightQuote?.pieceId === pieceId && this.inFlightQuote.protectionEnabled === enabled && key(pieceId, this.inFlightQuote.bounds) === key(pieceId, bounds);
        return !cachedForBounds && !inFlightForBounds;
      })
      .map(protectionEnabled => ({ pieceId, bounds, protectionEnabled }));
    if (this.inFlightQuote) {
      this.desiredQuote = requests[0] ?? null;
      this.queuedQuote = requests[1] ?? null;
      this.pendingQuotePieceId = requests.length ? pieceId : null;
      this.changed(); return true;
    }
    if (!requests.length) return true;
    if (!this.sendQuote(requests[0])) { this.changed(); return false; }
    this.desiredQuote = requests[1] ?? null; this.queuedQuote = null; this.changed(); return true;
  }

  purchase(pieceId: string, value: unknown, protectionEnabled = this.currentProtectionEnabled): boolean {
    const bounds = readBounds(value);
    if (!pieceId || !bounds || this.currentPieceId !== pieceId || !this.currentBounds || key(pieceId, bounds) !== key(pieceId, this.currentBounds) || this.isPurchased(pieceId, bounds, protectionEnabled) ||
      protectionEnabled !== this.currentProtectionEnabled || !this.quote || this.quote.pieceId !== pieceId || this.quote.protectionEnabled !== protectionEnabled ||
      !this.quote.canPurchase || key(pieceId, this.quote.bounds) !== key(pieceId, bounds) || this.pendingPurchasePieceId || this.purchaseRequests.has(pieceId)) return false;
    if (!this.transmit({ type: 'protection_purchase', pieceId, bounds, protectionEnabled })) { this.notice = 'Purchase request could not be sent. Check your connection and try again.'; this.changed(); return false; }
    this.pendingPurchasePieceId = pieceId;
    this.purchaseRequests.set(pieceId, { pieceId, bounds: { min: [...bounds.min], max: [...bounds.max] }, protectionEnabled, balanceConfirmed: false });
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
      const cost = readCount(message.cost), durationSeconds = readCount(message.durationSeconds);
      const balance = readCount(message.balance);
      const canPurchase = typeof message.canPurchase === 'boolean' ? message.canPurchase : null;
      const overlapPieceId = message.overlapPieceId === null || message.overlapPieceId === undefined ? null : typeof message.overlapPieceId === 'string' ? message.overlapPieceId : undefined;
      if (!pieceId || cost === null || durationSeconds === null || balance === null || canPurchase === null || overlapPieceId === undefined || typeof message.protectionEnabled !== 'boolean' || !this.inFlightQuote || this.inFlightQuote.pieceId !== pieceId ||
        message.protectionEnabled !== this.inFlightQuote.protectionEnabled) return false;
      const completed = this.inFlightQuote;
      this.inFlightQuote = null; this.pendingQuotePieceId = null; this.quoteRequestedAt = null;
      const stillCurrent = this.currentPieceId === completed.pieceId && !!this.currentBounds && key(completed.pieceId, completed.bounds) === key(this.currentPieceId, this.currentBounds);
      if (stillCurrent) {
        const quote = { ...completed, cost, durationSeconds, canPurchase, balance, overlapPieceId };
        if (!this.isPurchased(completed.pieceId, completed.bounds, false) && !this.isPurchased(completed.pieceId, completed.bounds, true)) {
          this.quoteCache.set(this.modeKey(completed.protectionEnabled), quote);
          this.creditBalance = balance; this.notice = null; this.errorCode = null;
        }
      }
      this.continueQuotesForCurrentBounds();
      this.changed(); return true;
    }
    if (message.type === 'protection_purchased' || message.type === 'canvas_purchase_complete') {
      const pieceId = typeof message.pieceId === 'string' ? message.pieceId : '';
      const cost = readCount(message.cost), balance = readCount(message.balance);
      const protectionEnabled = typeof message.protectionEnabled === 'boolean' ? message.protectionEnabled : null;
      const protectedUntil = message.protectedUntil === null || message.protectedUntil === undefined ? null : readTime(message.protectedUntil);
      if (!pieceId || cost === null || balance === null || protectionEnabled === null || protectedUntil === undefined) return false;
      const fingerprint = `${message.type}:${pieceId}:${cost}:${balance}:${protectedUntil ?? 'null'}`;
      if (this.processedPurchaseAcks.has(fingerprint)) return true;
      const request = this.purchaseRequests.get(pieceId);
      if (!request || request.protectionEnabled !== protectionEnabled) return false;
      if (!request.balanceConfirmed) { this.creditBalance = balance; request.balanceConfirmed = true; }
      this.protections.set(pieceId, { pieceId, protectedUntil });
      if (this.pendingPurchasePieceId === pieceId) { this.pendingPurchasePieceId = null; this.purchaseRequestedAt = null; }
      this.timedOutPurchasePieceIds.delete(pieceId);
      if (!protectionEnabled || message.type === 'protection_purchased') this.purchaseRequests.delete(pieceId);
      this.processedPurchaseAcks.add(fingerprint);
      this.purchases.set(this.purchaseKey(request), { ...request, protectedUntil });
      this.quoteCache.clear();
      this.notice = 'Purchase confirmed by the server.'; this.errorCode = null; this.changed(); return true;
    }
    if (message.type === 'piece_protection_updated') {
      const pieceId = typeof message.pieceId === 'string' ? message.pieceId : '';
      const protectedUntil = message.protectedUntil === null ? null : readTime(message.protectedUntil), addedSeconds = readCount(message.addedSeconds);
      if (!pieceId || protectedUntil === undefined || addedSeconds === null) return false;
      this.protections.set(pieceId, { pieceId, protectedUntil, addedSeconds }); this.changed(); return true;
    }
    if (message.type === 'error') return this.acceptError(message);
    return false;
  }

  reset(): void {
    this.creditBalance = null; this.quoteCache.clear(); this.currentPieceId = null; this.currentBounds = null; this.currentProtectionEnabled = false;
    this.pendingQuotePieceId = null; this.pendingPurchasePieceId = null; this.notice = null;
    this.errorCode = null; this.inFlightQuote = null; this.desiredQuote = null; this.quoteRequestedAt = this.purchaseRequestedAt = null;
    this.timedOutPurchasePieceIds.clear(); this.purchaseRequests.clear(); this.purchases.clear(); this.processedPurchaseAcks.clear(); this.quoteChannelBlocked = false; this.protections.clear(); this.changed();
  }

  tick(now = this.now()): boolean {
    let timedOut = false;
    if (this.inFlightQuote && this.quoteRequestedAt !== null && now - this.quoteRequestedAt >= PROTECTION_REQUEST_TIMEOUT_MS) {
      this.inFlightQuote = null; this.desiredQuote = this.queuedQuote = null; this.pendingQuotePieceId = null; this.quoteRequestedAt = null;
      this.quoteChannelBlocked = true;
      this.quoteCache.clear(); this.notice = 'Quote request timed out. Reconnect before requesting another quote.'; this.errorCode = null; timedOut = true;
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
    return this.purchaseRequestFor(pieceId)?.bounds ?? null;
  }

  purchaseRequestFor(pieceId: string): ProtectionPurchaseRequest | null {
    const request = this.purchaseRequests.get(pieceId);
    return request ? { pieceId, protectionEnabled: request.protectionEnabled, bounds: { min: [...request.bounds.min], max: [...request.bounds.max] } } : null;
  }

  isPurchased(pieceId: string, value: unknown, protectionEnabled = this.currentProtectionEnabled): boolean {
    const bounds = readBounds(value);
    return !!bounds && this.purchases.has(this.purchaseKey({ pieceId, bounds, protectionEnabled }));
  }

  private sendQuote(request: { pieceId: string; bounds: ProtectionBounds; protectionEnabled: boolean }): boolean {
    if (this.quoteChannelBlocked) return false;
    if (!this.transmit({ type: 'protection_quote', pieceId: request.pieceId, bounds: request.bounds, protectionEnabled: request.protectionEnabled })) {
      this.pendingQuotePieceId = null; this.notice = 'Quote request could not be sent. Check your connection and try again.'; return false;
    }
    this.inFlightQuote = { pieceId: request.pieceId, bounds: { min: [...request.bounds.min], max: [...request.bounds.max] }, protectionEnabled: request.protectionEnabled };
    this.pendingQuotePieceId = request.pieceId;
    this.quoteRequestedAt = this.now();
    return true;
  }

  private acceptError(message: Message): boolean {
    const code = message.code;
    if (typeof code !== 'string' || !(code in protectionErrors)) return false;
    const relevantCode = code as ProtectionErrorCode;
    const pieceId = typeof message.pieceId === 'string' ? message.pieceId : undefined;
    const purchaseMatches = !!pieceId && !!this.pendingPurchasePieceId && pieceId === this.pendingPurchasePieceId;
    const matchedPurchaseId = purchaseMatches ? this.pendingPurchasePieceId : undefined;
    const timedOutPurchaseMatches = !!pieceId && this.timedOutPurchasePieceIds.has(pieceId);
    const quoteMatches = !!pieceId && !!this.inFlightQuote && pieceId === this.inFlightQuote.pieceId;
    if (!purchaseMatches && !timedOutPurchaseMatches && !quoteMatches) return false;
    if (purchaseMatches) { this.pendingPurchasePieceId = null; this.purchaseRequestedAt = null; }
    if (timedOutPurchaseMatches && pieceId) this.timedOutPurchasePieceIds.delete(pieceId);
    if (timedOutPurchaseMatches && pieceId) this.purchaseRequests.delete(pieceId);
    if (matchedPurchaseId) this.purchaseRequests.delete(matchedPurchaseId);
    if (quoteMatches && this.inFlightQuote) {
      this.pendingQuotePieceId = null; this.inFlightQuote = null; this.quoteRequestedAt = null;
    }
    this.notice = protectionErrors[relevantCode];
    this.errorCode = relevantCode;
    this.changed(); return true;
  }

  private changed(): void { this.onChange(); }
  private continueQuotesForCurrentBounds(): void {
    const pieceId = this.currentPieceId, bounds = this.currentBounds;
    if (!pieceId || !bounds || this.quoteChannelBlocked || this.isPurchased(pieceId, bounds, false) || this.isPurchased(pieceId, bounds, true)) { this.desiredQuote = this.queuedQuote = null; return; }
    const missing = [this.currentProtectionEnabled, !this.currentProtectionEnabled].filter(enabled => {
      if (this.isPurchased(pieceId, bounds, enabled)) return false;
      const cached = this.quoteCache.get(this.modeKey(enabled));
      const cachedForBounds = cached && key(cached.pieceId, cached.bounds) === key(pieceId, bounds);
      const flight = this.inFlightQuote;
      const inFlightForBounds = flight?.pieceId === pieceId && flight.protectionEnabled === enabled && key(pieceId, flight.bounds) === key(pieceId, bounds);
      return !cachedForBounds && !inFlightForBounds;
    }).map(protectionEnabled => ({ pieceId, bounds, protectionEnabled }));
    this.desiredQuote = missing[0] ?? null;
    this.queuedQuote = missing[1] ?? null;
    if (!this.inFlightQuote && this.desiredQuote) {
      const next = this.desiredQuote;
      this.desiredQuote = this.queuedQuote;
      this.queuedQuote = null;
      this.sendQuote(next);
    }
  }
  private modeKey(protectionEnabled: boolean): 'protected' | 'unprotected' { return protectionEnabled ? 'protected' : 'unprotected'; }
  private purchaseKey(request: ProtectionPurchaseRequest): string { return `${request.pieceId}:${key(request.pieceId, request.bounds)}:${this.modeKey(request.protectionEnabled)}`; }
}
