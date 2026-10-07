import { useSyncExternalStore } from 'react';

export interface AssetPreviewPreference { model: 'original' | 'hoodie'; building: boolean }
const KEY = 'graffciti.asset-preview.v1';
export function normalizeAssetPreviewPreference(value: unknown): AssetPreviewPreference {
  const input = value as Partial<AssetPreviewPreference> | null;
  return { model: input?.model === 'hoodie' ? 'hoodie' : 'original', building: input?.building !== false };
}
function load(): AssetPreviewPreference {
  try { return normalizeAssetPreviewPreference(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
  catch { return normalizeAssetPreviewPreference(null); }
}
let preference = load();
const listeners = new Set<() => void>();
const subscribe = (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; };
export function setAssetPreviewPreference(value: AssetPreviewPreference): void {
  preference = normalizeAssetPreviewPreference(value);
  try { localStorage.setItem(KEY, JSON.stringify(preference)); } catch { /* Still works without storage. */ }
  listeners.forEach(callback => callback());
}
export function useAssetPreviewPreference(): AssetPreviewPreference {
  return useSyncExternalStore(subscribe, () => preference);
}
