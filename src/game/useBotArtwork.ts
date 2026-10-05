import { useRef, useState, useEffect } from 'react';
import { generateBotArtwork } from '@/game/generateBotArtwork';

export interface BotArtworkRequest {
  sequence: number;
  botIndex: number;
  dataUrl: string;
}

interface PendingArtwork {
  resolve: (placed: boolean) => void;
  timeout: number;
}

export function useBotArtwork() {
  const [artworkRequest, setArtworkRequest] = useState<BotArtworkRequest | null>(null);
  const sequence = useRef(0);
  const pending = useRef(new Map<number, PendingArtwork>());

  const completeArtwork = (requestId: number, placed: boolean) => {
    const task = pending.current.get(requestId);
    if (task) {
      window.clearTimeout(task.timeout);
      pending.current.delete(requestId);
      task.resolve(placed);
    }
    setArtworkRequest((current) => current?.sequence === requestId ? null : current);
  };

  const requestArtwork = async (description: string, botIndex: number): Promise<boolean> => {
    const dataUrl = await generateBotArtwork(description);
    const requestId = sequence.current + 1;
    sequence.current = requestId;
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => completeArtwork(requestId, false), 18000);
      pending.current.set(requestId, { resolve, timeout });
      setArtworkRequest({ sequence: requestId, botIndex, dataUrl });
    });
  };

  useEffect(() => () => {
    pending.current.forEach((task) => {
      window.clearTimeout(task.timeout);
      task.resolve(false);
    });
    pending.current.clear();
  }, []);

  return { artworkRequest, requestArtwork, completeArtwork };
}