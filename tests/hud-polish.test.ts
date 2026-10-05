import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidElement, type ReactNode } from 'react';

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
  assert.ok(html.includes('PAINT'));
  assert.ok(html.includes('TOOLS'));
  assert.ok(!collect(GameHud({ ...props, hideTouchControls: true } as Parameters<typeof GameHud>[0])).includes('MovementJoystick'));
});
