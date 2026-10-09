import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// These exercise the accessible surfaces, not the 3D renderer.
test('paint sheet has a stable title, grouped tools and separate scrolling content', async () => {
  const { default: PaintDock } = await import('../src/components/PaintDock');
  const html = renderToStaticMarkup(createElement(PaintDock, {
    open: true, color: '#ff4d43', brushSize: 6, opacity: .88, selectedLayer: 2,
    layers: Array.from({ length: 5 }, (_, i) => ({ name: `Layer ${i + 1}`, visible: true })),
    onToggle() {}, onEyedropper() {},
  } as Parameters<typeof PaintDock>[0]));
  assert.match(html, /PAINT TOOLS/);
  assert.match(html, /game-sheet-body/);
  assert.match(html, /aria-label="Brush heads"/);
  assert.match(html, /aria-label="Drawing layers"/);
  assert.match(html, /Saved palettes/);
  assert.match(html, /Close paint panel/);
});

test('nearby art is closed initially, including offline Solo', async () => {
  const { default: Pieces } = await import('../src/components/GraffitiPieces');
  const html = renderToStaticMarkup(createElement(Pieces, { pieces: [], connected: false, onLike: () => false, onResync() {} }));
  assert.ok(!html.includes('id="graffiti-pieces-panel"'));
  assert.ok(!html.includes('Connect to see shared pieces'));
});

test('selected player can be dismissed and has a bounded shared surface', async () => {
  const { default: Player } = await import('../src/components/PlayerInteractionCard');
  const html = renderToStaticMarkup(createElement(Player, {
    selected: { playerId: 'a', username: 'alice', nickName: 'Alice', role: 'player' },
    connected: true, onSetRole: () => false, onAdminAction: () => false, onClose() {},
  } as Parameters<typeof Player>[0]));
  assert.match(html, /Close player details/);
  assert.match(html, /game-sheet-body/);
  assert.ok(!html.includes('GIVE CREDITS'));
});

test('chat unread counts unique arrivals and preserves history reading position', async () => {
  const { unreadMessages, isChatNearBottom } = await import('../src/components/chatPresentation');
  const messages = ['old', 'new', 'new'].map(id => ({ id, playerId: 'a', displayName: 'A', text: 'Hi', timestamp: 1 }));
  assert.equal(unreadMessages(messages, new Set(['old'])), 1);
  assert.equal(unreadMessages(messages, new Set(['old', 'new'])), 0);
  assert.equal(isChatNearBottom(400, 100, 520), true);
  assert.equal(isChatNearBottom(0, 100, 520), false);
});

test('sheet bounds stay inside an embedded frame above the keyboard, including rotation', async () => {
  const { sheetViewport } = await import('../src/components/sheetViewport');
  const rect = { left: 0, top: 80, right: 390, bottom: 680 };
  const viewport = { offsetLeft: 0, offsetTop: 0, width: 390, height: 460 };
  assert.deepEqual(sheetViewport(rect, 390, 600, viewport, false), { left: 0, top: 0, width: 390, height: 380 });
  assert.deepEqual(sheetViewport(rect, 600, 390, viewport, true), { left: 220, top: 0, width: 380, height: 390 });
  assert.deepEqual(sheetViewport(rect, 600, 390, { ...viewport, height: 800 }, true), { left: 0, top: 0, width: 600, height: 390 });
});
