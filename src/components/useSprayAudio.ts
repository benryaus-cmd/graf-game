import { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useAudioContext } from '@aippy/runtime/audio';

export function useSprayAudio(): {
  warmAudio: () => Promise<boolean>;
  playSpray: () => void;
  playChime: () => void;
} {
  const { getAudioContext, unlock } = useAudioContext();
  const hissRef = useRef<Tone.NoiseSynth | null>(null);
  const chimeRef = useRef<Tone.Synth | null>(null);
  const warmingRef = useRef<Promise<boolean> | null>(null);
  const lastSprayRef = useRef(0);

  const warmAudio = async (): Promise<boolean> => {
    if (hissRef.current && chimeRef.current) return true;
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

  useEffect(() => () => {
    hissRef.current?.dispose();
    chimeRef.current?.dispose();
    hissRef.current = null;
    chimeRef.current = null;
    warmingRef.current = null;
  }, []);

  return { warmAudio, playSpray, playChime };
}