import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('normal HUD prioritises paint controls rather than branding and bot spawning', async () => {
  const oldWindow = globalThis.window;
  globalThis.window = {} as Window & typeof globalThis;
  const { default: GameHud } = await import('../src/components/GameHud');
  globalThis.window = oldWindow;
  const props = {
    panelColor: '#222222', accentColor: '#ff0000', sky: 'clear', activeMenu: null,
    color: '#ff0000', layers: [], selectedLayer: 0, cameraLabel: 'FIRST PERSON',
    viewMode: 'first-person', mapZoom: 1, progress: { coins: 10 },
    paintMode: true, eraseMode: false, brushSize: 3, opacity: 1,
    posterPlacement: null, posterSize: 1, purchasesDisabled: true,
  } as unknown as Parameters<typeof GameHud>[0];
  const collect = (node: ReactNode): string => {
    if (Array.isArray(node)) return node.map(collect).join(' ');
    if (isValidElement<{ children?: ReactNode }>(node)) {
      const name = typeof node.type === 'function' ? node.type.name : '';
      return name + ' ' + collect(node.props.children);
    }
    return typeof node === 'string' ? node : '';
  };
  const html = collect(GameHud(props));
  assert.ok(!html.includes('SIDESTREET'));
  assert.ok(!html.includes('DISTRICT 04'));
  assert.ok(!html.includes('FREE ROAM'));
  assert.ok(!html.includes('BotControls'));
  assert.ok(html.includes('EXPLORE'), 'active painting offers Explore without changing the paint tool');
  assert.ok(html.includes('TOOLS'));
  assert.ok(!collect(GameHud({ ...props, hideTouchControls: true } as Parameters<typeof GameHud>[0])).includes('MovementJoystick'));
});

test('paint tools show every default colour and five layers without MORE; closed tools render no bottom station', async () => {
  const { default: PaintDock } = await import('../src/components/PaintDock');
  const props = {
    open: true, color: '#ff0000', brushSize: 3, opacity: 1, selectedLayer: 2,
    layers: Array.from({ length: 5 }, (_, index) => ({ name: `Layer ${index + 1}`, visible: true })),
    onEyedropper: () => {},
  } as unknown as Parameters<typeof PaintDock>[0];
  const html = renderToStaticMarkup(createElement(PaintDock, props));
  assert.equal((html.match(/aria-label="Select paint colour/g) ?? []).length, 16);
  assert.equal((html.match(/class="layer-select"/g) ?? []).length, 5);
  assert.ok(html.includes('Layer 3'));
  assert.ok(html.includes('Pick colour'));
  assert.ok(html.includes('Load saved palette'));
  assert.equal(renderToStaticMarkup(createElement(PaintDock, { ...props, open: false })), '');
});

test('canvas actions show only the preparation pair or painting pair', async () => {
  const { default: Hud } = await import('../src/components/PaintWorkspaceHud');
  const view = { selected: true, active: false, width: 2, height: 2 };
  const render = (started: boolean) => renderToStaticMarkup(createElement(Hud, { view: { ...view, started }, initialCollapsed: false, painting: true, onAction: () => {} }));
  const preparing = render(false);
  assert.ok(preparing.includes('START PAINTING'));
  assert.ok(preparing.includes('CANCEL'));
  assert.ok(!preparing.includes('ENTER CANVAS'));
  const painting = render(true);
  assert.ok(painting.includes('ENTER CANVAS'));
  assert.ok(painting.includes('CANCEL'));
  assert.ok(!painting.includes('FINISH PIECE'));
  const painted = renderToStaticMarkup(createElement(Hud, { view: { ...view, started: true, hasPaint: true }, initialCollapsed: false, painting: true, onAction: () => {} }));
  assert.ok(painted.includes('FINISH PIECE'));
  assert.ok(!painted.includes('CANCEL'));
});

test('settings exposes the current shared radio volume', async () => {
  const { default: Settings } = await import('../src/components/SettingsModal');
  const html = renderToStaticMarkup(createElement(Settings, { radioVolume: .65, onClose: () => {}, onUnlock: () => {} }));
  assert.ok(html.includes('65%'));
  assert.ok(html.includes('value="65"'));
  assert.ok(html.includes('Radio volume in settings'));
});

test('protection UI shows only server quote amounts and waits for confirmed balance', async () => {
  const { default: Protection } = await import('../src/components/ProtectionControls');
  const baseQuote = { pieceId: 'p', bounds: { min: [0, 0, 0], max: [2, 2, .02] }, protectionEnabled: false, cost: 25, durationSeconds: 14400, canPurchase: true, balance: 50, overlapPieceId: null };
  const props = { balance: null, quote: baseQuote, quotes: { unprotected: baseQuote, protected: { ...baseQuote, protectionEnabled: true, cost: 60 } }, protectionEnabled: false, pending: false, pendingPurchase: false, purchased: false, protectedUntil: null, notice: null, onQuote() {}, onProtectionEnabledChange() {} } as Parameters<typeof Protection>[0];
  const unknown = renderToStaticMarkup(createElement(Protection, props));
  assert.ok(unknown.includes('25 credits'));
  assert.ok(unknown.includes('60 credits'));
  assert.ok(unknown.includes('4.0 hours'));
  assert.ok(!unknown.includes('>PROTECT</button>'));
  assert.ok(unknown.includes('PROTECT THIS PIECE'));
  const insufficient = renderToStaticMarkup(createElement(Protection, { ...props, balance: 10 }));
  assert.ok(insufficient.includes('NOT ENOUGH CREDITS'));
  assert.ok(insufficient.includes('is-invalid'));
});


test('selected spray head is explicitly marked and visually targetable', async () => {
  const { default: PaintDock } = await import('../src/components/PaintDock');
  const props = {
    open: true, color: '#ff0000', brushSize: 3, opacity: 1, selectedLayer: 0,
    layers: [{ name: 'Layer 1', visible: true }], brushHead: 'roller',
    paintMode: true, eraseMode: false, posterSize: 1,
    onToggle() {}, onColorChange() {}, onToolChange() {}, onBrushHeadChange() {},
    onBrushSizeChange() {}, onOpacityChange() {}, onLayerSelect() {}, onLayerToggle() {},
    onLayerAdd() {}, onPosterSizeChange() {}, onStartPosterPlacement() {},
  } as unknown as Parameters<typeof PaintDock>[0];
  const html = renderToStaticMarkup(createElement(PaintDock, props));
  assert.match(html, /class="paint-head-selected" aria-pressed="true">Roller<\/button>/);
  assert.ok(!html.includes('paint-head-selected" aria-pressed="true">Soft'));
});
