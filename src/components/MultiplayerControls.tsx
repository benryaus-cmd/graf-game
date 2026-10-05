import type { MultiplayerStatus } from '@/multiplayer/protocol';

interface Props {
  status: MultiplayerStatus; displayName: string; avatar?: string; profileLoading: boolean;
  onJoin: () => void; onLeave: () => void;
}
export default function MultiplayerControls({ status, displayName, avatar, profileLoading, onJoin, onLeave }: Props) {
  const solo = status.phase === 'solo';
  const joining = status.phase === 'connecting';
  return (
    <aside className="multiplayer-controls" aria-label="Multiplayer">
      <div className="multiplayer-main">
        {avatar ? <img className="multiplayer-profile-image" src={avatar} alt="" referrerPolicy="no-referrer" /> :
          <span className="multiplayer-profile-fallback" aria-hidden="true">◉</span>}
        <div className="multiplayer-identity">
          <span>{profileLoading ? 'Loading profile…' : displayName}</span>
          <small role="status" aria-live="polite">
            {solo ? 'SOLO' : joining ? 'CONNECTING…' :
              status.phase === 'connected' ? 'ONLINE · ' + status.playerCount + (status.playerCount === 1 ? ' PLAYER' : ' PLAYERS') : 'DISCONNECTED'}
          </small>
        </div>
        {solo ? (
          <button type="button" onClick={onJoin} disabled={profileLoading}>JOIN MULTIPLAYER</button>
        ) : (
          <div className="multiplayer-buttons">
            {status.phase === 'disconnected' && <button type="button" onClick={onJoin} disabled={profileLoading}>RECONNECT</button>}
            <button type="button" onClick={onLeave}>{joining ? 'CANCEL' : 'SOLO'}</button>
          </div>
        )}
      </div>
      {status.notice && !solo && <p className="multiplayer-notice">{status.notice}</p>}
    </aside>
  );
}
