// The importer preserves .env; this fallback also works in an Aippy import without env setup.
export const MULTIPLAYER_URL = import.meta.env.VITE_MULTIPLAYER_URL || 'wss://24.144.88.205/multiplayer';
export const DEFAULT_ROOM_ID = 'public';
