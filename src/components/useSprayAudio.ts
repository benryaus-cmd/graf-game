import { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useAudioContext } from '@aippy/runtime/audio';

export function useSprayAudio(): {
  warmAudio: () => Promise<boolean>;
  playSpray: () => void;
  playChime: () => void;
  playBasketSwish: (volume: number) => void;
} {
  const { getAudioContext, unlock } = useAudioContext();
  const hissRef = useRef<Tone.NoiseSynth | null>(null);
  const chimeRef = useRef<Tone.Synth | null>(null);
  const basketRef = useRef<Tone.NoiseSynth | null>(null);
  const warmingRef = useRef<Promise<boolean> | null>(null);
  const lastSprayRef = useRef(0);

  const warmAudio = async (): Promise<boolean> => {
    if (hissRef.current && chimeRef.current && basketRef.current) return true;
    if (warmingRef.current) return warmingRef.current;
    const task = (async () => {
      const context = getAudioContext();
      if (!context) return false;
      try {
        await unlock();
        Tone.setContext(context);
        await Tone.start();
        hissRef.current = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.015, decay: 0.24, sustain: 0, release: 0.04 },
        }).toDestination();
        hissRef.current.volume.value = -19;
        chimeRef.current = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.08 },
        }).toDestination();
        chimeRef.current.volume.value = -17;
        basketRef.current = new Tone.NoiseSynth({
          noise: { type: 'pink' },
          envelope: { attack: 0.008, decay: 0.09, sustain: 0, release: 0.025 },
        }).toDestination();
        return true;
      } catch (error) {
        console.warn('[Aippy] Spray audio could not be started.', error);
        return false;
      }
    })();
    warmingRef.current = task;
    const ready = await task;
    if (!ready) warmingRef.current = null;
    return ready;
  };

  const playSpray = (): void => {
    const now = Date.now();
    if (now - lastSprayRef.current < 230) return;
    lastSprayRef.current = now;
    void warmAudio().then((ready) => {
      if (ready) hissRef.current?.triggerAttackRelease(0.3);
    });
  };

  const playChime = (): void => {
    void warmAudio().then((ready) => {
      if (ready) chimeRef.current?.triggerAttackRelease('C6', 0.14);
    });
  };

  const playBasketSwish = (volume: number): void => {
    const level = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    if (level === 0) return;
    void warmAudio().then(ready => {
      if (ready && basketRef.current) {
        basketRef.current.volume.value = -20 + 20 * Math.log10(level);
        basketRef.current.triggerAttackRelease(0.12);
      }
    });
  };

  useEffect(() => () => {
    hissRef.current?.dispose();
    chimeRef.current?.dispose();
    basketRef.current?.dispose();
    hissRef.current = null;
    chimeRef.current = null;
    basketRef.current = null;
    warmingRef.current = null;
  }, []);

  return { warmAudio, playSpray, playChime, playBasketSwish };
}
