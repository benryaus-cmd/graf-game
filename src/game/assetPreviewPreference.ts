import { useSyncExternalStore } from 'react';
import { SELECTABLE_CHARACTER_MODELS, isCharacterModelId, normalizeCharacterModelId, type CharacterModelId } from './characterCatalog';

export interface AssetPreviewPreference { model: CharacterModelId; building: boolean }
const KEY = 'graffciti.asset-preview.v1';
export function normalizeAssetPreviewPreference(value: unknown): AssetPreviewPreference {
  const input = value as Partial<AssetPreviewPreference> | null;
  return { model: normalizeCharacterModelId(input?.model), building: input?.building !== false };
}
export function loadAssetPreviewPreference(storage?: Pick<Storage, 'getItem' | 'setItem'>, random = Math.random): AssetPreviewPreference {
  let saved: unknown = null;
  try {
    storage ??= localStorage;
    saved = JSON.parse(storage.getItem(KEY) ?? 'null');
  } catch { /* Missing or blocked storage still allows a character this session. */ }
  const input = saved as Partial<AssetPreviewPreference> | null;
  if (isCharacterModelId(input?.model)) {
    const normalized = normalizeAssetPreviewPreference(saved);
    if (normalized.model !== input.model) {
      try { storage?.setItem(KEY, JSON.stringify(normalized)); } catch { /* Still works this session. */ }
    }
    return normalized;
  }
  const models = SELECTABLE_CHARACTER_MODELS;
  const choice = { ...normalizeAssetPreviewPreference(saved), model: models[Math.floor(random() * models.length)].id };
  try { storage?.setItem(KEY, JSON.stringify(choice)); } catch { /* Keep the session choice if storage is unavailable. */ }
  return choice;
}
let preference = loadAssetPreviewPreference();
const listeners = new Set<() => void>();
const subscribe = (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; };
export function setAssetPreviewPreference(value: AssetPreviewPreference): void {
  preference = normalizeAssetPreviewPreference(value);
  try { localStorage.setItem(KEY, JSON.stringify(preference)); } catch { /* Still works without storage. */ }
  listeners.forEach(callback => callback());
}
export function useAssetPreviewPreference(): AssetPreviewPreference {
  return useSyncExternalStore(subscribe, () => preference, () => preference);
}
