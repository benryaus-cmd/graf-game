import GameSheet from './GameSheet';
import type { OnlinePlayer } from '@/multiplayer/protocol';

interface Props { players: OnlinePlayer[]; ownPlayerId?: string | null; onSelect: (playerId: string) => void; onClose: () => void; onChat: () => void }
export default function PlayersSheet({ players, ownPlayerId, onSelect, onClose, onChat }: Props) {
  return <GameSheet title="ONLINE PLAYERS" subtitle={`${players.length} in this room`} className="players-sheet" onClose={onClose} footer={<button type="button" onClick={onChat}>ROOM CHAT</button>}>
    <div className="online-player-list">{players.length === 0 && <p className="empty-state">Waiting for the room’s player list…</p>}{players.map(player => <button type="button" key={player.playerId} onClick={() => onSelect(player.playerId)} aria-label={`View player ${player.nickName || player.username || 'Player'}`}>
      <span><b>{player.nickName || 'PLAYER'}{player.playerId === ownPlayerId ? ' · YOU' : ''}</b><small>{player.username ? `@${player.username}` : 'Aippy tag unavailable'}</small></span><i aria-hidden="true">›</i>
    </button>)}</div>
  </GameSheet>;
}
