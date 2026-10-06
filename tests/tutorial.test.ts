import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTutorialStep, tutorialProgress, TUTORIAL_ORDER } from '../src/game/tutorial';

test('tutorial follows the real guided order and terminates at complete', () => {
  for (let index = 0; index < TUTORIAL_ORDER.length - 1; index++) {
    assert.equal(nextTutorialStep(TUTORIAL_ORDER[index]), TUTORIAL_ORDER[index + 1]);
  }
  assert.equal(nextTutorialStep('complete'), 'complete');
});

test('tutorial progress excludes welcome and completion cards', () => {
  assert.deepEqual(tutorialProgress('welcome'), { current: 0, total: 11 });
  assert.deepEqual(tutorialProgress('move'), { current: 1, total: 11 });
  assert.deepEqual(tutorialProgress('multiplayer-info'), { current: 11, total: 11 });
  assert.deepEqual(tutorialProgress('complete'), { current: 11, total: 11 });
});
