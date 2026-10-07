import type { ChatMessage, OnlinePlayer } from './protocol';

/** Session-local identities for player/chat UI. No requests or authority decisions. */
export class PlayerDirectory {
  private profiles = new Map<string, OnlinePlayer>();
  sync(players: OnlinePlayer[], messages: ChatMessage[]): void {
    for (const player of players) this.profiles.set(player.playerId, player);
    for (const message of messages) {
      const known = this.profiles.get(message.playerId);
      if (known) {
        if (!known.username && message.username) this.profiles.set(message.playerId, { ...known, username: message.username, nickName: message.nickName || known.nickName });
        continue;
      }
      this.profiles.set(message.playerId, { playerId: message.playerId, username: message.username ?? '', nickName: message.nickName || message.displayName });
    }
    const retained = new Set([...players.map(player => player.playerId), ...messages.map(message => message.playerId)]);
    for (const id of this.profiles.keys()) if (!retained.has(id)) this.profiles.delete(id);
  }
  get(playerId: string): OnlinePlayer | null { return this.profiles.get(playerId) ?? null; }
}
