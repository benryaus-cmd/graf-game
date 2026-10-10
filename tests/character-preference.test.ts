import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAssetPreviewPreference, setAssetPreviewPreference } from '../src/game/assetPreviewPreference';
import { CHARACTER_MODELS } from '../src/game/characterCatalog';

const key = 'graffciti.asset-preview.v1';
function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[key, initial]]);
  return { getItem: (name: string) => values.get(name) ?? null, setItem: (name: string, value: string) => { values.set(name, value); } };
}

test('fresh devices receive each imported Quaternius model and save it before returning', () => {
  const models = CHARACTER_MODELS.filter(model => model.id !== 'original' && model.id !== 'hoodie');
  for (let index = 0; index < models.length; index++) {
    const storage = memoryStorage();
    const choice = loadAssetPreviewPreference(storage, () => (index + .5) / models.length);
    assert.equal(choice.model, models[index].id);
    assert.deepEqual(JSON.parse(storage.getItem(key)!), choice);
    assert.deepEqual(loadAssetPreviewPreference(storage, () => { throw new Error('Saved choice must not reroll'); }), choice);
  }
});

test('real saved choices persist; retired Original and Hoodie migrate to Casual Male', () => {
  for (const model of CHARACTER_MODELS) {
    const saved = { model: model.id, building: false };
    const storage = memoryStorage(JSON.stringify(saved));
    const choice = loadAssetPreviewPreference(storage, () => { throw new Error('Do not reroll'); });
    assert.deepEqual(choice, { model: model.id === 'original' || model.id === 'hoodie' ? 'casual-male' : model.id, building: false });
    assert.deepEqual(JSON.parse(storage.getItem(key)!), choice);
  }
});

test('invalid saved characters recover to an imported character and preserve the building off preference', () => {
  for (const saved of ['invalid json', 'null', '{"model":"deleted-model","building":false}', '{"building":false}']) {
    const storage = memoryStorage(saved);
    const choice = loadAssetPreviewPreference(storage, () => 0);
    assert.equal(choice.model, 'casual-female');
    assert.equal(choice.building, !saved.includes('false'));
    assert.deepEqual(JSON.parse(storage.getItem(key)!), choice);
  }
});

test('changing the character saves the selection used on the next visit', () => {
  const storage = memoryStorage();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    setAssetPreviewPreference({ model: 'suit-male', building: false });
    assert.deepEqual(loadAssetPreviewPreference(storage, () => { throw new Error('Chosen character must survive'); }), { model: 'suit-male', building: false });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('blocked device storage still supplies a usable random character for this session', () => {
  const blocked = { getItem: () => { throw new Error('Blocked'); }, setItem: () => { throw new Error('Blocked'); } };
  assert.equal(loadAssetPreviewPreference(blocked, () => .9999).model, 'worker-male');
});
