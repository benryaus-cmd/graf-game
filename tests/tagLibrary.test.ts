import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addTagDesign, deleteTagDesign, loadTagLibrary, markTagLogo, type TagLibraryStorage,
} from '../src/game/tagLibrary';

class MemoryStorage implements TagLibraryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test('saves named designs independently and never overwrites a duplicate name', () => {
  const storage = new MemoryStorage();
  const first = addTagDesign(storage, { name: 'My tag', dataUrl: 'data:image/png;base64,AAA' });
  const second = addTagDesign(storage, { name: 'My tag', dataUrl: 'data:image/png;base64,BBB' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.design?.id, second.design?.id);
  assert.deepEqual(loadTagLibrary(storage).designs.map((design) => design.dataUrl), [
    'data:image/png;base64,AAA', 'data:image/png;base64,BBB',
  ]);
});

test('keeps the existing library intact when a save exceeds its size limit', () => {
  const storage = new MemoryStorage();
  addTagDesign(storage, { name: 'Kept', dataUrl: 'data:image/png;base64,AAA' });
  const before = storage.getItem('graf-tag-library-v1');
  const result = addTagDesign(storage, { name: 'Too large', dataUrl: `data:image/png;base64,${'A'.repeat(2_000_001)}` });
  assert.equal(result.ok, false);
  assert.equal(storage.getItem('graf-tag-library-v1'), before);
});

test('marking a logo is exclusive and deleting a design clears its logo mark', () => {
  const storage = new MemoryStorage();
  const one = addTagDesign(storage, { name: 'One', dataUrl: 'data:image/png;base64,AAA' });
  const two = addTagDesign(storage, { name: 'Two', dataUrl: 'data:image/png;base64,BBB' });
  markTagLogo(storage, one.design!.id);
  markTagLogo(storage, two.design!.id);
  assert.equal(loadTagLibrary(storage).logoId, two.design!.id);
  deleteTagDesign(storage, two.design!.id);
  assert.equal(loadTagLibrary(storage).logoId, null);
});

test('a restricted storage read safely returns an empty local library', () => {
  const storage: TagLibraryStorage = {
    getItem() { throw new Error('storage disabled'); },
    setItem() { throw new Error('storage disabled'); },
    removeItem() {},
  };
  assert.deepEqual(loadTagLibrary(storage), { designs: [], logoId: null });
  assert.equal(addTagDesign(storage, { name: 'Tag', dataUrl: 'data:image/png;base64,AAA' }).reason, 'storage');
});
