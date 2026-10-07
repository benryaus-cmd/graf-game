import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as eyedropper from '../src/game/paintEyedropper';
import { attachWorldControls } from '../src/game/worldControls';

function fixture(rotated = false) {
  const canvas = new EventTarget() as any;
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 200 });
  canvas.closest = () => rotated ? {} : null;
  const previousTarget = new THREE.WebGLRenderTarget(8, 8);
  const state = { target: previousTarget, viewport: new THREE.Vector4(3, 4, 500, 300), scissor: new THREE.Vector4(5, 6, 70, 80), scissorTest: true, face: 2, level: 1 };
  let rendered: any = null;
  let disposed = false;
  let fail = false;
  let renders = 0;
  const renderer = {
    domElement: canvas, outputColorSpace: THREE.SRGBColorSpace,
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(800, 400),
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => state.face,
    getActiveMipmapLevel: () => state.level,
    getViewport: (v: THREE.Vector4) => v.copy(state.viewport),
    getScissor: (v: THREE.Vector4) => v.copy(state.scissor),
    getScissorTest: () => state.scissorTest,
    setViewport: (v: THREE.Vector4) => state.viewport.copy(v),
    setScissor: (v: THREE.Vector4) => state.scissor.copy(v),
    setScissorTest: (value: boolean) => { state.scissorTest = value; },
    setRenderTarget: (target: any, face = 0, level = 0) => { state.target = target; state.face = face; state.level = level; },
    render: (scene: THREE.Scene, camera: any) => {
      renders++;
      rendered = { scene, camera, target: state.target };
      state.target.addEventListener('dispose', () => { disposed = true; });
      if (fail) throw Error('context unavailable');
    },
    readRenderTargetPixels: (target: any, x: number, y: number, w: number, h: number, bytes: Uint8Array) => {
      assert.equal(target, rendered.target);
      assert.deepEqual([x, y, w, h], [0, 0, 1, 1]);
      bytes.set([137, 188, 225, 255]);
    },
    setAnimationLoop: () => {},
  };
  const world: any = { renderer, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(60, 2), mapCamera: new THREE.OrthographicCamera(-8, 8, 4, -4), cameraMode: 'first', walls: [], paintRevision: 0 };
  const reference = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  reference.raycast = () => { throw Error('Visible colour must not raycast'); };
  world.scene.add(reference);
  return { world, state, renderer, previousTarget, get rendered() { return rendered; }, get disposed() { return disposed; }, get renders() { return renders; }, fail: () => { fail = true; } };
}

function sample(world: any, event = { clientX: 110, clientY: 70 }) {
  assert.equal(typeof eyedropper.sampleVisibleWorldColour, 'function', 'visible-scene sampler must exist');
  return eyedropper.sampleVisibleWorldColour(world, event);
}

test('visible eyedropper renders the full scene at one physical pixel with display output and an isolated camera', () => {
  const f = fixture();
  const before = f.world.camera.projectionMatrix.clone();
  assert.equal(sample(f.world), '#89bce1');
  assert.equal(f.rendered.scene, f.world.scene);
  assert.notEqual(f.rendered.camera, f.world.camera);
  assert.deepEqual(f.rendered.camera.view, { enabled: true, fullWidth: 800, fullHeight: 400, offsetX: 200, offsetY: 100, width: 1, height: 1 });
  assert.equal(f.world.camera.view, null);
  assert.deepEqual(f.world.camera.projectionMatrix, before);
  assert.deepEqual([f.rendered.target.width, f.rendered.target.height], [1, 1]);
  assert.equal(f.rendered.target.isXRRenderTarget, true, 'use the renderer display-output path so material tone mapping is retained');
  assert.equal(f.rendered.target.texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(f.rendered.target.texture.internalFormat, 'RGBA8', 'shader-encoded display pixels must not receive a second hardware sRGB transform');
  assert.equal(f.disposed, true);
});

test('visible eyedropper selects workspace then map cameras and maps rotated coordinates', () => {
  const f = fixture(true);
  f.world.cameraMode = 'map';
  sample(f.world);
  assert.equal(f.rendered.camera.isOrthographicCamera, true);
  assert.equal(f.rendered.camera.left, -8);
  assert.equal(f.rendered.camera.view.offsetX, 600);
  assert.equal(f.rendered.camera.view.offsetY, 100);
  const workspaceCamera = new THREE.OrthographicCamera(-2, 2, 1, -1);
  workspaceCamera.setViewOffset(1600, 800, 100, 50, 800, 400);
  f.world.paintWorkspace = { active: true, camera: workspaceCamera };
  sample(f.world);
  assert.equal(f.rendered.camera.left, -2);
  assert.deepEqual(f.rendered.camera.view, { enabled: true, fullWidth: 1600, fullHeight: 800, offsetX: 700, offsetY: 150, width: 1, height: 1 });
  assert.equal(workspaceCamera.view!.width, 800);
});

test('visible eyedropper restores renderer state and disposes targets on render/read failure', () => {
  for (const failure of ['none', 'render', 'read']) {
    const f = fixture();
    if (failure === 'render') f.fail();
    if (failure === 'read') f.renderer.readRenderTargetPixels = () => { throw Error('readback failed'); };
    assert.equal(sample(f.world), failure === 'none' ? '#89bce1' : null);
    assert.equal(f.state.target, f.previousTarget);
    assert.deepEqual(f.state.viewport.toArray(), [3, 4, 500, 300]);
    assert.deepEqual(f.state.scissor.toArray(), [5, 6, 70, 80]);
    assert.equal(f.state.scissorTest, true);
    assert.equal(f.state.face, 2);
    assert.equal(f.state.level, 1);
    assert.equal(f.disposed, true);
  }
});

test('world eyedropper click samples without a wall hit and does no rendering until clicked', () => {
  const f = fixture();
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget() as any;
  const colours: Array<string | null> = [];
  f.world.onColorPick = (colour: string | null) => colours.push(colour);
  const cleanup = attachWorldControls(f.world, { current: { eyedropperActive: true } } as any, () => {}, () => {}, { current: null }, () => {}, () => {});
  try {
    assert.equal(f.renders, 0);
    const event = new Event('pointerdown');
    Object.assign(event, { clientX: 110, clientY: 70, pointerType: 'mouse', isPrimary: true, button: 0, pointerId: 1 });
    f.renderer.domElement.dispatchEvent(event);
    assert.deepEqual(colours, ['#89bce1']);
    assert.equal(f.renders, 1);
    f.fail();
    f.renderer.domElement.dispatchEvent(event);
    assert.deepEqual(colours, ['#89bce1', null]);
  } finally { cleanup(); globalThis.window = previousWindow; }
});
