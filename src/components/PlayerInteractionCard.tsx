import { useEffect, useRef, useState } from 'react';
import GameSheet from './GameSheet';
import type { ServerRole } from '@/multiplayer/permissions';
import type { MultiplayerView } from '@/multiplayer/protocol';
import { buildAdminAction, canUseAdminActions, type AdminAction, type AdminActionOptions } from '@/multiplayer/adminActions';

const ROLES: ServerRole[] = ['player', 'moderator', 'admin', 'owner'];
type SelectedPlayer = NonNullable<MultiplayerView['selectedPlayer']> & { online?: boolean };

interface Props {
  isSelf?: boolean; onPlayers?: () => void; onChat?: () => void;
  open?: boolean; onClose?: () => void;
  selected?: SelectedPlayer | null;
  ownRole?: ServerRole;
  connected: boolean;
  notice?: string;
  roleChange?: MultiplayerView['roleChange'];
  onSetRole: (username: string, role: ServerRole) => boolean;
  onAdminAction: (action: AdminAction, targetUsername: string, options: AdminActionOptions) => boolean;
  adminResult?: MultiplayerView['adminResult'];
}

const ACTION_ACKS: Record<AdminAction, string> = {
  'give-credits': 'admin_give_credits_complete', kick: '', ban: 'admin_ban_complete', unban: 'admin_unban_complete',
};
const DURATIONS: Array<{ label: string; value: number | null }> = [
  { label: '10 MIN', value: 600 }, { label: '1 HOUR', value: 3600 }, { label: '1 DAY', value: 86400 },
  { label: '7 DAYS', value: 604800 }, { label: 'PERMANENT', value: null },
];

export default function PlayerInteractionCard({ isSelf, onPlayers, onChat, open = true, onClose = () => {}, selected, ownRole, connected, notice, roleChange, onSetRole, onAdminAction, adminResult }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<{ username: string; role: ServerRole } | null>(null);
  const [success, setSuccess] = useState('');
  const [actionPending, setActionPending] = useState<{ action: AdminAction; username: string; amount?: number } | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [creditChoice, setCreditChoice] = useState('10');
  const [customAmount, setCustomAmount] = useState('');
  const [duration, setDuration] = useState<number | null>(600);
  const [reason, setReason] = useState('');
  const handledAdminResult = useRef<Props['adminResult']>(undefined);
  useEffect(() => { setExpanded(false); setPending(null); setSuccess(''); setActionPending(null); setActionMessage(''); }, [selected?.playerId]);
  useEffect(() => {
    if (!connected) {
      setPending(null);
      if (actionPending) {
        setActionPending(null);
        setActionMessage('Admin request ended because the connection closed.');
      }
    }
  }, [connected, actionPending]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => { setPending(null); setSuccess('No server confirmation received. You can try again.'); }, 10_000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    if (!roleChange || !pending || roleChange.targetUsername.replace(/^@/, '').toLowerCase() !== pending.username.toLowerCase() || roleChange.role !== pending.role) return;
    setPending(null); setSuccess(`@${pending.username} is now ${roleChange.role}.`);
  }, [roleChange, pending]);
  useEffect(() => {
    if (!adminResult || adminResult === handledAdminResult.current || !actionPending || adminResult.type !== ACTION_ACKS[actionPending.action] ||
        adminResult.targetUsername.replace(/^@/, '').toLowerCase() !== actionPending.username.toLowerCase() ||
        (actionPending.action === 'give-credits' && adminResult.amount !== undefined && adminResult.amount !== actionPending.amount)) return;
    handledAdminResult.current = adminResult;
    setActionPending(null);
    const result = actionPending.action === 'give-credits' && Number.isSafeInteger(adminResult.balance)
      ? `Credits granted to @${actionPending.username}. New balance: ${adminResult.balance}.`
      : actionPending.action === 'ban' && adminResult.permanent
        ? `Permanent ban confirmed for @${actionPending.username}.`
        : actionPending.action === 'ban' && typeof adminResult.bannedUntil === 'number'
          ? `Ban confirmed for @${actionPending.username} until ${new Date(adminResult.bannedUntil).toLocaleString()}.`
          : `Server confirmed ${actionPending.action.replace('-', ' ')} for @${actionPending.username}.`;
    setActionMessage(result);
  }, [adminResult, actionPending]);
  useEffect(() => {
    if (!actionPending) return;
    const timer = window.setTimeout(() => { setActionPending(null); setActionMessage('No server confirmation received. Check the connection and try again.'); }, 10_000);
    return () => window.clearTimeout(timer);
  }, [actionPending]);
  if (!selected || !open) return null;
  const role = selected.role;
  const canManage = connected && selected.online !== false && (ownRole === 'owner' || (ownRole === 'admin' && !!role && role !== 'owner'));
  const canAdmin = !isSelf && connected && canUseAdminActions(ownRole, role);
  const roles = ownRole === 'owner' ? ROLES : ownRole === 'admin' ? ROLES.filter(role => role !== 'owner') : [];
  const username = selected.username.replace(/^@/, '');
  const selectedAmount = creditChoice === 'custom' ? Number(customAmount) : Number(creditChoice);
  const requestAction = (action: AdminAction, options: AdminActionOptions = {}) => {
    if (!canAdmin || !username || actionPending || (selected.online === false && action !== 'unban')) return;
    const message = buildAdminAction(ownRole, role, action, username, options);
    if (!message) { setActionMessage('This action is unavailable for the selected player or its values are invalid.'); return; }
    if (onAdminAction(action, username, options)) {
      const amount = action === 'give-credits' ? options.amount : undefined;
      if (action === 'kick') {
        setActionPending(null);
        setActionMessage(`Kick requested for @${username}. Waiting for the player to leave.`);
      } else {
        setActionPending({ action, username, amount });
        setActionMessage(`Request sent. Waiting for the server to confirm ${action.replace('-', ' ')}.`);
      }
    } else setActionMessage('Request could not be sent. Check the connection and your role.');
  };
  return <GameSheet title="PLAYER" onClose={onClose} closeLabel="Close player details" className="player-sheet"><div className="player-interaction-card">
    <div><strong>{selected.nickName || 'PLAYER'}</strong><div className="player-interaction-handle">{username ? `@${username}` : 'Aippy tag unavailable'}</div><small className="player-session-id">Session: {selected.playerId}</small>
      {canAdmin && <div className="player-interaction-role">Current role: {role ?? 'Unknown'}</div>}
      {selected.online === false && <div className="player-interaction-role">OFFLINE</div>}</div>
    {onPlayers && <button type="button" onClick={onPlayers}>BACK TO PLAYERS</button>}
    {onChat && <button type="button" onClick={onChat}>BACK TO CHAT</button>}
    {canAdmin && username && selected.online !== false && <button type="button" className="player-kick" disabled={!!actionPending} onClick={() => requestAction('kick', { reason })}>KICK PLAYER</button>}
    {canAdmin && username && <div className="player-role-admin">
      <button type="button" className="player-role-admin-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>ADMIN</button>
      {expanded && <div className="player-role-options" aria-label="Assign role">
        {roles.map(option => <button type="button" key={option} disabled={!canManage || !username || option === role || !!pending}
          onClick={() => { if (onSetRole(username, option)) { setPending({ username, role: option }); setSuccess(''); } }}>
          {option.toUpperCase()}
        </button>)}
        <div className="player-admin-actions" aria-label="Player actions" style={{ display: 'grid', gap: 7, width: '100%', paddingTop: 8 }}>
          <strong>PLAYER ACTIONS</strong>
          <div className="player-admin-action-row" aria-label="Credit amount">
            {[10, 50, 100, 500].map(amount => <button type="button" key={amount} aria-pressed={creditChoice === String(amount)} disabled={!!actionPending}
              onClick={() => setCreditChoice(String(amount))}>{amount}</button>)}
            <button type="button" aria-pressed={creditChoice === 'custom'} disabled={!!actionPending} onClick={() => setCreditChoice('custom')}>CUSTOM</button>
          </div>
          {creditChoice === 'custom' && <label>Custom credits <input type="number" min="1" max="1000000000" step="1" value={customAmount} onChange={event => setCustomAmount(event.target.value)} /></label>}
          {selected.online !== false && <button type="button" disabled={!Number.isSafeInteger(selectedAmount) || selectedAmount < 1 || selectedAmount > 1_000_000_000 || !!actionPending}
            onClick={() => requestAction('give-credits', { amount: selectedAmount, reason })}>GIVE CREDITS</button>
          }
          <label>Ban duration <select value={duration === null ? 'permanent' : String(duration)} disabled={!!actionPending}
            onChange={event => setDuration(event.target.value === 'permanent' ? null : Number(event.target.value))}>
            {DURATIONS.map(option => <option key={option.label} value={option.value === null ? 'permanent' : String(option.value)}>{option.label}</option>)}
          </select></label>
          <label>Optional reason <input type="text" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <div className="player-admin-action-row">
            {selected.online !== false && <>
              <button type="button" disabled={!!actionPending} onClick={() => requestAction('ban', { durationSeconds: duration, reason })}>BAN</button>
            </>}
            <button type="button" disabled={!!actionPending} onClick={() => requestAction('unban', { reason })}>UNBAN</button>
          </div>
        </div>
      </div>}
    </div>}
    {pending && <p role="status">Waiting for the server to assign {pending.role} to @{pending.username}…</p>}
    {success && <p role="status">{success}</p>}
    {actionPending && <p role="status">{actionMessage}</p>}
    {!actionPending && actionMessage && <p role={actionMessage.startsWith('Request could not') || actionMessage.startsWith('No server') ? 'alert' : 'status'}>{actionMessage}</p>}
    {notice && <p role="alert">{notice}</p>}
  </div></GameSheet>;
}
