import assert from 'node:assert/strict';
import test from 'node:test';
import { readCosmetics, readPlayerState } from '../src/multiplayer/protocol';
import { PlayerSync } from '../src/multiplayer/playerSync';
import { CHARACTER_MODELS } from '../src/game/characterCatalog';
import { normalizeAssetPreviewPreference } from '../src/game/assetPreviewPreference';

const clothes = { outfit: 'street', top: 'coral', bottom: 'charcoal', accessory: 'none' };
test('shared cosmetics preserve allowlisted character selection and reject arbitrary model URLs', () => {
  assert.deepEqual(readCosmetics({ ...clothes, characterModel: 'hoodie' }), { ...clothes, characterModel: 'hoodie' });
  assert.deepEqual(readCosmetics(clothes), clothes);
  assert.deepEqual(readCosmetics({ ...clothes, characterModel: 'https://example.com/evil.glb' }), { ...clothes, characterModel: 'original' });
  const state = readPlayerState({ position: [0, 1.72, 0], rotation: [0, 0, 0], cosmetics: { ...clothes, characterModel: 'hoodie' } });
  assert.equal(state?.cosmetics?.characterModel, 'hoodie');
});
test('changing only the character sends existing player_state without altering movement or clothes', () => {
  const messages: unknown[] = [], sync = new PlayerSync(message => { messages.push(message); return true; });
  const state = { position: [1, 1.72, 2], rotation: [0, .5, 0], cosmetics: { ...clothes, characterModel: 'original' as const } };
  sync.update(state, 1000);
  sync.update({ ...state, cosmetics: { ...clothes, characterModel: 'hoodie' } }, 1100);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1], { type: 'player_state', state: { ...state, cosmetics: { ...clothes, characterModel: 'hoodie' } } });
});
test('all selectable models survive saved-device normalization and shared cosmetics decoding', () => {
  for (const model of CHARACTER_MODELS) {
    assert.equal(normalizeAssetPreviewPreference({ model: model.id, building: false }).model, model.id);
    assert.equal(readCosmetics({ ...clothes, characterModel: model.id })?.characterModel, model.id);
  }
  assert.equal(normalizeAssetPreviewPreference({ model: 'deleted-model' }).model, 'original');
});
