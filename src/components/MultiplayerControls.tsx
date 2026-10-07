import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatMuteState, MultiplayerStatus } from '@/multiplayer/protocol';
import MultiplayerChat from './MultiplayerChat';
import GameSheet from './GameSheet';
import { unreadMessages } from './chatPresentation';

interface Props {
  status: MultiplayerStatus; displayName: string; avatar?: string; profileLoading: boolean;
  onJoin: () => void; onLeave: () => void;
  chatMute?: ChatMuteState | null; messages: ChatMessage[]; onChat: (text: string) => void; onResync: () => void;
  chatOpen?: boolean; onChatToggle?: () => void; onChatClose?: () => void; onOpenMenu?: () => void; onPlayers?: () => void; onPlayerSelect?: (playerId: string) => void;
}
export default function MultiplayerControls({ status, displayName, profileLoading, onJoin, chatMute, messages, onChat, onResync, chatOpen = false, onChatToggle, onChatClose, onOpenMenu, onPlayers, onPlayerSelect }: Props) {
  const [unread, setUnread] = useState(0);
  const [joinPromptOpen, setJoinPromptOpen] = useState(false);
  const seen = useRef(new Set(messages.map(message => message.id)));
  useEffect(() => {
    const count = unreadMessages(messages, seen.current);
    seen.current = new Set(messages.map(message => message.id));
    setUnread(value => chatOpen || status.phase === 'solo' || messages.length === 0 ? 0 : Math.min(99, value + count));
  }, [messages, chatOpen, status.phase]);
  const label = status.phase === 'solo' ? 'SOLO' : status.phase === 'connecting' ? 'JOINING…' : status.phase === 'connected' ? String(status.playerCount) : 'OFFLINE';
  return <>
    <button type="button" className={`connection-pill phase-${status.phase}`} aria-label={`Multiplayer: ${status.phase === 'connected' ? `Online · ${status.playerCount}` : label}. ${status.phase === 'connected' ? 'See online players' : status.phase === 'solo' ? 'Join multiplayer' : 'Open connection options'}`} onClick={status.phase === 'connected' ? onPlayers : status.phase === 'solo' ? () => setJoinPromptOpen(true) : onOpenMenu}><i />{label}</button>
    <button type="button" className="chat-trigger" aria-label={`Open public chat${unread ? `, ${unread} unread messages` : ''}`} aria-expanded={chatOpen} onClick={onChatToggle}>CHAT{unread > 0 && <b>{unread}</b>}</button>
    {joinPromptOpen && status.phase === 'solo' && <GameSheet title="Join multiplayer?" className="multiplayer-join-sheet" onClose={() => setJoinPromptOpen(false)} closeLabel="Cancel joining multiplayer">
      <div className="button-row">
        <button type="button" className="ui-primary" disabled={profileLoading} onClick={() => { if (profileLoading) return; setJoinPromptOpen(false); onJoin(); }}>YES</button>
        <button type="button" onClick={() => setJoinPromptOpen(false)}>NO</button>
      </div>
    </GameSheet>}
    {chatOpen && <MultiplayerChat chatMute={chatMute} onPlayerSelect={onPlayerSelect} messages={messages} connected={status.phase === 'connected'} onSend={onChat} onClose={onChatClose ?? (() => {})} onResync={onResync} onJoin={onJoin} joinDisabled={profileLoading} displayName={displayName} />}
  </>;
}
