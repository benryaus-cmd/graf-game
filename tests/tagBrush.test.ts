import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleBrushPath, type BrushPathState } from '../src/game/tagBrush';

test('resamples a path at fixed intervals and carries spacing across input segments', () => {
  let state: BrushPathState = { distanceToNext: 5, stampIndex: 0 };
  const first = sampleBrushPath({ x: 0, y: 0 }, { x: 8, y: 0 }, 5, state);
  state = first.state;
  const second = sampleBrushPath({ x: 8, y: 0 }, { x: 12, y: 0 }, 5, state);
  assert.deepEqual(first.stamps.map(({ x }) => x), [5]);
  assert.deepEqual(second.stamps.map(({ x }) => x), [10]);
  assert.equal(second.state.stampIndex, 2);
});

test('zero length path segments do not create duplicate stamps', () => {
  const result = sampleBrushPath({ x: 3, y: 7 }, { x: 3, y: 7 }, 4, { distanceToNext: 4, stampIndex: 0 });
  assert.deepEqual(result.stamps, []);
  assert.deepEqual(result.state, { distanceToNext: 4, stampIndex: 0 });
});
