import { useEffect, useState } from 'react';
import { LiveRadioController, type LiveRadioState } from '@/game/liveRadio';

export interface RadioControlProps {
  url: string;
  initialVolume: number;
  controller?: LiveRadioController;
}

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

const RadioControl = ({ url, initialVolume, controller: externalController }: RadioControlProps) => {
  const [radio, setRadio] = useState<LiveRadioController | null>(null);
  const [radioState, setRadioState] = useState<LiveRadioState>({
    playing: false,
    buffering: false,
    error: false,
    volume: Math.max(0, Math.min(1, initialVolume)),
  });
  const [volumeOpen, setVolumeOpen] = useState(false);

  useEffect(() => {
    const controller = externalController ?? new LiveRadioController(url, initialVolume);
    const ownsController = !externalController;
    const unsubscribe = controller.subscribe(setRadioState);
    setRadio(controller);
    return () => {
      unsubscribe();
      if (ownsController) controller.dispose();
    };
  }, [url, initialVolume, externalController]);

  const status = radioState.error
    ? 'Radio unavailable. Tap to retry.'
    : radioState.buffering
      ? 'Connecting to live radio…'
      : radioState.playing
        ? 'Live radio playing'
        : 'Live radio paused';
  const buttonLabel = radioState.error ? 'Retry radio' : radioState.playing || radioState.buffering ? 'Pause radio' : 'Play radio';

  return (
    <div
      className="radio-control"
      aria-label="Live radio"
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
      onKeyDown={stop}
    >
      <button
        className="radio-button"
        type="button"
        aria-label={buttonLabel}
        aria-pressed={radioState.playing}
        title={status}
        onClick={() => radio?.toggle()}
      >
        {radioState.buffering ? <span className="radio-status-dot is-buffering" /> : <span className={`radio-status-dot${radioState.playing ? ' is-playing' : ''}`} />}
        <span>RADIO</span>
      </button>
      <button
        className="radio-volume-button"
        type="button"
        aria-label={volumeOpen ? 'Close radio volume control' : 'Open radio volume control'}
        aria-expanded={volumeOpen}
        onClick={() => setVolumeOpen((open) => !open)}
      >
        VOL
      </button>
      {volumeOpen && (
        <div className="radio-volume-popover" role="group" aria-label="Radio volume">
          <label>
            <span>{Math.round(radioState.volume * 100)}%</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(radioState.volume * 100)}
              aria-label="Radio volume"
              onChange={(event) => radio?.setVolume(Number(event.currentTarget.value) / 100)}
            />
          </label>
        </div>
      )}
      <span className="radio-sr-status" role="status" aria-live="polite">{status}</span>
    </div>
  );
};

export default RadioControl;
