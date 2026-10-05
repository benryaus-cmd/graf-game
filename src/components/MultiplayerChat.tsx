import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/multiplayer/protocol';

interface Props { messages: ChatMessage[]; connected: boolean; onSend: (text: string) => void; onClose: () => void; onResync: () => void }
export default function MultiplayerChat({ messages, connected, onSend, onClose, onResync }: Props) {
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const lastSent = useRef(-Infinity);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages]);
  return (
    <section className="multiplayer-chat" aria-label="Public room chat">
      <header><b>PUBLIC CHAT</b><button type="button" onClick={onResync} disabled={!connected}>RESYNC</button><button type="button" onClick={onClose} aria-label="Close chat">×</button></header>
      <div className="multiplayer-chat-messages" ref={list} role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && <p>Say hello to the room.</p>}
        {messages.map(message => <p key={message.id}><b>{message.displayName}</b> <time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>{message.text}</span></p>)}
      </div>
      <form onSubmit={event => {
        event.preventDefault(); const value = text.trim();
        if (!connected || !value) return;
        if (performance.now() - lastSent.current < 1000) { setNotice('Wait a moment before sending again.'); return; }
        lastSent.current = performance.now(); onSend(value); setText(''); setNotice('');
      }}>
        <input aria-label="Message the public room" maxLength={500} value={text} onChange={event => setText(event.target.value)} placeholder={connected ? 'Message the room…' : 'Reconnect to chat'} disabled={!connected} />
        <button type="submit" disabled={!connected || !text.trim()}>SEND</button>
      </form>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
