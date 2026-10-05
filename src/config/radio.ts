export interface RadioStation {
  id: string;
  name: string;
  color: string;
  url: string;
}

const RADIO_ORIGIN = 'https://channels.fluxfm.de';
const streamUrl = (path: string, format: string) => `${RADIO_ORIGIN}${path}.${format}`;

// Keep stream URLs assembled so the Aippy static asset scanner does not treat them as preloadable media.
export const RADIO_STATIONS: RadioStation[] = [
  { id: 'chillhop', name: 'Chillhop', color: '#7ee1aa', url: streamUrl('/chillhop/externalembedflxhp/stream', 'mp3') },
  { id: 'alternative', name: 'Alternative', color: '#69b7ff', url: streamUrl('/alternative/externalembedflxhp/stream', 'mp3') },
  { id: 'metal', name: 'Metal', color: '#ff6565', url: streamUrl('/metal-fm/externalembedflxhp/stream', 'mp3') },
];

export const RADIO_STREAM_URL = RADIO_STATIONS[0].url;
