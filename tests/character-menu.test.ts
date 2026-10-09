import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AvatarMenu from '../src/components/AvatarMenu';
import { loadGameProgress } from '../src/game/progression';
import { CHARACTER_MODELS } from '../src/game/characterCatalog';

test('closet lists real selectable characters and preserves original clothes and gear', () => {
  const html = renderToStaticMarkup(createElement(AvatarMenu, { progress: loadGameProgress(), panelColor: '#151b19', purchasesDisabled: false,
    onClose() {}, onPurchase() {}, onEquip() {}, onEmote() {} }));
  for (const model of CHARACTER_MODELS) assert.ok(html.includes(`Wear ${model.label}`));
  assert.ok(html.includes('Choose Original to use your equipped clothes and gear.'));
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(!html.includes('preview on this device'));
});
