import { useEffect, useState } from 'react';
import type { ServerRole } from '@/multiplayer/permissions';
import type { MultiplayerView } from '@/multiplayer/protocol';

const ROLES: ServerRole[] = ['player', 'moderator', 'admin', 'owner'];

interface Props {
  selected?: MultiplayerView['selectedPlayer'];
  ownRole?: ServerRole;
  connected: boolean;
  notice?: string;
  roleChange?: MultiplayerView['roleChange'];
  onSetRole: (username: string, role: ServerRole) => boolean;
}

export default function PlayerInteractionCard({ selected, ownRole, connected, notice, roleChange, onSetRole }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<{ username: string; role: ServerRole } | null>(null);
  const [success, setSuccess] = useState('');
  useEffect(() => { setExpanded(false); setPending(null); setSuccess(''); }, [selected?.playerId]);
  useEffect(() => { if (notice || !connected) setPending(null); }, [notice, connected]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => { setPending(null); setSuccess('No server confirmation received. You can try again.'); }, 10_000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    if (!roleChange || !pending || roleChange.targetUsername.replace(/^@/, '').toLowerCase() !== pending.username.toLowerCase() || roleChange.role !== pending.role) return;
    setPending(null); setSuccess(`@${pending.username} is now ${roleChange.role}.`);
  }, [roleChange, pending]);
  if (!selected) return null;
  const role = selected.role;
  const canManage = connected && (ownRole === 'owner' || (ownRole === 'admin' && role !== 'owner'));
  const roles = ownRole === 'owner' ? ROLES : ownRole === 'admin' ? ROLES.filter(role => role !== 'owner') : [];
  const username = selected.username.replace(/^@/, '');
  return <section className="player-interaction-card" aria-label="Nearby player">
    <div><strong>{selected.nickName || 'PLAYER'}</strong><div className="player-interaction-handle">@{username || 'unknown'}</div>
      <div className="player-interaction-role">Current role: {role ?? 'Unknown'}</div></div>
    {canManage && <div className="player-role-admin">
      <button type="button" className="player-role-admin-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>ADMIN</button>
      {expanded && <div className="player-role-options" aria-label="Assign role">
        {roles.map(option => <button type="button" key={option} disabled={!username || option === role || !!pending}
          onClick={() => { if (onSetRole(username, option)) { setPending({ username, role: option }); setSuccess(''); } }}>
          {option.toUpperCase()}
        </button>)}
      </div>}
    </div>}
    {pending && <p role="status">Waiting for the server to assign {pending.role} to @{pending.username}…</p>}
    {success && <p role="status">{success}</p>}
    {notice && <p role="alert">{notice}</p>}
  </section>;
}
