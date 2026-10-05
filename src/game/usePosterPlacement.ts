import { useRef, useState } from 'react';

export interface PosterPlacementRequest {
  sequence: number;
  dataUrl: string;
}

export function usePosterPlacement() {
  const [placement, setPlacement] = useState<PosterPlacementRequest | null>(null);
  const [size, setSize] = useState(1.4);
  const [valid, setValid] = useState(false);
  const [commitSignal, setCommitSignal] = useState(0);
  const sequence = useRef(0);

  const start = (dataUrl: string, nextSize: number) => {
    sequence.current += 1;
    setSize(nextSize);
    setValid(false);
    setPlacement({ sequence: sequence.current, dataUrl });
  };
  const changeSize = (nextSize: number) => {
    const safeSize = Math.max(0.4, Math.min(4, nextSize));
    setSize(safeSize);
  };
  const requestCommit = () => setCommitSignal((current) => current + 1);
  const cancel = () => {
    setPlacement(null);
    setValid(false);
  };
  const complete = (requestId: number, placed: boolean) => {
    if (!placed) return;
    setPlacement((current) => current?.sequence === requestId ? null : current);
    setValid(false);
  };

  return {
    placement, size, valid, commitSignal, start, changeSize, requestCommit, cancel,
    setValid, complete,
  };
}