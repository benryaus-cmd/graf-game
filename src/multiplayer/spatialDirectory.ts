import { readPlayer, type OnlinePlayer } from './protocol';
import type { ServerRole } from './permissions';

/** Room-wide identity presence. This class never creates or updates a 3D avatar. */
export class SpatialDirectory {
  private players = new Map<string, OnlinePlayer>();
  get count(): number { return this.players.size; }
  clear(): void { this.players.clear(); }
  snapshot(values: unknown[], ownId: string | null): void {
    this.clear(); for (const value of values) this.joined(value, ownId);
  }
  joined(value: unknown, ownId: string | null): void {
    const player = readPlayer(value);
    if (!player || player.playerId === ownId) return;
    const existing = this.players.get(player.playerId);
    this.players.set(player.playerId, { playerId: player.playerId, username: player.username ?? existing?.username ?? '', nickName: player.nickName || player.displayName || existing?.nickName || 'PLAYER', role: player.role ?? existing?.role });
  }
  left(playerId: string): void { this.players.delete(playerId); }
  get(playerId: string): OnlinePlayer | null { return this.players.get(playerId) ?? null; }
  roster(): OnlinePlayer[] { return [...this.players.values()]; }
  roleForUsername(username: string): ServerRole | undefined {
    const normalized = username.replace(/^@/, '').trim().toLowerCase();
    return this.roster().find(player => player.username.toLowerCase() === normalized)?.role;
  }
  roleChanged(playerId: string, username: string, role: ServerRole): void {
    const player = this.players.get(playerId);
    if (player) this.players.set(playerId, { ...player, username: username || player.username, role });
  }
}
