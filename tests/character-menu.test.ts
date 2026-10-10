import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AvatarMenu from '../src/components/AvatarMenu';
import { loadGameProgress } from '../src/game/progression';
import { SELECTABLE_CHARACTER_MODELS } from '../src/game/characterCatalog';

test('closet lists current playable characters while preserving saved gear', () => {
  const html = renderToStaticMarkup(createElement(AvatarMenu, { progress: loadGameProgress(), panelColor: '#151b19', purchasesDisabled: false,
    onClose() {}, onPurchase() {}, onEquip() {}, onEmote() {} }));
  for (const model of SELECTABLE_CHARACTER_MODELS) assert.ok(html.includes(`Wear ${model.label}`));
  assert.ok(!html.includes('Wear Original'));
  assert.ok(!html.includes('Wear Hoodie'));
  assert.ok(html.includes('previously owned solo items remain saved'));
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(!html.includes('preview on this device'));
});
