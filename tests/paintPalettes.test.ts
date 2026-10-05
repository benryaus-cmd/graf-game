import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addPaletteColor, deletePalette, loadPaletteSettings, savePalette, setActivePalette,
  type PaletteStorage,
} from '../src/game/paintPalettes';

class MemoryStorage implements PaletteStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test('saves and loads named palettes without changing the default palette', () => {
  const storage = new MemoryStorage();
  const saved = savePalette(storage, 'Warm set', ['#ff0000', '#00ff00']);
  assert.equal(saved.ok, true);
  assert.equal(setActivePalette(storage, saved.palette!.id), true);
  const loaded = loadPaletteSettings(storage);
  assert.equal(loaded.activePaletteId, saved.palette!.id);
  assert.deepEqual(loaded.palettes[0].colors, ['#ff0000', '#00ff00']);
  assert.deepEqual(loaded.defaultColors, loadPaletteSettings(new MemoryStorage()).defaultColors);
});

test('adding a swatch to an active palette persists it and deleting returns selection to default', () => {
  const storage = new MemoryStorage();
  const saved = savePalette(storage, 'Night', ['#111111']);
  setActivePalette(storage, saved.palette!.id);
  assert.equal(addPaletteColor(storage, saved.palette!.id, '#abcdef'), true);
  assert.deepEqual(loadPaletteSettings(storage).palettes[0].colors, ['#111111', '#abcdef']);
  assert.equal(deletePalette(storage, saved.palette!.id), true);
  assert.equal(loadPaletteSettings(storage).activePaletteId, null);
});

test('duplicate names, invalid colors, and unavailable storage fail without damaging saved palettes', () => {
  const storage = new MemoryStorage();
  assert.equal(savePalette(storage, 'Same', ['#ffffff']).ok, true);
  const before = storage.getItem('graf-paint-palettes-v1');
  assert.equal(savePalette(storage, 'same', ['#000000']).reason, 'duplicate');
  assert.equal(savePalette(storage, 'Bad', ['red']).reason, 'colors');
  assert.equal(storage.getItem('graf-paint-palettes-v1'), before);
  const blocked: PaletteStorage = { getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() {} };
  assert.deepEqual(loadPaletteSettings(blocked).palettes, []);
  assert.equal(savePalette(blocked, 'Blocked', ['#ffffff']).reason, 'storage');
});
