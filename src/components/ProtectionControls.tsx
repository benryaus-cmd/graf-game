import type { ProtectionQuote } from '@/multiplayer/protectionSync';
import { useEffect, useState } from 'react';

interface Props {
  balance: number | null;
  quote: ProtectionQuote | null;
  quotes: { unprotected: ProtectionQuote | null; protected: ProtectionQuote | null };
  protectionEnabled: boolean;
  pending: boolean;
  pendingPurchase: boolean;
  purchased: boolean;
  protectedUntil: number | null;
  notice: string | null;
  onQuote: () => void;
  onProtectionEnabledChange: (enabled: boolean) => void;
}

export default function ProtectionControls({ balance, quote, quotes, protectionEnabled, pending, pendingPurchase, purchased, protectedUntil, notice, onQuote, onProtectionEnabledChange }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (protectedUntil === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [protectedUntil]);
  const minutes = protectedUntil === null ? 0 : Math.max(0, Math.ceil((protectedUntil - now) / 60_000));
  const tooExpensive = quote !== null && balance !== null && quote.cost > balance;
  return <div className={`protection-controls${tooExpensive || quote && !quote.canPurchase ? ' is-invalid' : ''}`}>
    {protectedUntil !== null ? <small>PROTECTED · {Math.floor(minutes / 60)}h {minutes % 60}m remaining</small> : purchased ? <small>SERVER PURCHASE CONFIRMED</small> : <>
      <label className="protection-mode-toggle">
        <input type="checkbox" disabled={pendingPurchase || purchased} checked={protectionEnabled} onChange={event => onProtectionEnabledChange(event.currentTarget.checked)} />
        <span>PROTECT THIS PIECE</span>
      </label>
      <div className="protection-quote-options" aria-label="Server protection quotes">
        <span>UNPROTECTED · {quotes.unprotected ? `${quotes.unprotected.cost} credits · ${quoteDuration(quotes.unprotected.durationSeconds)}` : 'QUOTE PENDING'}</span>
        <span>PROTECTED · {quotes.protected ? `${quotes.protected.cost} credits · ${quoteDuration(quotes.protected.durationSeconds)}` : 'QUOTE PENDING'}</span>
      </div>
      {quote ? <span>{protectionEnabled ? 'Protected' : 'Unprotected'} quote · {quote.cost} credits · {(quote.durationSeconds / 3600).toFixed(1)} hours</span> : pending ? <span>Requesting server quote…</span> : <button type="button" onClick={onQuote}>GET QUOTES</button>}
      {pendingPurchase && <small role="status">WAITING FOR SERVER PURCHASE CONFIRMATION</small>}
      {quote && !quote.canPurchase && <small>SERVER QUOTE IS NOT PURCHASEABLE</small>}
      {tooExpensive && <small>NOT ENOUGH CREDITS</small>}
    </>}
    {notice && <small role="status">{notice}</small>}
  </div>;
}

const quoteDuration = (seconds: number) => seconds === 0 ? 'no expiry' : `${(seconds / 3600).toFixed(1)} hours`;
