/** Local undo window for Finish; this is not a server protection lease. */
export class PieceEditGrace {
  expiresAt = 0;
  private timer: unknown;
  constructor(private now = () => Date.now(),
    private schedule: (callback: () => void, delay: number) => unknown = (callback, delay) => setTimeout(callback, delay),
    private cancel: (timer: unknown) => void = timer => clearTimeout(timer as ReturnType<typeof setTimeout>)) {}
  start(complete: () => void): number {
    this.resume();
    this.expiresAt = this.now() + 60_000;
    this.timer = this.schedule(() => { this.timer = undefined; this.expiresAt = 0; complete(); }, 60_000);
    return this.expiresAt;
  }
  resume(): void {
    if (this.timer !== undefined) this.cancel(this.timer);
    this.timer = undefined;
    this.expiresAt = 0;
  }
}
