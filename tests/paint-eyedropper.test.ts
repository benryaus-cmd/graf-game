import test from 'node:test';
import assert from 'node:assert/strict';
import type { PaintWall } from '../src/game/worldTypes';
import { samplePaintColour } from '../src/game/paintEyedropper';

function wall(pixels: number[][], visible = pixels.map(() => true)): PaintWall {
  return { layers: pixels.map((pixel, index) => ({
    mesh: { visible: visible[index] }, contexts: [{ canvas: { width: 32, height: 32 }, getImageData: () => ({ data: pixel }) }],
    ensureFace: () => { throw Error('Eyedropper must not allocate a face'); },
  })) } as unknown as PaintWall;
}
test('eyedropper samples visible ink layers in drawing order without creating canvases', () => {
  assert.equal(samplePaintColour(wall([[255, 0, 0, 255], [0, 0, 255, 128]]), 0, .5, .5), '#7f0080');
  assert.equal(samplePaintColour(wall([[255, 0, 0, 255], [0, 0, 255, 255]], [true, false]), 0, .5, .5), '#ff0000');
  assert.equal(samplePaintColour(wall([[80, 160, 240, 128]]), 0, .5, .5), '#50a0f0');
  assert.equal(samplePaintColour(wall([[0, 0, 0, 0]]), 0, .5, .5), null);
});
test('eyedropper accepts canvas borders and safely handles unreadable paint', () => {
  const w = wall([[10, 20, 30, 255]]);
  assert.equal(samplePaintColour(w, 0, 1, 0), '#0a141e');
  assert.equal(samplePaintColour(w, 0, NaN, .5), null);
  w.layers[0].contexts[0]!.getImageData = () => { throw Error('SecurityError'); };
  assert.equal(samplePaintColour(w, 0, .5, .5), null);
});
