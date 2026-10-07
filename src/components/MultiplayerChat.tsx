import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/multiplayer/protocol';
import GameSheet from './GameSheet';
import { isChatNearBottom } from './chatPresentation';

interface Props { messages: ChatMessage[]; connected: boolean; onSend: (text: string) => void; onClose: () => void; onResync: () => void; onJoin?: () => void; joinDisabled?: boolean; displayName?: string; onPlayerSelect?: (playerId: string) => void }
export default function MultiplayerChat({ messages, connected, onSend, onClose, onResync, onJoin, joinDisabled, displayName, onPlayerSelect }: Props) {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [newBelow, setNewBelow] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const lastSent = useRef(-Infinity);
  const follow = useRef(true);
  const toBottom = () => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
    follow.current = true; setNewBelow(false);
  };
  useEffect(() => {
    if (follow.current) toBottom();
    else setNewBelow(true);
  }, [messages]);
  const composer = <>
    {!connected && <div className="chat-connect"><span>Connect to join the conversation.</span>{onJoin && <button type="button" disabled={joinDisabled} onClick={onJoin}>JOIN MULTIPLAYER</button>}</div>}
    <form className="chat-composer" onSubmit={event => {
      event.preventDefault(); const value = text.trim();
      if (!connected || !value) return;
      if (performance.now() - lastSent.current < 1000) { setNotice('Wait a moment before sending again.'); return; }
      lastSent.current = performance.now(); onSend(value); setText(''); setNotice(''); toBottom();
    }}>
      <input aria-label="Message the public room" maxLength={500} value={text} onChange={event => setText(event.target.value)} placeholder={connected ? 'Message the room…' : 'Connect to chat'} disabled={!connected} />
      <button type="submit" disabled={!connected || !text.trim()}>SEND</button>
    </form>{notice && <p className="ui-notice" role="status">{notice}</p>}
  </>;
  return <GameSheet title="PUBLIC CHAT" subtitle={connected ? displayName : 'Offline'} onClose={onClose} closeLabel="Close chat" className="chat-sheet" footer={composer}>
    <div className="multiplayer-chat-messages" ref={list} role="log" aria-live="polite" aria-relevant="additions" onScroll={() => { if (list.current) { follow.current = isChatNearBottom(list.current.scrollTop, list.current.clientHeight, list.current.scrollHeight); if (follow.current) setNewBelow(false); } }}>
      {messages.length === 0 && <p className="empty-state">{connected ? 'Say hello to the room.' : 'Room messages appear when you connect.'}</p>}
      {messages.map(message => <p key={message.id}><button type="button" className="chat-author" aria-label={`View profile of ${message.displayName}`} onClick={() => onPlayerSelect?.(message.playerId)}>{message.displayName}</button><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>{message.text}</span></p>)}
    </div>
    {newBelow && <button type="button" className="chat-new" onClick={toBottom}>NEW MESSAGES ↓</button>}
    <details className="chat-options"><summary>Connection options</summary><button type="button" onClick={onResync} disabled={!connected}>REFRESH ROOM</button></details>
  </GameSheet>;
}
