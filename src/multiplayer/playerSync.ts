import type { PlayerState } from './protocol';

export function interpolatePlayer(current: PlayerState, target: PlayerState, delta: number): PlayerState {
  const blend = 1 - Math.exp(-Math.max(0, delta) * 12);
  return {
    ...target,
    position: current.position.map((n, i) => n + (target.position[i] - n) * blend),
    rotation: current.rotation.map((n, i) => {
      const difference = Math.atan2(Math.sin(target.rotation[i] - n), Math.cos(target.rotation[i] - n));
      return n + difference * blend;
    }),
  };
}

export class PlayerSync {
  private lastAt = 0;
  private last: PlayerState | null = null;
  constructor(private send: (message: { type: string; state: PlayerState }) => boolean) {}
  reset(): void { this.last = null; this.lastAt = 0; }
  update(state: PlayerState, now: number): void {
    if (now - this.lastAt < 100) return;
    const previous = this.last;
    const changed = !previous ||
      state.position.some((v, i) => Math.abs(v - previous.position[i]) > 0.015) ||
      state.rotation.some((v, i) => Math.abs(v - previous.rotation[i]) > 0.01) ||
      state.movement !== previous.movement || state.tool !== previous.tool || state.jumping !== previous.jumping ||
      state.animation !== previous.animation || state.emote !== previous.emote || state.visibleHeldItem !== previous.visibleHeldItem ||
      state.flightState !== previous.flightState || JSON.stringify(state.cosmetics) !== JSON.stringify(previous.cosmetics);
    if (!changed && now - this.lastAt < 2000) return;
    if (this.send({ type: 'player_state', state })) { this.last = state; this.lastAt = now; }
  }
}
