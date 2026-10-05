import { SHOP_ITEMS, type ShopCategory } from '@/game/shopCatalog';
export { SHOP_ITEMS } from '@/game/shopCatalog';
export type { ShopCategory, ShopItem } from '@/game/shopCatalog';

export interface GameProgress {
  coins: number;
  owned: string[];
  outfit: string;
  top: string;
  bottom: string;
  accessory: string;
}

export interface AvatarAppearance {
  outfit: string;
  topColor: string;
  bottomColor: string;
  accessory: string;
}

const KEY = 'sidestreet_progress_v1';
const defaults: GameProgress = {
  coins: 0,
  owned: ['outfit:street', 'top:coral', 'bottom:charcoal', 'accessory:none'],
  outfit: 'street',
  top: 'coral',
  bottom: 'charcoal',
  accessory: 'none',
};

function isKnownItem(id: string): boolean {
  return SHOP_ITEMS.some((item) => item.id === id);
}

export function loadGameProgress(): GameProgress {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...defaults, owned: [...defaults.owned] };
    const saved = JSON.parse(raw) as Partial<GameProgress>;
    const owned = Array.isArray(saved.owned)
      ? [...new Set(saved.owned.filter((id): id is string => typeof id === 'string' && isKnownItem(id)))]
      : [...defaults.owned];
    const selected = (slot: ShopCategory, fallback: string): string => {
      const value = saved[slot];
      return typeof value === 'string' && owned.includes(`${slot}:${value}`) ? value : fallback;
    };
    return {
      coins: typeof saved.coins === 'number' && Number.isFinite(saved.coins)
        ? Math.max(0, Math.floor(saved.coins)) : 0,
      owned: [...new Set([...defaults.owned, ...owned])],
      outfit: selected('outfit', defaults.outfit),
      top: selected('top', defaults.top),
      bottom: selected('bottom', defaults.bottom),
      accessory: selected('accessory', defaults.accessory),
    };
  } catch {
    return { ...defaults, owned: [...defaults.owned] };
  }
}

export function saveGameProgress(progress: GameProgress): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    return;
  }
}

export function getAvatarAppearance(progress: GameProgress): AvatarAppearance {
  const top = SHOP_ITEMS.find((item) => item.id === `top:${progress.top}`);
  const bottom = SHOP_ITEMS.find((item) => item.id === `bottom:${progress.bottom}`);
  return {
    outfit: progress.outfit,
    topColor: top?.color ?? '#e87851',
    bottomColor: bottom?.color ?? '#353a40',
    accessory: progress.accessory,
  };
}