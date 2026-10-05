import test from 'node:test';
import assert from 'node:assert/strict';
import { elementPointerIsRotated, viewportPoint } from '../src/game/pointerCoordinates';

const rect = { left: 100, top: 200, width: 300, height: 500 };

test('pointer coordinates stay in ordinary viewport axes when unrotated', () => {
  assert.deepEqual(viewportPoint(175, 325, rect, false), { x: 0.25, y: 0.25 });
});

test('pointer coordinates invert the counter-clockwise 90 degree viewport rotation', () => {
  assert.deepEqual(viewportPoint(100, 700, rect, true), { x: 0, y: 0 });
  assert.deepEqual(viewportPoint(100, 200, rect, true), { x: 1, y: 0 });
  assert.deepEqual(viewportPoint(400, 200, rect, true), { x: 1, y: 1 });
  assert.deepEqual(viewportPoint(400, 700, rect, true), { x: 0, y: 1 });
  assert.deepEqual(viewportPoint(175, 325, rect, true), { x: 0.75, y: 0.25 });
});

test('portrait wrapper detection does not depend on physical orientation', () => {
  const portraitWrapper = { closest: (selector: string) => selector === '.game-portrait' ? {} : null } as unknown as Element;
  const ordinaryElement = { closest: () => null } as unknown as Element;
  assert.equal(elementPointerIsRotated(portraitWrapper), true);
  assert.equal(elementPointerIsRotated(ordinaryElement), false);
});
