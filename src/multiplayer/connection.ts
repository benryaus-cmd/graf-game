import type { Message, MultiplayerStatus } from './protocol';

export interface SocketLike {
  readyState: number; bufferedAmount: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null; onclose: (() => void) | null;
  send(data: string): void; close(): void;
}

export interface PlayerIdentity { username?: string; nickName?: string }
export const CLIENT_NETWORK_REVISION = 6;
export const CLIENT_CAPABILITIES = ['spatial_interest_v1', 'spatial_world_delta_v1', 'player_directory_v1', 'basketball_court_v1'];
const UPDATE_NOTICE = 'Update GraffCiti to use multiplayer. Solo is still available.';

export class MultiplayerConnection {
  playerId: string | null = null;
  protocol = 1;
  capabilities: string[] = [];
  connected = false;
  admittedRoomId: string | null = null;
  admittedWorldId: string | null = null;
  private serverClockOffset = 0;
  get serverTime(): number { return Date.now() + this.serverClockOffset; }
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

  connect(displayName: string, roomId: string, identity: PlayerIdentity = {}, initialPosition?: readonly number[], expectedWorldId?: string): void {
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
        if ((typeof message.minimumNetworkRevision === 'number' && message.minimumNetworkRevision > CLIENT_NETWORK_REVISION) ||
          (Array.isArray(message.requiredClientCapabilities) && message.requiredClientCapabilities.some(value => typeof value !== 'string' || !CLIENT_CAPABILITIES.includes(value)))) {
          this.fail(UPDATE_NOTICE); return;
        }
        if ((message.protocol !== 1 && message.protocol !== 2) || typeof message.playerId !== 'string') {
          this.fail(`Unsupported multiplayer protocol (${String(message.protocol)}).`); return;
        }
        this.playerId = message.playerId;
        this.protocol = message.protocol as number;
        this.capabilities = Array.isArray(message.capabilities) ? message.capabilities.filter((v): v is string => typeof v === 'string') : [];
        const join: Message = { type: 'join', ...(this.protocol === 2 ? { protocol: 2 } : {}), roomId, displayName: displayName.trim().slice(0, 40) || 'PLAYER' };
        if (expectedWorldId) {
          if (this.protocol !== 2) { this.fail('The server needs the Town world update. Solo is still available.'); return; }
          join.worldId = expectedWorldId;
        }
        if (this.protocol === 2) {
          const spatial = this.capabilities.includes('spatial_interest_v1');
          if (spatial && (!initialPosition || initialPosition.length !== 3 || !initialPosition.every(value => Number.isFinite(value)))) {
            this.fail('Could not determine your position. Return to solo and try multiplayer again.'); return;
          }
          Object.assign(join, { networkRevision: CLIENT_NETWORK_REVISION, capabilities: [...CLIENT_CAPABILITIES], ...(spatial ? { spatialInterest: true, position: [...initialPosition!] } : {}) });
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

        if (expectedWorldId && message.worldId !== expectedWorldId) {
          this.fail('The server needs the Town world update. Solo is still available.'); return;
        }

        if (!Array.isArray(message.strokes)) return;

        this.clearTimeout();
        this.connected = true;
        this.admittedRoomId = this.roomId;
        this.admittedWorldId = typeof message.worldId === 'string' ? message.worldId : null;
        if (typeof message.serverTime === 'number' && Number.isSafeInteger(message.serverTime) && message.serverTime >= 0) this.serverClockOffset = message.serverTime - Date.now();

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
        if (message.code === 'client_update_required') { this.fail(UPDATE_NOTICE); return; }
        const notices: Record<string, string> = {
          room_full: 'The public room is full. Try again later.', verified_account_required: 'Verified Aippy accounts are required for inventory and trading.',
          bulk_art_removal_busy: 'An art removal is already running. Please wait.', target_role_protected: 'This account is protected from that action.', permission_denied: 'You do not have permission for that action.',
          stroke_undo_unavailable: 'Undo is not available for this piece.', stroke_redo_unavailable: 'Redo is not available for this piece.', stroke_undo_limit: 'Only the last two paint gestures can be undone.',
          undo_unavailable: 'Undo is not available for this piece.', redo_unavailable: 'Redo is not available for this piece.', nothing_to_undo: 'There is nothing to undo.', nothing_to_redo: 'There is nothing to redo.', undo_limit: 'Only the last two paint gestures can be undone.',
          maintenance: 'Multiplayer is temporarily unavailable.', protocol_mismatch: 'This game needs a multiplayer update.',
          rate_limited: 'Too many updates. Please wait a moment.', invalid_artwork: 'This artwork could not be shared.',
        };
        const notice = message.code === 'art_creation_cooldown' ? `Please wait${typeof message.retryAfterMs === 'number' && Number.isFinite(message.retryAfterMs) ? ' ' + Math.max(1, Math.ceil(message.retryAfterMs / 1000)) + ' seconds' : ' a moment'} before creating more art.` : typeof message.code === 'string' && notices[message.code] ? notices[message.code] : typeof message.message === 'string' ? message.message.slice(0, 160) :
          typeof message.code === 'string' ? notices[message.code] ?? ('Server rejected an update: ' + message.code.slice(0, 80)) : 'Server rejected an update.';
        if (!this.connected) this.fail(notice);
        else { this.onStatus({ phase: 'connected', playerCount: -1, notice }); this.onMessage(message); }
      } else if (message.type === 'kicked' || message.type === 'banned' || message.type === 'maintenance') {
        const reason = typeof message.reason === 'string' ? message.reason.slice(0, 160) : typeof message.message === 'string' ? message.message.slice(0, 160) : '';
        this.fail(message.type === 'banned' ? `Banned from multiplayer${reason ? ': ' + reason : '.'}` : reason || 'Multiplayer session ended.');
      } else if (message.type === 'ping') {
        this.sendRaw({ type: 'pong', ...(message.timestamp !== undefined ? { timestamp: message.timestamp } : {}) });
      } else if (message.type === 'client_update_required') { this.fail(UPDATE_NOTICE); }
      else if (this.connected || (!expectedWorldId && this.playerId && ['account_state', 'permissions', 'credit_balance', 'spatial_status', 'chat_mute_state'].includes(message.type))) {
        // Court timestamps describe event time, including scheduled results; they are not clock samples.
        if (!message.type.startsWith('court_') && typeof message.serverTime === 'number' && Number.isSafeInteger(message.serverTime) && message.serverTime >= 0) this.serverClockOffset = message.serverTime - Date.now();
        this.onMessage(message);
      }
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
    this.admittedRoomId = this.admittedWorldId = null; this.capabilities = []; this.serverClockOffset = 0;
    const socket = this.socket; this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
    }
  }
}
