import { useEffect, useState, type FormEvent } from 'react';

const BOT_NAMES = [
  'MICA', 'ROOK', 'DOT', 'JUNO', 'BRICK', 'NOVA', 'KITO', 'MOSS', 'ZIP', 'LOU',
  'PIP', 'TAVI', 'BEAN', 'SAGE', 'KIKI', 'INDI', 'OZZY', 'LUX', 'BUBBLE', 'FINN',
];
const GREETINGS = [
  'Hey! I found a fresh wall around here.', 'Nice colors today. What are you painting?',
  'I’m on mural duty. Got any ideas?', 'This block could use a little more blue.',
  'Found a quiet spot for a new piece!', 'The concrete is my canvas.',
  'Want to trade color ideas?', 'I’m adding little details nearby.',
  'That’s a great place to paint!', 'Keep making the city yours.',
  'I found a corner that needs a mural.', 'The light is perfect for painting today.',
  'I’m trying out a new color mix.', 'Let’s make this block brighter.',
  'I spotted a blank wall nearby.', 'That shade looks great against concrete.',
  'I’m adding a few final details.', 'A little color goes a long way.',
  'This neighborhood is full of possibilities.', 'Ready for another wall!',
];
interface Message { who: 'bot' | 'you'; text: string }
interface BotControlsProps {
  enabled: boolean;
  panelColor: string;
  nearbyBotIndex: number | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onBotsToggle: () => void;
  onDrawRequest: (prompt: string, botIndex: number) => Promise<boolean>;
}

const BotControls = ({
  enabled, panelColor, nearbyBotIndex, open, onToggle, onClose, onBotsToggle, onDrawRequest,
}: BotControlsProps) => {
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([{ who: 'bot', text: GREETINGS[0] }]);
  const nearby = enabled && nearbyBotIndex === selected;

  useEffect(() => {
    if (nearbyBotIndex !== null) setSelected(nearbyBotIndex);
  }, [nearbyBotIndex]);

  const requestMural = async (prompt: string, botIndex: number) => {
    setWorking(true);
    setError('');
    setLastPrompt(prompt);
    setMessages((current) => [
      ...current.slice(-6),
      { who: 'you', text: prompt },
      { who: 'bot', text: 'I’m sketching your mural now…' },
    ]);
    try {
      const placed = await onDrawRequest(prompt, botIndex);
      if (!placed) throw new Error('No clear wall nearby. Move beside a wall and try again.');
      setMessages((current) => [...current.slice(-7), { who: 'bot', text: 'Your mural is up on the wall!' }]);
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'I could not make that mural. Please try again.');
      setMessages((current) => [...current.slice(-7), { who: 'bot', text: 'I could not finish that mural yet.' }]);
    } finally {
      setWorking(false);
    }
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || working) return;
    if (nearby) {
      void requestMural(text, selected);
      return;
    }
    const reply = enabled
      ? 'Come a little closer and I can paint that on a wall for you.'
      : 'Switch the crew on and come say hi when you’re nearby!';
    setMessages((current) => [...current.slice(-7), { who: 'you', text }, { who: 'bot', text: reply }]);
    setDraft('');
  };

  return (
    <div className="bot-controls">
      {!open && (
        <button
          className={`bot-trigger ${enabled ? 'bot-trigger-on' : ''}`}
          type="button" aria-expanded={open} onClick={onToggle}
        >
          <i /> BOTS <b>20</b>
        </button>
      )}
      {open && (
        <section className="bot-panel" style={{ backgroundColor: panelColor }} aria-label="City painters and bot chat">
          <header className="bot-panel-header">
            <div><small>THE CREW</small><b>20 CITY PAINTERS</b></div>
            <div className="bot-header-actions">
              <button
                type="button" className={`bot-enable ${enabled ? 'bot-enable-on' : ''}`}
                aria-pressed={enabled} onClick={onBotsToggle}
              >
                {enabled ? 'PAINTING · ON' : 'ENABLE BOTS'}
              </button>
              <button type="button" className="bot-close" aria-label="Close painter menu" onClick={onClose}>×</button>
            </div>
          </header>
          <div className="bot-list" aria-label="Choose a painter">
            {BOT_NAMES.map((name, index) => (
              <button
                type="button" key={name}
                className={`bot-person ${selected === index ? 'bot-person-selected' : ''}`}
                onClick={() => setSelected(index)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>{name}
              </button>
            ))}
          </div>
          <div className="bot-chat-heading">CHAT WITH {BOT_NAMES[selected]}</div>
          <div className={`bot-range-status ${nearby ? 'bot-range-nearby' : ''}`}>
            {nearby ? `IN RANGE · ${BOT_NAMES[selected]} CAN PAINT FOR YOU` : 'WALK UP TO A PAINTER TO PLACE A MURAL'}
          </div>
          <div className="bot-messages" aria-live="polite">
            {messages.map((message, index) => (
              <p key={`${index}-${message.who}`} className={`bot-message bot-message-${message.who}`}>
                {message.text}
              </p>
            ))}
          </div>
          {error && (
            <div className="bot-draw-error" role="alert">
              <span>{error}</span>
              <button type="button" disabled={working || !lastPrompt} onClick={() => void requestMural(lastPrompt, selected)}>
                RETRY
              </button>
            </div>
          )}
          <form className="bot-chat-form" onSubmit={sendMessage}>
            <input
              value={draft} maxLength={240}
              placeholder={nearby ? 'Ask for a mural…' : `Message ${BOT_NAMES[selected]}…`}
              aria-label={`Message ${BOT_NAMES[selected]}`}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" disabled={!draft.trim() || working}>
              {working ? 'PAINTING' : nearby ? 'DRAW' : 'SEND'}
            </button>
          </form>
          <p className="bot-footnote">They roam and paint while enabled. Stand close to ask for your own wall art.</p>
        </section>
      )}
    </div>
  );
};

export default BotControls;