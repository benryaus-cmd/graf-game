export const PAINT_PALETTE_KEY = 'graf-paint-palettes-v1';
export const DEFAULT_PAINT_PALETTE = [
  '#ff4d43', '#ff733e', '#ffb638', '#ffe34a', '#b6e34e', '#46d38b', '#37c9c8', '#39a8f2',
  '#5368ef', '#8758df', '#cf55d6', '#f05b9d', '#ffffff', '#b8b3a8', '#54575a', '#000000',
];
export const PALETTE_COLOR_LIMIT = 24;
export const SAVED_PALETTE_LIMIT = 8;
export interface SavedPaintPalette { id: string; name: string; colors: string[] }
export interface PaintPaletteSettings {
  defaultColors: string[];
  palettes: SavedPaintPalette[];
  activePaletteId: string | null;
}
export interface PaletteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const freshSettings = (): PaintPaletteSettings => ({
  defaultColors: [...DEFAULT_PAINT_PALETTE], palettes: [], activePaletteId: null,
});
const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const validColors = (colors: unknown): colors is string[] => Array.isArray(colors) && colors.length > 0 &&
  colors.length <= PALETTE_COLOR_LIMIT && colors.every(isColor);

function parseSettings(raw: string | null): PaintPaletteSettings {
  if (!raw) return freshSettings();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return freshSettings();
    const value = parsed as Partial<PaintPaletteSettings>;
    const defaultColors = validColors(value.defaultColors) ? [...value.defaultColors] : [...DEFAULT_PAINT_PALETTE];
    const palettes = Array.isArray(value.palettes) ? value.palettes.filter((item): item is SavedPaintPalette => (
      !!item && typeof item === 'object' && typeof item.id === 'string' && item.id.length > 0 &&
      typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 32 && validColors(item.colors)
    )).slice(0, SAVED_PALETTE_LIMIT).map((palette) => ({ ...palette, colors: [...palette.colors] })) : [];
    const activePaletteId = typeof value.activePaletteId === 'string' && palettes.some((palette) => palette.id === value.activePaletteId)
      ? value.activePaletteId : null;
    return { defaultColors, palettes, activePaletteId };
  } catch {
    return freshSettings();
  }
}

export function loadPaletteSettings(storage: PaletteStorage): PaintPaletteSettings {
  try { return parseSettings(storage.getItem(PAINT_PALETTE_KEY)); } catch { return freshSettings(); }
}

function persist(storage: PaletteStorage, settings: PaintPaletteSettings): boolean {
  try { storage.setItem(PAINT_PALETTE_KEY, JSON.stringify(settings)); return true; } catch { return false; }
}

export function savePalette(
  storage: PaletteStorage,
  nameValue: string,
  colors: string[],
): { ok: boolean; palette?: SavedPaintPalette; reason?: 'name' | 'duplicate' | 'colors' | 'full' | 'storage' } {
  const name = nameValue.trim().slice(0, 32);
  if (!name) return { ok: false, reason: 'name' };
  const settings = loadPaletteSettings(storage);
  if (settings.palettes.some((palette) => palette.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return { ok: false, reason: 'duplicate' };
  }
  const cleanColors = [...new Set(colors.map((color) => color.toLowerCase()))];
  if (!validColors(cleanColors)) return { ok: false, reason: 'colors' };
  if (settings.palettes.length >= SAVED_PALETTE_LIMIT) return { ok: false, reason: 'full' };
  const palette: SavedPaintPalette = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    colors: cleanColors,
  };
  const next = { ...settings, palettes: [...settings.palettes, palette], activePaletteId: palette.id };
  return persist(storage, next) ? { ok: true, palette } : { ok: false, reason: 'storage' };
}

export function addPaletteColor(storage: PaletteStorage, paletteId: string | null, color: string): boolean {
  const normalized = color.toLowerCase();
  if (!isColor(normalized)) return false;
  const settings = loadPaletteSettings(storage);
  if (paletteId === null) {
    if (settings.defaultColors.includes(normalized) || settings.defaultColors.length >= PALETTE_COLOR_LIMIT) return false;
    return persist(storage, { ...settings, defaultColors: [...settings.defaultColors, normalized] });
  }
  const palette = settings.palettes.find((item) => item.id === paletteId);
  if (!palette || palette.colors.includes(normalized) || palette.colors.length >= PALETTE_COLOR_LIMIT) return false;
  const palettes = settings.palettes.map((item) => item.id === paletteId ? { ...item, colors: [...item.colors, normalized] } : item);
  return persist(storage, { ...settings, palettes });
}

export function setActivePalette(storage: PaletteStorage, paletteId: string | null): boolean {
  const settings = loadPaletteSettings(storage);
  if (paletteId !== null && !settings.palettes.some((palette) => palette.id === paletteId)) return false;
  return persist(storage, { ...settings, activePaletteId: paletteId });
}

export function deletePalette(storage: PaletteStorage, paletteId: string): boolean {
  const settings = loadPaletteSettings(storage);
  const palettes = settings.palettes.filter((palette) => palette.id !== paletteId);
  if (palettes.length === settings.palettes.length) return false;
  return persist(storage, {
    ...settings,
    palettes,
    activePaletteId: settings.activePaletteId === paletteId ? null : settings.activePaletteId,
  });
}
