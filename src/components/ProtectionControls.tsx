import type { ProtectionQuote } from '@/multiplayer/protectionSync';
import { useEffect, useState } from 'react';

interface Props {
  balance: number | null;
  quote: ProtectionQuote | null;
  pending: boolean;
  protectedUntil: number | null;
  notice: string | null;
  onQuote: () => void;
  onPurchase: () => void;
}

export default function ProtectionControls({ balance, quote, pending, protectedUntil, notice, onQuote, onPurchase }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (protectedUntil === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [protectedUntil]);
  const minutes = protectedUntil === null ? 0 : Math.max(0, Math.ceil((protectedUntil - now) / 60_000));
  const tooExpensive = quote !== null && balance !== null && quote.cost > balance;
  return <div className={`protection-controls${tooExpensive ? ' is-invalid' : ''}`}>
    {protectedUntil !== null ? <small>PROTECTED · {Math.floor(minutes / 60)}h {minutes % 60}m remaining</small> : <>
      <small>UNPROTECTED · optional paid protection</small>
      <span>{quote ? `Protection cost: ${quote.cost} credits · ${(quote.durationSeconds / 3600).toFixed(1)} hours` : pending ? 'Requesting server quote…' : 'Protection price awaits server quote'}</span>
      {!quote && !pending && <button type="button" onClick={onQuote}>GET QUOTE</button>}
      <button type="button" disabled={pending || !quote || balance === null || tooExpensive} onClick={onPurchase}>{pending ? 'WAITING FOR SERVER' : 'PROTECT'}</button>
      {tooExpensive && <small>NOT ENOUGH CREDITS</small>}
    </>}
    {notice && <small role="status">{notice}</small>}
  </div>;
}
