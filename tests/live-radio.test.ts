import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveRadioController, type LiveRadioAudio } from '../src/game/liveRadio';
import { RADIO_STATIONS, RADIO_STREAM_URL } from '../src/config/radio';

class FakeAudio extends EventTarget implements LiveRadioAudio {
  volume = 1;
  preload = '';
  loop = false;
  paused = true;
  source = 'stream';
  get src() { return this.source; }
  set src(value: string) { this.source = value; }
  pauseCalls = 0;
  loadCalls = 0;
  listeners = new Map<string, Set<EventListener>>();
  playResult: Promise<void> = Promise.resolve();

  play(): Promise<void> {
    this.paused = false;
    return this.playResult;
  }

  pause(): void {
    this.paused = true;
    this.pauseCalls += 1;
    this.dispatchEvent(new Event('pause'));
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.source = '';
  }

  load(): void { this.loadCalls += 1; }

  addEventListener(type: string, callback: EventListener | null, options?: boolean | AddEventListenerOptions): void {
    super.addEventListener(type, callback, options);
    if (callback) {
      const set = this.listeners.get(type) ?? new Set<EventListener>();
      set.add(callback);
      this.listeners.set(type, set);
    }
  }

  removeEventListener(type: string, callback: EventListener | null, options?: boolean | EventListenerOptions): void {
    super.removeEventListener(type, callback, options);
    if (callback) this.listeners.get(type)?.delete(callback);
  }
}

test('radio is lazy and reuses one looping, preload-none audio element across play and pause', async () => {
  let creations = 0;
  let audio: FakeAudio | undefined;
  const controller = new LiveRadioController('https://radio.example/stream', 0.4, (url) => {
    creations += 1;
    assert.equal(url, 'https://radio.example/stream');
    audio = new FakeAudio();
    return audio;
  });
  assert.equal(creations, 0);
  controller.setVolume(0.7);
  assert.equal(creations, 0);
  controller.play();
  assert.equal(creations, 1);
  assert.equal(audio?.preload, 'none');
  assert.equal(audio?.loop, true);
  assert.equal(audio?.volume, 0.7);
  audio?.dispatchEvent(new Event('playing'));
  assert.equal(controller.getState().playing, true);
  controller.pause();
  assert.equal(controller.getState().playing, false);
  controller.play();
  assert.equal(creations, 1);
  controller.dispose();
});

test('prepare loads metadata without autoplay and the first play reuses that same element', () => {
  let creations = 0;
  const audio = new FakeAudio();
  const controller = new LiveRadioController('stream', 0.5, () => {
    creations += 1;
    return audio;
  });
  controller.prepare();
  assert.equal(creations, 1);
  assert.equal(audio.preload, 'metadata');
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.paused, true);
  audio.dispatchEvent(new Event('stalled'));
  assert.equal(controller.getState().buffering, false);
  controller.toggle();
  assert.equal(creations, 1);
  assert.equal(audio.paused, false);
  controller.dispose();
});

test('late radio events after pause cannot restart the playing indicator', () => {
  const audio = new FakeAudio();
  const controller = new LiveRadioController('stream', .5, () => audio);
  controller.play(); controller.pause();
  audio.dispatchEvent(new Event('playing'));
  audio.dispatchEvent(new Event('stalled'));
  assert.equal(controller.getState().playing, false);
  assert.equal(controller.getState().buffering, false);
  controller.dispose();
});

test('play rejection and media error are handled as compact retryable state', async () => {
  const audio = new FakeAudio();
  audio.playResult = Promise.reject(new Error('autoplay or network blocked'));
  const controller = new LiveRadioController('stream', 1, () => audio);
  controller.play();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(controller.getState().error, true);
  audio.playResult = Promise.resolve();
  controller.play();
  audio.dispatchEvent(new Event('error'));
  assert.equal(controller.getState().error, true);
  controller.dispose();
});

test('dispose pauses, removes listeners and releases the stream source', () => {
  const audio = new FakeAudio();
  const controller = new LiveRadioController('stream', 0.5, () => audio);
  let notifications = 0;
  controller.subscribe(() => { notifications += 1; });
  controller.play();
  const beforeDispose = notifications;
  controller.dispose();
  assert.equal(audio.paused, true);
  assert.equal(audio.source, '');
  assert.equal(audio.loadCalls, 1);
  assert.ok(audio.pauseCalls >= 1);
  assert.equal([...audio.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  audio.dispatchEvent(new Event('playing'));
  assert.equal(notifications, beforeDispose);
  controller.play();
  assert.equal(notifications, beforeDispose);
});

test('channel cycling reuses one audio element, preserves volume, and does not autoplay while paused', () => {
  let creations = 0;
  const audio = new FakeAudio();
  const controller = new LiveRadioController(RADIO_STREAM_URL, 0.4, () => {
    creations += 1;
    return audio;
  });

  controller.setVolume(0.63);
  controller.prepare();
  controller.nextStation();
  assert.equal(controller.getState().stationId, RADIO_STATIONS[1].id);
  assert.equal(controller.getState().stationName, RADIO_STATIONS[1].name);
  assert.equal(audio.source, RADIO_STATIONS[1].url);
  assert.equal(audio.volume, 0.63);
  assert.equal(audio.paused, true);
  assert.equal(creations, 1);

  controller.nextStation();
  assert.equal(controller.getState().stationId, RADIO_STATIONS[2].id);
  assert.equal(audio.source, RADIO_STATIONS[2].url);
  assert.equal(audio.paused, true);
  assert.equal(creations, 1);
  controller.dispose();
});

test('channel cycling keeps playback intent through a pending browser play request', () => {
  const audio = new FakeAudio();
  audio.playResult = new Promise<void>(() => undefined);
  const controller = new LiveRadioController(RADIO_STREAM_URL, 0.4, () => audio);
  controller.play();
  audio.paused = true;
  controller.nextStation();
  assert.equal(audio.source, RADIO_STATIONS[1].url);
  assert.equal(audio.paused, false);
  assert.equal(controller.getState().buffering, true);
  controller.dispose();
});
