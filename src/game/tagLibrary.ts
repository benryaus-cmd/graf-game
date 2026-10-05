export interface TagDesign {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: number;
}

export interface TagLibrary {
  designs: TagDesign[];
  logoId: string | null;
}

export interface TagLibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const TAG_LIBRARY_KEY = 'graf-tag-library-v1';
export const TAG_LIBRARY_LIMIT = 12;
export const TAG_DESIGN_DATA_LIMIT = 2_000_000;
const EMPTY_LIBRARY: TagLibrary = { designs: [], logoId: null };

function parseLibrary(value: string | null): TagLibrary {
  if (!value) return { ...EMPTY_LIBRARY, designs: [] };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_LIBRARY, designs: [] };
    const candidate = parsed as Partial<TagLibrary>;
    if (!Array.isArray(candidate.designs)) return { ...EMPTY_LIBRARY, designs: [] };
    const designs = candidate.designs.filter((item): item is TagDesign => (
      !!item && typeof item === 'object' && typeof item.id === 'string' &&
      typeof item.name === 'string' && typeof item.dataUrl === 'string' &&
      item.dataUrl.startsWith('data:image/png;base64,') &&
      item.dataUrl.length <= TAG_DESIGN_DATA_LIMIT && typeof item.createdAt === 'number'
    )).slice(0, TAG_LIBRARY_LIMIT);
    const logoId = typeof candidate.logoId === 'string' && designs.some((item) => item.id === candidate.logoId)
      ? candidate.logoId : null;
    return { designs, logoId };
  } catch {
    return { ...EMPTY_LIBRARY, designs: [] };
  }
}

function persist(storage: TagLibraryStorage, library: TagLibrary): boolean {
  try {
    storage.setItem(TAG_LIBRARY_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

export function loadTagLibrary(storage: TagLibraryStorage): TagLibrary {
  try {
    return parseLibrary(storage.getItem(TAG_LIBRARY_KEY));
  } catch {
    return { ...EMPTY_LIBRARY, designs: [] };
  }
}

export function addTagDesign(
  storage: TagLibraryStorage,
  input: { name: string; dataUrl: string },
): { ok: boolean; design?: TagDesign; reason?: 'name' | 'image' | 'full' | 'storage' } {
  const name = input.name.trim().slice(0, 40);
  if (!name) return { ok: false, reason: 'name' };
  if (!input.dataUrl.startsWith('data:image/png;base64,') || input.dataUrl.length > TAG_DESIGN_DATA_LIMIT) {
    return { ok: false, reason: 'image' };
  }
  const library = loadTagLibrary(storage);
  if (library.designs.length >= TAG_LIBRARY_LIMIT) return { ok: false, reason: 'full' };
  const design: TagDesign = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    dataUrl: input.dataUrl,
    createdAt: Date.now(),
  };
  const next = { ...library, designs: [...library.designs, design] };
  if (!persist(storage, next)) return { ok: false, reason: 'storage' };
  return { ok: true, design };
}

export function deleteTagDesign(storage: TagLibraryStorage, id: string): boolean {
  const library = loadTagLibrary(storage);
  const designs = library.designs.filter((design) => design.id !== id);
  if (designs.length === library.designs.length) return false;
  return persist(storage, { designs, logoId: library.logoId === id ? null : library.logoId });
}

export function markTagLogo(storage: TagLibraryStorage, id: string | null): boolean {
  const library = loadTagLibrary(storage);
  if (id !== null && !library.designs.some((design) => design.id === id)) return false;
  return persist(storage, { ...library, logoId: id });
}
