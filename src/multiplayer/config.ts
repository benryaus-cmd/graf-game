// The importer preserves .env; this fallback also works in an Aippy import without env setup.
export const MULTIPLAYER_URL = import.meta.env.VITE_MULTIPLAYER_URL || 'wss://24.144.88.205/multiplayer';
export const DEFAULT_ROOM_ID = 'public';
export const MAIN_ROOM_ID = 'morning-quarter-v1';
export const MAIN_WORLD_ID = 'map2-v1';
// Keep uploads on the same existing service; configurable for a later server/domain move.
export const ARTWORK_UPLOAD_URL = import.meta.env.VITE_ARTWORK_UPLOAD_URL || new URL('/artwork-upload', MULTIPLAYER_URL.replace(/^ws/, 'http')).href;
