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
export function readMapSky(map: MapId) { try {
    const sky = localStorage.getItem(`graffciti.map-sky.v1:${map}`);
    if (['day', 'sunset', 'pastel', 'rain', 'night'].includes(sky ?? ''))
        return sky as import('./worldTypes').SkyMode;
}
catch { /* Default below. */ } return map === 'map2' ? 'pastel' : 'day'; }
export function saveMapSky(map: MapId, sky: import('./worldTypes').SkyMode) { try {
    localStorage.setItem(`graffciti.map-sky.v1:${map}`, sky);
}
catch { /* Session choice still applies. */ } }
export const subscribeMap = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const paintChunkKey = (map: MapId, key: string) => map === 'original' ? key : `map2-v1:${key}`;
export const MORNING_PRESET: Readonly<RenderSettings> = { ...DEFAULT_RENDER_SETTINGS, renderScale: 1.1, fogDensity: .05, detailDistance: 69, horizonDistance: 68, skylineDistance: 400, skylineMinHeight: 5, skylineWidth: 1.2, exposure: .5, liveStrokeDistance: 5, streamBudgetMs: 1.5, retentionSeconds: 3, prefetchDistance: 12, groundChunks: 4, imageLoadDistance: 35, imageConcurrency: 1, ambientScale: .9, sunScale: 2, streetLights: false, lampPools: true, lampCount: 4, lampIntensity: 150, lampDistance: 40, lampRadius: 12, playerLight: true, playerLightIntensity: 10, fogCull: false, skyMatch: true, flatSky: false, customFog: false, heightLod: true, skyMode: 'game' };
export function selectMap(map: MapId): void {
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
    setRenderSettings({ ...DEFAULT_RENDER_SETTINGS, ...(map === 'map2' ? MORNING_PRESET : {}), ...(saved && typeof saved === 'object' ? saved : {}) });
    listeners.forEach(listener => listener());
}
