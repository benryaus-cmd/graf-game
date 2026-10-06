import type { Message, MultiplayerStatus } from './protocol';

export interface SocketLike {
  readyState: number; bufferedAmount: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null; onclose: (() => void) | null;
  send(data: string): void; close(): void;
}

export interface PlayerIdentity { username?: string; nickName?: string }

export class MultiplayerConnection {
  playerId: string | null = null;
  protocol = 1;
  capabilities: string[] = [];
  connected = false;
  private socket: SocketLike | null = null;
  private generation = 0;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private sentAt: number[] = [];
  private roomId = 'public';
  constructor(
    private url: string,
    private onStatus: (status: MultiplayerStatus) => void,
    private onMessage: (message: Message) => void,
    private makeSocket: (url: string) => SocketLike = url => new WebSocket(url) as unknown as SocketLike,
  ) {}

  connect(displayName: string, roomId: string, identity: PlayerIdentity = {}): void {
    this.closeSocket();
    this.roomId = roomId;
    const generation = this.generation;
    this.onStatus({ phase: 'connecting', playerCount: 0 });
    let socket: SocketLike;
    try { socket = this.makeSocket(this.url); }
    catch { this.fail('Unable to connect. Solo is still available.'); return; }
    this.socket = socket;
    this.timeout = setTimeout(() => this.fail('Connection timed out. Try Reconnect or return to solo.'), 12_000);
    socket.onopen = () => {};
    socket.onmessage = event => {
      if (generation !== this.generation) return;
      let message: Message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'hello') {
        if ((message.protocol !== 1 && message.protocol !== 2) || typeof message.playerId !== 'string') {
          this.fail(`Unsupported multiplayer protocol (${String(message.protocol)}).`); return;
        }
        this.playerId = message.playerId;
        this.protocol = message.protocol as number;
        this.capabilities = Array.isArray(message.capabilities) ? message.capabilities.filter((v): v is string => typeof v === 'string') : [];
        const join: Message = { type: 'join', ...(this.protocol === 2 ? { protocol: 2 } : {}), roomId, displayName: displayName.trim().slice(0, 40) || 'PLAYER' };
        if (this.protocol === 2) {
          const username = identity.username?.trim().slice(0, 40);
          const nickName = identity.nickName?.trim().slice(0, 40);
          if (username) join.username = username;
          if (nickName) join.nickName = nickName;
        }
        this.sendRaw(join);
      } else if (message.type === 'world_snapshot') {
        if (
          !this.playerId ||
          message.playerId !== this.playerId ||
          message.roomId !== this.roomId
        ) return;

        if (!Array.isArray(message.strokes)) return;

        this.clearTimeout();
        this.connected = true;

        const playerCount =
          typeof message.playerCount === 'number'
            ? message.playerCount
            : Array.isArray(message.players)
              ? message.players.length
              : 1;

        this.onMessage(message);
        this.onStatus({
          phase: 'connected',
          playerCount,
        });
      } else if (message.type === 'error') {
        const notices: Record<string, string> = {
          room_full: 'The public room is full. Try again later.', verified_account_required: 'Verified Aippy accounts are required for inventory and trading.',
          maintenance: 'Multiplayer is temporarily unavailable.', protocol_mismatch: 'This game needs a multiplayer update.',
          rate_limited: 'Too many updates. Please wait a moment.', invalid_artwork: 'This artwork could not be shared.',
        };
        const notice = typeof message.message === 'string' ? message.message.slice(0, 160) :
          typeof message.code === 'string' ? notices[message.code] ?? ('Server rejected an update: ' + message.code.slice(0, 80)) : 'Server rejected an update.';
        if (!this.connected) this.fail(notice);
        else { this.onStatus({ phase: 'connected', playerCount: -1, notice }); this.onMessage(message); }
      } else if (message.type === 'kicked' || message.type === 'banned' || message.type === 'maintenance') {
        const reason = typeof message.reason === 'string' ? message.reason.slice(0, 160) : typeof message.message === 'string' ? message.message.slice(0, 160) : '';
        this.fail(message.type === 'banned' ? `Banned from multiplayer${reason ? ': ' + reason : '.'}` : reason || 'Multiplayer session ended.');
      } else if (message.type === 'ping') {
        this.sendRaw({ type: 'pong', ...(message.timestamp !== undefined ? { timestamp: message.timestamp } : {}) });
      } else if (this.connected || (this.playerId && ['account_state', 'permissions', 'credit_balance'].includes(message.type))) this.onMessage(message);
    };
    socket.onerror = () => { if (generation === this.generation) this.fail('Connection lost. Offline paint stays local; Reconnect to resync.'); };
    socket.onclose = () => { if (generation === this.generation) this.fail('Disconnected. Offline paint stays local; Reconnect to resync.'); };
  }
  send(message: Message): boolean { return this.connected && this.sendRaw(message); }
  disconnect(): void {
    this.closeSocket();
    this.onStatus({ phase: 'solo', playerCount: 0 });
  }
  private sendRaw(message: Message): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return false;
    const now = Date.now();
    this.sentAt = this.sentAt.filter(t => now - t < 1000);
    const data = JSON.stringify(message);
    if (socket.bufferedAmount > 256_000 || this.sentAt.length >= 80 ||
        new TextEncoder().encode(data).length > 32_000) {
      this.fail('Network is congested. Painting stays local; use Reconnect to resync.'); return false;
    }
    try { socket.send(data); this.sentAt.push(now); return true; }
    catch { this.fail('Unable to send. Painting stays local; use Reconnect to resync.'); return false; }
  }
  private fail(notice: string): void {
    this.closeSocket();
    this.onStatus({ phase: 'disconnected', playerCount: 0, notice });
  }
  private clearTimeout(): void { if (this.timeout) clearTimeout(this.timeout); this.timeout = null; }
  private closeSocket(): void {
    this.generation++;
    this.clearTimeout();
    this.connected = false; this.playerId = null; this.sentAt = [];
    const socket = this.socket; this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
    }
  }
}
