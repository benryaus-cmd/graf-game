import type { LiveSettings, WorldEngine } from '@/game/worldTypes';
import { jumpWorld } from '@/game/worldMovement';

export function attachKeyboardControls(
  world: WorldEngine,
  settings: { current: LiveSettings },
  keys: Set<string>,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (world.activityLocked) { keys.clear(); return; }
    if (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select, [contenteditable="true"], [role="button"]')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    keys.add(event.code);
    if (event.code === 'Space') jumpWorld(world, settings.current.jumpPower);
  };
  const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}
