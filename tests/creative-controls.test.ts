import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';

test('canvas controls default to collapsed and stay small while moving', async () => {
  const { default: Hud } = await import('../src/components/PaintWorkspaceHud');
  const props = { view: { selected: true, active: false, width: 2, height: 2 }, painting: true, onAction() {} };
  const html = renderToStaticMarkup(createElement(Hud, props));
  assert.match(html, /CANVAS/);
  assert.ok(!html.includes('BOX WIDTH'));
  assert.ok(!html.includes('START PAINTING'));
});

test('paint picker offers visual colour creation separately from world eyedropper', async () => {
  const { default: Dock } = await import('../src/components/PaintDock');
  const html = renderToStaticMarkup(createElement(Dock, { open: true, color: '#ff0000', brushSize: 3, opacity: 1, layers: [], selectedLayer: 0, onEyedropper() {} } as Parameters<typeof Dock>[0]));
  assert.match(html, /PICK COLOUR/);
  assert.match(html, /EYEDROPPER/);
});

test('emote sheet exposes all existing animations through the same action', async () => {
  let selected = '';
  const { default: Emotes } = await import('../src/components/EmoteSheet');
  const html = renderToStaticMarkup(createElement(Emotes, { onClose() {}, onEmote(value) { selected = value; } }));
  assert.match(html, /JOY/); assert.match(html, /CRY/); assert.match(html, /THINK/); assert.match(html, /SLEEPY/); assert.match(html, /SPIN/);
  const element = Emotes({ onClose() {}, onEmote(value) { selected = value; } });
  const buttons = element.props.children.props.children;
  buttons[2].props.onClick();
  assert.equal(selected, 'think');
});

test('reference sheet explains local ghost mode and requires a selected canvas', async () => {
  const { default: ReferenceSheet } = await import('../src/components/ReferenceSheet');
  const html = renderToStaticMarkup(createElement(ReferenceSheet, { selected: false, guide: null, onClose() {}, onChange() {} }));
  assert.match(html, /Select a canvas/);
  assert.match(html, /never saved/);
});

test('reference fit preserves image proportions within rectangular canvas', async () => {
  const { referenceFit } = await import('../src/game/referenceGuide');
  assert.deepEqual(referenceFit(1600, 800, 2, 3), { width: 2, height: 1 });
  assert.deepEqual(referenceFit(500, 1000, 4, 2), { width: 1, height: 2 });
});

test('HSV picker can create black, white and saturated colours without hex knowledge', async () => {
  const { hexToHsv, hsvToHex } = await import('../src/game/colorPicker');
  assert.equal(hsvToHex({ h: 120, s: 100, v: 100 }), '#00ff00');
  assert.equal(hsvToHex({ h: 240, s: 100, v: 100 }), '#0000ff');
  assert.equal(hsvToHex({ h: 30, s: 0, v: 100 }), '#ffffff');
  assert.equal(hsvToHex({ h: 0, s: 100, v: 0 }), '#000000');
  for (const hex of ['#ff4d43', '#135abe', '#ffffff', '#000000', '#999999']) assert.equal(hsvToHex(hexToHsv(hex)), hex);
});

test('chat bubble follows avatar, wraps all text and disposes on expiry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const oldDocument = globalThis.document;
  const drawn: string[] = [];
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ measureText: (s: string) => ({ width: s.length * 12 }), clearRect() {}, fillRect() {}, fillText: (s: string) => drawn.push(s) }) }) } as unknown as Document;
  try {
    const { SpeechBubble } = await import('../src/game/speechBubble');
    const avatar = new THREE.Group();
    const bubble = new SpeechBubble(avatar);
    const text = 'This is my full chat message '.repeat(16).trim();
    bubble.show(text);
    assert.equal(avatar.children.length, 1);
    assert.equal(drawn.join(' '), text);
    let disposed = false;
    (avatar.children[0] as THREE.Sprite).material.addEventListener('dispose', () => { disposed = true; });
    t.mock.timers.tick(20_000);
    assert.equal(avatar.children.length, 0);
    assert.equal(disposed, true);
    bubble.dispose();
  } finally { globalThis.document = oldDocument; }
});

test('snapshot chat never replays bubbles and duplicate live delivery does not repeat them', async () => {
  const { ChatSync } = await import('../src/multiplayer/chat');
  const spoken: string[] = [];
  const chat = new ChatSync(() => true, () => {}, message => spoken.push(message.text));
  const old = { id: 'old', playerId: 'one', text: 'history', timestamp: 1 };
  const live = { id: 'live', playerId: 'one', text: 'hello', timestamp: 2 };
  chat.snapshot([old]); assert.deepEqual(spoken, []);
  chat.accept({ type: 'chat_message', message: live });
  chat.accept({ type: 'chat_message', message: live });
  assert.deepEqual(spoken, ['hello']);
});

test('chat line breaks cannot allocate a huge mobile texture', async () => {
  const old = globalThis.document;
  const canvas = { width: 0, height: 0, getContext: () => ({ measureText: (s: string) => ({ width: s.length * 26 }), clearRect() {}, fillRect() {}, fillText() {} }) };
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  try {
    const { SpeechBubble } = await import('../src/game/speechBubble');
    const bubble = new SpeechBubble(new THREE.Group());
    bubble.show(('a\n').repeat(250));
    assert.ok(canvas.height <= 1024, `unexpected ${canvas.height}px texture`);
    bubble.dispose();
  } finally { globalThis.document = old; }
});

test('reference replacement ignores stale image load and removal disposes the presentation mesh', async () => {
  const images: Array<{ naturalWidth: number; naturalHeight: number; onload?: () => void; src?: string }> = [];
  const oldImage = globalThis.Image;
  globalThis.Image = class { naturalWidth = 1000; naturalHeight = 500; onload?: () => void; src = ''; constructor() { images.push(this); } } as unknown as typeof Image;
  try {
    const { ReferenceGuide } = await import('../src/game/referenceGuide');
    const scene = new THREE.Scene();
    const selection = { center: new THREE.Vector3(), normal: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), width: 4, height: 2 };
    const guide = new ReferenceGuide({ scene, paintWorkspace: { selection } } as any);
    const settings = { url: 'blob:first', name: 'first', visible: true, moving: false, opacity: .35, scale: 1, x: 1, y: 0, rotation: 0 };
    guide.set(settings); guide.set({ ...settings, url: 'blob:second' });
    images[0].onload?.();
    const mesh = scene.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    assert.equal(mesh.material.map, null);
    images[1].onload?.();
    assert.equal(mesh.visible, true);
    assert.deepEqual(mesh.scale.toArray(), [4, 2, 1]);
    assert.equal(mesh.position.x, 4, 'guide may sit beside the selected box');
    assert.equal(mesh.layers.isEnabled(31), true);
    let disposed = false;
    mesh.material.map!.addEventListener('dispose', () => { disposed = true; });
    guide.set(null); assert.equal(mesh.visible, false); assert.equal(disposed, true);
    guide.dispose(); assert.equal(scene.children.length, 0);
    images[1].onload?.(); assert.equal(scene.children.length, 0);
  } finally { globalThis.Image = oldImage; }
});
