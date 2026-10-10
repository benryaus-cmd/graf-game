import { useEffect, useState, type CSSProperties } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { LiveRadioController, LiveRadioState } from '@/game/liveRadio';
import { RADIO_STATIONS } from '@/config/radio';

const LABEL: Record<string, string> = { chillhop: 'C', alternative: 'A', metal: 'M' };

/** Compact live station selector and mute, sharing the Settings radio controller. */
export default function RadioQuickControl({ controller }: { controller: LiveRadioController | null }) {
  const [state, setState] = useState<LiveRadioState | null>(controller?.getState() ?? null);
  useEffect(() => {
    if (!controller) { setState(null); return; }
    return controller.subscribe(setState);
  }, [controller]);
  const active = !!state && !state.error && (state.playing || state.buffering);
  const station = RADIO_STATIONS.find(item => item.id === state?.stationId);
  const label = active ? (LABEL[state!.stationId] ?? '?') : '-';
  return (
    <div className="hud-radio" data-muted={!active} aria-label="Live music radio"
      style={{ '--hud-radio-color': station?.color ?? '#7ee1aa' } as CSSProperties}>
      <button type="button" className="hud-radio-channel" disabled={!controller}
        aria-label={active ? `Change music channel. Current: ${state?.stationName}` : 'Select music channel and play'}
        title={active ? `${state?.stationName} · Tap to change` : 'Music off · Tap to start'}
        onClick={() => { if (!controller) return; if (active) controller.nextStation(true); else controller.play(); }}>
        {label}
      </button>
      <button type="button" className="hud-radio-speaker" disabled={!controller}
        aria-label={active ? 'Mute music radio' : 'Unmute music radio'}
        title={active ? 'Mute' : 'Unmute'}
        onClick={() => { if (!controller) return; if (active) controller.pause(); else controller.play(); }}>
        {active ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      </button>
    </div>
  );
}
