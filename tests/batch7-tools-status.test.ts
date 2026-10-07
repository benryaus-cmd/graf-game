import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PaintWorkspaceHud from '../src/components/PaintWorkspaceHud';
import MultiplayerControls from '../src/components/MultiplayerControls';
import CanvasCredits from '../src/components/CanvasCredits';

const oldWindow = globalThis.window;
globalThis.window = {} as Window & typeof globalThis;
const { default: PaintDock } = await import('../src/components/PaintDock');
globalThis.window = oldWindow;

type ElementProps = { children?: ReactNode; onClick?: () => void; [key: string]: unknown };
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<ElementProps>(node) ? [node, ...elements(node.props.children)] : [];
}
function capture<P extends object>(Component: (props: P) => ReactNode, props: P) {
  let tree: ReactNode;
  function Capture() { tree = Component(props); return tree; }
  const html = renderToStaticMarkup(createElement(Capture));
  return { html, nodes: elements(tree) };
}
const dockProps = {
  open: true, color: '#ff4d43', brushHead: 'roller', paintMode: true, eraseMode: false,
  brushSize: 6, opacity: .88, selectedLayer: 0, posterSize: 1, panelColor: '#222', accentColor: '#f00',
  layers: [{ name: 'Layer 1', visible: true }],
  onToggle() {}, onColorChange() {}, onToolChange() {}, onBrushHeadChange() {}, onBrushSizeChange() {},
  onOpacityChange() {}, onLayerSelect() {}, onLayerToggle() {}, onLayerAdd() {}, onPosterSizeChange() {}, onStartPosterPlacement() {},
} satisfies Parameters<typeof PaintDock>[0];

test('brush size and opacity remain reachable between head selection and colour', () => {
  const { html } = capture(PaintDock, dockProps);
  assert.ok(html.indexOf('BRUSH SETTINGS') > html.indexOf('aria-label="Brush heads"'));
  assert.ok(html.indexOf('BRUSH SETTINGS') < html.indexOf('<h3>COLOUR'));
  assert.match(html, /data-tutorial="brush-heads"/);
});

test('ERAZE occupies one head slot, invokes the existing eraser action and clears spray selection', () => {
  const actions: string[] = [];
  let closed = 0;
  const { html, nodes } = capture(PaintDock, { ...dockProps, eraseMode: true, onToolChange: tool => actions.push(tool), onClose: () => closed++ });
  assert.ok(!html.includes('>DRIP</button>'));
  const erase = nodes.filter(node => node.type === 'button' && node.props.children === 'ERAZE');
  assert.equal(erase.length, 1);
  assert.equal(erase[0].props['aria-pressed'], true);
  assert.deepEqual(erase[0].props.style, { background: '#ffffff', color: '#000000' });
  assert.ok(!html.includes('paint-head-selected" aria-pressed="true">ROLLER'));
  erase[0].props.onClick?.();
  assert.deepEqual(actions, ['eraser']);
  assert.equal(closed, 1);
});

test('canvas history buttons use server availability and route undo and redo beside zoom', () => {
  const view = { selected: true, active: true, width: 2, height: 2 };
  const unavailable = capture(PaintWorkspaceHud, { view, painting: true, onAction() {} });
  const historyButtons = unavailable.nodes.filter(node => node.type === 'button' && ['UNDO', 'REDO'].includes(String(node.props.children)));
  assert.equal(historyButtons.length, 2);
  assert.ok(historyButtons.every(node => node.props.disabled === true));
  const actions: string[] = [];
  const available = capture(PaintWorkspaceHud, { view, painting: true, history: { canUndo: true, canRedo: false, undoDepth: 2, redoDepth: 0, limit: 20 }, onAction: action => actions.push(action) } as Parameters<typeof PaintWorkspaceHud>[0]);
  const undo = available.nodes.find(node => node.props.children === 'UNDO')!;
  const redo = available.nodes.find(node => node.props.children === 'REDO')!;
  assert.equal(undo.props.disabled, false);
  assert.equal(redo.props.disabled, true);
  undo.props.onClick?.();
  const redoAvailable = capture(PaintWorkspaceHud, { view, painting: true, history: { canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 2, limit: 20 }, onAction: action => actions.push(action) } as Parameters<typeof PaintWorkspaceHud>[0]);
  redoAvailable.nodes.find(node => node.props.children === 'REDO')!.props.onClick?.();
  assert.deepEqual(actions, ['undo', 'redo']);
  assert.match(available.html, /aria-label="Canvas zoom"[^]*UNDO[^]*REDO/);
});

// No DOM dependency is installed: retain the real component's own state while
// invoking its rendered handlers. Child components and effects are not mocked.
function statefulRender<P>(Component: (props: P) => ReactNode, props: P) {
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const slots: unknown[] = [];
  return () => {
    const prior = internals.H;
    let cursor = 0;
    internals.H = {
      useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], (value: unknown) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
      useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
      useEffect() {},
    };
    try { return elements(Component(props)); } finally { internals.H = prior; }
  };
}
const multiplayerProps = {
  status: { phase: 'solo', playerCount: 0 }, displayName: 'Painter', profileLoading: false,
  messages: [], onJoin() {}, onLeave() {}, onChat() {}, onResync() {},
} satisfies Parameters<typeof MultiplayerControls>[0];

test('SOLO confirmation joins only on YES; NO and cancellation keep solo', () => {
  let joins = 0, settings = 0;
  const render = statefulRender(MultiplayerControls, { ...multiplayerProps, onJoin: () => joins++, onOpenMenu: () => settings++ });
  const pill = () => render().find(node => String(node.props.className).includes('connection-pill'))!;
  const sheet = () => render().find(node => node.props.title === 'Join multiplayer?');
  assert.equal(sheet(), undefined);
  pill().props.onClick?.();
  assert.equal(joins, 0); assert.equal(settings, 0);
  assert.ok(sheet());
  render().find(node => node.props.children === 'NO')!.props.onClick?.();
  assert.equal(sheet(), undefined); assert.equal(joins, 0);
  pill().props.onClick?.();
  (sheet()!.props.onClose as () => void)();
  assert.equal(sheet(), undefined); assert.equal(joins, 0);
  pill().props.onClick?.();
  render().find(node => node.props.children === 'YES')!.props.onClick?.();
  assert.equal(joins, 1); assert.equal(sheet(), undefined);
});

test('connected status presents a count with accessible online players action; offline opens settings', () => {
  let players = 0, settings = 0;
  const connected = capture(MultiplayerControls, { ...multiplayerProps, status: { phase: 'connected', playerCount: 4 }, onPlayers: () => players++ });
  const pill = connected.nodes.find(node => String(node.props.className).includes('connection-pill'))!;
  assert.match(connected.html, /See online players/);
  assert.ok(!connected.html.includes('>ONLINE'));
  assert.match(connected.html, /<i><\/i>4<\/button>/);
  pill.props.onClick?.(); assert.equal(players, 1);
  const offline = capture(MultiplayerControls, { ...multiplayerProps, status: { phase: 'disconnected', playerCount: 0 }, onOpenMenu: () => settings++ } as Parameters<typeof MultiplayerControls>[0]);
  offline.nodes.find(node => String(node.props.className).includes('connection-pill'))!.props.onClick?.();
  assert.equal(settings, 1);
});

test('credit status displays compact authoritative balance and preserves its accessible name', () => {
  const html = renderToStaticMarkup(createElement(CanvasCredits, { balance: 42, online: true }));
  assert.match(html, /aria-label="Canvas credits"/);
  assert.match(html, />C 42/);
  assert.ok(!html.includes('>CREDITS'));
  assert.match(renderToStaticMarkup(createElement(CanvasCredits, { balance: null })), />C —/);
});
