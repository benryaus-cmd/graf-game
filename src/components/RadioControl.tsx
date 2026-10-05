import { useEffect, useState, type CSSProperties } from 'react';
import { LiveRadioController, type LiveRadioState } from '@/game/liveRadio';
import { RADIO_STATIONS } from '@/config/radio';

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
    stationId: RADIO_STATIONS.find(station => station.url === url)?.id ?? 'custom',
    stationName: RADIO_STATIONS.find(station => station.url === url)?.name ?? 'Live radio',
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
        className="radio-channel-button"
        type="button"
        aria-label={`Change channel and play radio. Current channel: ${radioState.stationName}`}
        title={`${radioState.stationName} · ${status}. Press to change channel and play.`}
        onClick={() => radio?.nextStation(true)}
        style={{ '--radio-station-color': RADIO_STATIONS.find((station) => station.id === radioState.stationId)?.color ?? '#7ee1aa' } as CSSProperties}
      >
        <i aria-hidden="true" />
        <span>{radioState.stationName.toUpperCase()}</span>
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
