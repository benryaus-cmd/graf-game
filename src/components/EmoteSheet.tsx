import GameSheet from './GameSheet';
import type { AvatarEmote } from '@/game/worldTypes';

const EMOTES: Array<{ id: AvatarEmote; label: string; icon: string }> = [
  { id: 'joy', label: 'JOY', icon: '✦' }, { id: 'cry', label: 'CRY', icon: '☂' },
  { id: 'think', label: 'THINK', icon: '…' }, { id: 'sleepy', label: 'SLEEPY', icon: 'z' }, { id: 'spin', label: 'SPIN', icon: '⟳' },
];
export default function EmoteSheet({ onClose, onEmote }: { onClose: () => void; onEmote: (emote: AvatarEmote) => void }) {
  return <GameSheet title="EMOTES" subtitle="Show your mood" onClose={onClose} className="emote-sheet">
    <div className="emote-grid">{EMOTES.map(emote => <button type="button" key={emote.id} className="emote-card" onClick={() => { onEmote(emote.id); onClose(); }}><span aria-hidden="true">{emote.icon}</span><b>{emote.label}</b></button>)}</div>
  </GameSheet>;
}
