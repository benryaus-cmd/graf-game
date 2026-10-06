export type TutorialStep =
  | 'welcome'
  | 'move'
  | 'look'
  | 'select-canvas'
  | 'size-canvas'
  | 'move-canvas'
  | 'start-painting'
  | 'tools'
  | 'paint'
  | 'finish'
  | 'save'
  | 'radio'
  | 'multiplayer'
  | 'multiplayer-info'
  | 'complete';

export const TUTORIAL_STORAGE_KEY = 'graffciti.tutorial.v1';

export const TUTORIAL_ORDER: readonly TutorialStep[] = [
  'welcome',
  'move',
  'look',
  'select-canvas',
  'size-canvas',
  'move-canvas',
  'start-painting',
  'tools',
  'paint',
  'finish',
  'save',
  'radio',
  'multiplayer',
  'multiplayer-info',
  'complete',
];

interface TutorialWorkspace { selected: boolean; started?: boolean; hasPaint?: boolean; editableUntil?: number }

export function tutorialStartStep(view: TutorialWorkspace): TutorialStep {
  if (view.editableUntil) return 'save';
  if (view.hasPaint) return 'finish';
  if (view.started) return 'tools';
  return view.selected ? 'size-canvas' : 'move';
}

/** Observe existing game state; never perform a game action or infer a save before grace. */
export function tutorialObservedStep(step: TutorialStep, view: TutorialWorkspace, options: { reviewing?: boolean; saveArmed?: boolean } = {}): TutorialStep {
  if (options.reviewing) return step;
  if (step === 'select-canvas' && view.selected) return 'size-canvas';
  if (step === 'start-painting' && view.started) return 'tools';
  if (step === 'paint' && view.hasPaint) return 'finish';
  if (step === 'save' && options.saveArmed) {
    if (!view.selected) return 'radio';
    if (view.started && !view.editableUntil) return 'paint';
  }
  return step;
}

export function nextTutorialStep(step: TutorialStep): TutorialStep {
  const index = TUTORIAL_ORDER.indexOf(step);
  return TUTORIAL_ORDER[Math.min(TUTORIAL_ORDER.length - 1, index + 1)];
}

export function tutorialProgress(step: TutorialStep): { current: number; total: number } {
  const guided: readonly TutorialStep[] = TUTORIAL_ORDER.filter(value => value !== 'welcome' && value !== 'complete');
  const index = guided.indexOf(step);
  return {
    current: index < 0 ? (step === 'complete' ? guided.length : 0) : index + 1,
    total: guided.length,
  };
}

export function readTutorialCompleted(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'complete';
  } catch {
    return false;
  }
}

export function writeTutorialCompleted(completed: boolean): void {
  try {
    if (completed) localStorage.setItem(TUTORIAL_STORAGE_KEY, 'complete');
    else localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    // Tutorial persistence is best effort and must never block gameplay.
  }
}
