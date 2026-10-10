import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpeechBubble } from '../src/game/speechBubble';
import { RemotePlayers } from '../src/multiplayer/remotePlayers';

function canvasFixture() {
  const old = globalThis.document;
  const canvases: Array<{ width: number; height: number; lines: string[]; backgrounds: string[] }> = [];
  globalThis.document = { createElement: () => {
    const canvas = { width: 0, height: 0, lines: [] as string[], backgrounds: [] as string[], getContext: () => context };
    const context = { fillStyle: '', measureText: (s: string) => ({ width: s.length * 12 }), fillRect: () => canvas.backgrounds.push(context.fillStyle), fillText: (s: string) => canvas.lines.push(s) };
    canvases.push(canvas); return canvas;
  } } as unknown as Document;
  return { canvases, restore: () => { globalThis.document = old; } };
}

test('speech width fits short text and long speech wraps into a compact block', () => {
  const fixture = canvasFixture(); const avatar = new THREE.Group(); const bubble = new SpeechBubble(avatar);
  try {
    bubble.show('Hi'); const short = fixture.canvases[0];
    bubble.show('A friendly hello'); const medium = fixture.canvases[1];
    const text = 'This is a full message with several words '.repeat(10).trim();
    bubble.show(text); const long = fixture.canvases[2];
    assert.ok(short.width < medium.width && medium.width < long.width);
    assert.ok(short.width < 100, `${short.width}px short bubble`);
    assert.equal(long.lines.join(' '), text);
    assert.ok(long.height / long.width > .65 && long.height / long.width < 1.8);
    assert.ok(long.width <= 512 && long.height <= 1024);
    const sprite = avatar.children[0] as THREE.Sprite;
    assert.equal(sprite.scale.x / sprite.scale.y, long.width / long.height);
    assert.equal(sprite.material.sizeAttenuation, true);
  } finally { bubble.dispose(); fixture.restore(); }
});

test('own bubble is 60% size with half-opacity background; other players keep normal size', () => {
  const fixture = canvasFixture(), ownAvatar = new THREE.Group(), otherAvatar = new THREE.Group();
  const own = new SpeechBubble(ownAvatar, undefined, undefined, 2.0, { scale: .6, backgroundAlpha: .47 });
  const other = new SpeechBubble(otherAvatar);
  try {
    own.show('Hello'); other.show('Hello');
    const ownSprite = ownAvatar.children[0] as THREE.Sprite;
    const otherSprite = otherAvatar.children[0] as THREE.Sprite;
    assert.ok(Math.abs(ownSprite.scale.x / otherSprite.scale.x - .6) < 1e-8);
    assert.ok(Math.abs(ownSprite.scale.y / otherSprite.scale.y - .6) < 1e-8);
    assert.equal(fixture.canvases[0].backgrounds[0], 'rgba(18,22,19,0.47)');
    assert.equal(fixture.canvases[1].backgrounds[0], 'rgba(18,22,19,0.94)');
    assert.equal(ownSprite.material.transparent, true);
  } finally { own.dispose(); other.dispose(); fixture.restore(); }
});

test('speech participates in world depth before later transparent artwork', () => {
  const fixture = canvasFixture(); const avatar = new THREE.Group(); const bubble = new SpeechBubble(avatar);
  try {
    bubble.show('Depth'); const sprite = avatar.children[0] as THREE.Sprite;
    assert.equal(sprite.material.depthTest, true);
    assert.equal(sprite.material.depthWrite, true);
    assert.ok(sprite.material.alphaTest > 0);
    assert.equal(sprite.renderOrder, 0);
  } finally { bubble.dispose(); fixture.restore(); }
});

test('speech range uses speaker world eye position, includes 15m and can reappear without allocating', () => {
  const fixture = canvasFixture(); const parent = new THREE.Group(); const avatar = new THREE.Group(); parent.add(avatar);
  parent.position.x = 10; avatar.position.x = 5;
  const listener = new THREE.Vector3(0, 1.72, 0);
  const bubble = new SpeechBubble(avatar, () => listener);
  try {
    bubble.show('Nearby'); const sprite = avatar.children[0] as THREE.Sprite;
    assert.equal(sprite.visible, true);
    listener.x = -.01; bubble.update(); assert.equal(sprite.visible, false);
    listener.x = 1; bubble.update(); assert.equal(sprite.visible, true);
    assert.equal(fixture.canvases.length, 1);
    let textureDisposals = 0; let materialDisposals = 0;
    sprite.material.map!.addEventListener('dispose', () => textureDisposals++);
    sprite.material.addEventListener('dispose', () => materialDisposals++);
    bubble.dispose(); bubble.dispose();
    assert.equal(textureDisposals, 1); assert.equal(materialDisposals, 1);
  } finally { bubble.dispose(); fixture.restore(); }
});

test('remote speech range follows interpolated avatar rather than future target', () => {
  const fixture = canvasFixture(); const scene = new THREE.Scene(); const listener = new THREE.Vector3(6, 1.72, 0);
  const players = new RemotePlayers(scene, () => listener);
  try {
    players.joined({ playerId: 'speaker', displayName: 'Speaker', state: { position: [20, 1.72, 0], rotation: [0, 0, 0], movement: 'idle' } }, null);
    players.update(0); players.say('speaker', 'Hello');
    const avatar = scene.children[0]; const sprite = avatar.children.at(-1) as THREE.Sprite;
    assert.equal(sprite.visible, true);
    players.state('speaker', { position: [40, 1.72, 0], rotation: [0, 0, 0], movement: 'walk' });
    players.update(0); assert.equal(avatar.position.x, 20); assert.equal(sprite.visible, true);
    players.update(.1); assert.ok(avatar.position.x > 21); assert.equal(sprite.visible, false);
    listener.copy(avatar.position).y = 1.72; players.update(0); assert.equal(sprite.visible, true);
    assert.equal(sprite.parent, avatar);
    players.clear(); assert.equal(scene.children.length, 0);
  } finally { players.clear(); fixture.restore(); }
});
