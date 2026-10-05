import { useEffect, useRef, useState } from 'react';

export default function CanvasCredits({ balance }: { balance: number | null }) {
  const previous = useRef<number | null>(null);
  const [gain, setGain] = useState(0);
  useEffect(() => {
    const delta = balance !== null && previous.current !== null ? balance - previous.current : 0;
    previous.current = balance;
    setGain(Math.max(0, delta));
    if (delta <= 0) return;
    const timer = window.setTimeout(() => setGain(0), 2500);
    return () => window.clearTimeout(timer);
  }, [balance]);
  return <span className="canvas-credit-status" aria-label="Canvas credits">
    CREDITS {balance === null ? '—' : balance.toLocaleString()}
    {gain > 0 && <b className="canvas-credit-gain" role="status">+{gain}</b>}
  </span>;
}
