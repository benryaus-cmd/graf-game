import { DEFAULT_RENDER_SETTINGS, getRenderSettings, setRenderSettings, type RenderSettings } from './renderSettings';
export type MapId = 'original' | 'map2';
const KEY = 'graffciti.map.v1';
const listeners = new Set<() => void>();
let selected: MapId = 'original';
try {
    selected = localStorage.getItem(KEY) === 'map2' ? 'map2' : 'original';
}
catch { /* Local session still works. */ }
export const getMapId = () => selected;
export function readMapSky(map: MapId) { if (map === 'map2') ensureQuarterNightDefaults(); try {
    const sky = localStorage.getItem(`graffciti.map-sky.v1:${map}`);
    if (['day', 'sunset', 'pastel', 'rain', 'night'].includes(sky ?? ''))
        return sky as import('./worldTypes').SkyMode;
}
catch { /* Default below. */ } return map === 'map2' ? 'night' : 'day'; }
export function saveMapSky(map: MapId, sky: import('./worldTypes').SkyMode) { try {
    localStorage.setItem(`graffciti.map-sky.v1:${map}`, sky);
}
catch { /* Session choice still applies. */ } }
export const subscribeMap = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const paintChunkKey = (map: MapId, key: string) => map === 'original' ? key : `map2-v1:${key}`;
export const MORNING_PRESET: Readonly<RenderSettings> = { ...DEFAULT_RENDER_SETTINGS, renderScale: 1.1, fogDensity: .05, detailDistance: 69, horizonDistance: 68, skylineDistance: 400, skylineMinHeight: 5, skylineWidth: 1.2, exposure: .5, liveStrokeDistance: 5, streamBudgetMs: 1.5, retentionSeconds: 3, prefetchDistance: 12, groundChunks: 4, imageLoadDistance: 35, imageConcurrency: 1, ambientScale: .9, sunScale: 2, streetLights: false, lampPools: true, lampCount: 4, lampIntensity: 150, lampDistance: 40, lampRadius: 12, playerLight: true, playerLightIntensity: 10, fogCull: false, skyMatch: true, flatSky: false, customFog: false, heightLod: true, skyMode: 'game' };
// Adopt the new lighting once. Later sky and lighting choices remain user-owned.
const NIGHT_LIGHTING = { streetLights: true, lampPools: true, lampActivationDistance: 60, lampFadeDistance: 0, skyMode: 'game' as const };
export const NIGHT_PRESET: Readonly<RenderSettings> = { ...MORNING_PRESET, ...NIGHT_LIGHTING };
function ensureQuarterNightDefaults() {
    try {
        if (localStorage.getItem('graffciti.map2-night.v1')) return;
        const saved = JSON.parse(localStorage.getItem('graffciti.map-render.v1:map2') ?? 'null');
        const activeSaved = selected === 'map2' && localStorage.getItem('graffciti.render-settings.v1') ? getRenderSettings() : NIGHT_PRESET;
        const settings = { ...NIGHT_PRESET, ...(saved && typeof saved === 'object' ? saved : {}), ...(selected === 'map2' && localStorage.getItem('graffciti.render-settings.v1') ? activeSaved : {}), ...NIGHT_LIGHTING };
        localStorage.setItem('graffciti.map-render.v1:map2', JSON.stringify(settings));
        localStorage.setItem('graffciti.map-sky.v1:map2', 'night');
        if (selected === 'map2') setRenderSettings(settings);
        localStorage.setItem('graffciti.map2-night.v1', '1');
    } catch { /* Storage unavailable: apply the session default when entering Map 2. */ }
}
export function selectMap(map: MapId): void {
    if (map === 'map2') ensureQuarterNightDefaults();
    if (map === selected)
        return;
    let saved: Partial<RenderSettings> | null = null;
    try {
        localStorage.setItem(`graffciti.map-render.v1:${selected}`, JSON.stringify(getRenderSettings()));
        saved = JSON.parse(localStorage.getItem(`graffciti.map-render.v1:${map}`) ?? 'null');
        localStorage.setItem(KEY, map);
    }
    catch { /* Keep current session usable. */ }
    selected = map;
    setRenderSettings({ ...DEFAULT_RENDER_SETTINGS, ...(map === 'map2' ? NIGHT_PRESET : {}), ...(saved && typeof saved === 'object' ? saved : {}) });
    listeners.forEach(listener => listener());
}
