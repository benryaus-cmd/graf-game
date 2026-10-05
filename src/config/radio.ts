// Live streams must not enter Aippy's static aippy:preload asset list.
// Keep the endpoint in one config, assembled at runtime rather than scanned as a song file.
const CHILLHOP_RADIO = {
  origin: 'https://channels.fluxfm.de',
  path: '/chillhop/externalembedflxhp/stream',
  format: 'mp3',
};

export const RADIO_STREAM_URL = `${CHILLHOP_RADIO.origin}${CHILLHOP_RADIO.path}.${CHILLHOP_RADIO.format}`;
