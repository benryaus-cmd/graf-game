import type { CameraMode } from '@/game/worldTypes';

type Timer = ReturnType<typeof setTimeout>;

export class EmoteViewReturn {
  private timer: Timer | null = null;

  constructor(
    private readonly schedule: (callback: () => void, delay: number) => Timer = (callback, delay) => setTimeout(callback, delay),
    private readonly clear: (timer: Timer) => void = timer => clearTimeout(timer),
  ) {}

  choose(view: CameraMode, show: (view: CameraMode) => void): void {
    if (view !== 'first' && this.timer === null) {
      show('third');
      return;
    }
    this.cancel();
    if (view === 'first') show('third');
    this.timer = this.schedule(() => {
      this.timer = null;
      show('first');
    }, 2000);
  }

  cancel(): void {
    if (this.timer !== null) this.clear(this.timer);
    this.timer = null;
  }
}
