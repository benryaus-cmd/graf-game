import { RADIO_STATIONS, type RadioStation } from '@/config/radio';

export interface LiveRadioAudio extends EventTarget {
  src: string;
  volume: number;
  preload: string;
  loop: boolean;
  paused: boolean;
  play: () => Promise<void>;
  pause: () => void;
  removeAttribute: (name: string) => void;
  load: () => void;
}

export interface LiveRadioState {
  playing: boolean;
  buffering: boolean;
  error: boolean;
  volume: number;
  stationId: string;
  stationName: string;
}

type AudioFactory = (url: string) => LiveRadioAudio;
type StateListener = (state: LiveRadioState) => void;

const clampVolume = (volume: number) => Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));

/** A lazily-created, reusable radio stream player with explicit lifecycle ownership. */
export class LiveRadioController {
  private audio: LiveRadioAudio | null = null;
  private listeners = new Set<StateListener>();
  private playRequest = 0;
  private disposed = false;
  private playRequested = false;
  private state: LiveRadioState;
  private readonly factory: AudioFactory;
  private readonly stations: RadioStation[];
  private activeStation: RadioStation;
  private readonly eventHandlers: Array<[string, EventListener]>;

  constructor(
    url: string,
    initialVolume: number,
    factory: AudioFactory = (source) => new Audio(source),
    stations: RadioStation[] = RADIO_STATIONS,
  ) {
    this.factory = factory;
    this.stations = stations;
    this.activeStation = stations.find((station) => station.url === url) ?? {
      id: 'custom', name: 'Live radio', color: '#7ee1aa', url,
    };
    this.state = {
      playing: false, buffering: false, error: false, volume: clampVolume(initialVolume),
      stationId: this.activeStation.id, stationName: this.activeStation.name,
    };
    this.eventHandlers = [
      ['playing', () => { if (this.playRequested && !this.audio?.paused) this.update({ playing: true, buffering: false, error: false }); }],
      ['waiting', () => { if (this.playRequested) this.update({ buffering: true }); }],
      ['stalled', () => { if (this.playRequested) this.update({ buffering: true }); }],
      ['canplay', () => this.update({ buffering: false })],
      ['pause', () => this.update({ playing: false, buffering: false })],
      ['ended', () => this.update({ playing: false, buffering: false })],
      ['error', () => { this.playRequested = false; this.update({ playing: false, buffering: false, error: true }); }],
    ];
  }

  getState(): LiveRadioState {
    return { ...this.state };
  }

  subscribe(listener: StateListener): () => void {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  toggle(): void {
    if (this.state.playing || this.state.buffering) this.pause();
    else this.play();
  }

  nextStation(): void {
    if (this.disposed || this.stations.length < 2) return;
    const currentIndex = this.stations.findIndex((station) => station.id === this.activeStation.id);
    const next = this.stations[(currentIndex + 1 + this.stations.length) % this.stations.length];
    this.selectStation(next.id);
  }

  selectStation(stationId: string): void {
    if (this.disposed) return;
    const station = this.stations.find((candidate) => candidate.id === stationId);
    if (!station || station.id === this.activeStation.id) return;
    const shouldResume = this.playRequested;
    this.playRequested = false;
    this.playRequest += 1;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = station.url;
      this.audio.preload = 'none';
    }
    this.activeStation = station;
    this.update({
      stationId: station.id, stationName: station.name,
      playing: false, buffering: false, error: false,
    });
    if (this.audio) {
      try {
        this.audio.load();
        if (shouldResume) this.play();
      } catch {
        this.playRequested = false;
        this.update({ playing: false, buffering: false, error: true });
      }
    }
  }

  /** Fetches stream metadata early without starting playback. */
  prepare(): void {
    if (this.disposed) return;
    try {
      const audio = this.getAudio();
      audio.preload = 'metadata';
      audio.load();
    } catch { this.update({ playing: false, buffering: false, error: true }); }
  }

  play(): void {
    if (this.disposed) return;
    const request = ++this.playRequest;
    this.playRequested = true;
    try {
      const audio = this.getAudio();
      if (this.state.error) audio.load();
      this.update({ playing: false, buffering: true, error: false });
      Promise.resolve(audio.play()).catch(() => {
        if (this.disposed || request !== this.playRequest) return;
        this.playRequested = false;
        this.update({ playing: false, buffering: false, error: true });
      });
    } catch {
      this.playRequested = false;
      if (request === this.playRequest) this.update({ playing: false, buffering: false, error: true });
    }
  }

  pause(): void {
    if (this.disposed) return;
    this.playRequested = false;
    this.playRequest += 1;
    this.audio?.pause();
    this.update({ playing: false, buffering: false });
  }

  setVolume(volume: number): void {
    if (this.disposed) return;
    const next = clampVolume(volume);
    if (this.audio) this.audio.volume = next;
    this.update({ volume: next });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playRequest += 1;
    if (this.audio) {
      this.audio.pause();
      this.eventHandlers.forEach(([type, handler]) => this.audio?.removeEventListener(type, handler));
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    this.listeners.clear();
  }

  private getAudio(): LiveRadioAudio {
    if (this.audio) return this.audio;
    const audio = this.factory(this.activeStation.url);
    audio.preload = 'none';
    audio.loop = true;
    audio.volume = this.state.volume;
    this.eventHandlers.forEach(([type, handler]) => audio.addEventListener(type, handler));
    this.audio = audio;
    return audio;
  }

  private update(change: Partial<LiveRadioState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...change };
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
