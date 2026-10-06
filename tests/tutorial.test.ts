import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTutorialStep, tutorialProgress, TUTORIAL_ORDER } from '../src/game/tutorial';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('tutorial follows the real guided order and terminates at complete', () => {
  for (let index = 0; index < TUTORIAL_ORDER.length - 1; index++) {
    assert.equal(nextTutorialStep(TUTORIAL_ORDER[index]), TUTORIAL_ORDER[index + 1]);
  }
  assert.equal(nextTutorialStep('complete'), 'complete');
});

test('tutorial progress excludes welcome and completion cards', () => {
  assert.deepEqual(tutorialProgress('welcome'), { current: 0, total: 13 });
  assert.deepEqual(tutorialProgress('move'), { current: 1, total: 13 });
  assert.deepEqual(tutorialProgress('multiplayer-info'), { current: 13, total: 13 });
  assert.deepEqual(tutorialProgress('complete'), { current: 13, total: 13 });
});

test('tools and real saving are separate from drawing and finishing', () => {
  assert.equal(nextTutorialStep('start-painting'), 'tools');
  assert.equal(nextTutorialStep('tools' as any), 'paint');
  assert.equal(nextTutorialStep('finish'), 'save');
  assert.equal(nextTutorialStep('save' as any), 'radio');
});

test('painting with tools open gives an explicit route back to the wall', async () => {
  const { default: Overlay } = await import('../src/components/TutorialOverlay');
  const html = renderToStaticMarkup(createElement(Overlay, {
    step: 'paint', menu: 'paint', onStart() {}, onBack() {}, onSkip() {}, onContinue() {}, onRestart() {}, onClose() {}, onExit() {},
  } as Parameters<typeof Overlay>[0]));
  assert.match(html, /CLOSE TOOLS/);
  assert.match(html, /SKIP STEP/);
  assert.match(html, /Exit tutorial/);
});

test('short-frame tutorial can reveal instructions without permanently occupying the tools workspace', async () => {
  const { default: Overlay } = await import('../src/components/TutorialOverlay');
  const html = renderToStaticMarkup(createElement(Overlay, {
    step: 'tools', menu: 'paint', onStart() {}, onBack() {}, onSkip() {}, onContinue() {}, onRestart() {}, onClose() {}, onExit() {},
  } as Parameters<typeof Overlay>[0]));
  assert.match(html, /Show tutorial instructions/);
  assert.match(html, /CLOSE TOOLS &amp; PAINT/);
});

test('moving canvas minimizes controls but keeps Done Moving reachable', async () => {
  const { default: Hud } = await import('../src/components/PaintWorkspaceHud');
  const html = renderToStaticMarkup(createElement(Hud, {
    view: { selected: true, active: false, moving: true, width: 2, height: 2 }, painting: true, onAction() {},
  }));
  assert.match(html, /is-collapsed/);
  assert.match(html, /DONE MOVING/);
  assert.ok(!html.includes('BOX WIDTH'));
  assert.ok(!html.includes('START PAINTING'));
});

test('tutorial replay resumes an existing piece without clearing it or requiring hidden movement controls', async () => {
  const tutorial = await import('../src/game/tutorial');
  assert.equal(typeof tutorial.tutorialStartStep, 'function');
  const start = tutorial.tutorialStartStep;
  assert.equal(start({ selected: false }), 'move');
  assert.equal(start({ selected: true, started: false }), 'size-canvas');
  assert.equal(start({ selected: true, started: true }), 'tools');
  assert.equal(start({ selected: true, started: true, hasPaint: true }), 'finish');
  assert.equal(start({ selected: true, hasPaint: true, editableUntil: 100 }), 'save');
});

test('Back can review completed steps without automatic progression bouncing forward', async () => {
  const tutorial = await import('../src/game/tutorial');
  assert.equal(typeof tutorial.tutorialObservedStep, 'function');
  const observe = tutorial.tutorialObservedStep;
  const painted = { selected: true, started: true, hasPaint: true };
  assert.equal(observe('start-painting', painted, { reviewing: true }), 'start-painting');
  assert.equal(observe('paint', painted, { reviewing: true }), 'paint');
  assert.equal(observe('start-painting', painted), 'tools');
  assert.equal(observe('paint', painted), 'finish');
});

test('save waits for actual grace completion and Edit Again returns to painting', async () => {
  const tutorial = await import('../src/game/tutorial');
  assert.equal(typeof tutorial.tutorialObservedStep, 'function');
  const observe = tutorial.tutorialObservedStep;
  assert.equal(observe('save', { selected: false }), 'save');
  assert.equal(observe('save', { selected: true, editableUntil: 100 }, { saveArmed: true }), 'save');
  assert.equal(observe('save', { selected: false }, { saveArmed: true }), 'radio');
  assert.equal(observe('save', { selected: true, started: true }, { saveArmed: true }), 'paint');
});
