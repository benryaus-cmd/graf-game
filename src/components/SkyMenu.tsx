import GameSheet from './GameSheet';
import type { SkyMode } from '@/game/worldTypes';

export const SKY_OPTIONS: Array<{ id: SkyMode; label: string; detail: string; swatch: string }> = [
  { id: 'day', label: 'Sunny', detail: 'Soft white clouds', swatch: 'linear-gradient(#76c3ed,#f3dfbd)' },
  { id: 'sunset', label: 'Afterglow', detail: 'Orange · vermilion', swatch: 'linear-gradient(#e95337,#ffb45d)' },
  { id: 'pastel', label: 'Cotton candy', detail: 'Rose · powder blue', swatch: 'linear-gradient(#dfa9c9,#8dcdd6)' },
  { id: 'rain', label: 'Rain check', detail: 'Slate · soft rain', swatch: 'linear-gradient(#505d67,#a2aaa8)' },
  { id: 'night', label: 'Nightfall', detail: 'Moonlight · starlight', swatch: 'linear-gradient(#091324,#30415b)' },
];

interface SkyMenuProps {
  sky: SkyMode;
  open: boolean;
  panelColor: string;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (mode: SkyMode) => void;
}

const SkyMenu = ({ sky, open, panelColor, onToggle, onClose, onSelect }: SkyMenuProps) => (
  <>
    {open && (
      <GameSheet title="THE SKY" onClose={onClose} closeLabel="Close sky menu" className="sky-sheet">
        {SKY_OPTIONS.map((option, index) => (
          <button
            className={`sky-option ${sky === option.id ? 'sky-option-active' : ''}`}
            type="button"
            key={option.id}
            onClick={() => onSelect(option.id)}
          >
            <span className="sky-preview" style={{ background: option.swatch }}><i /></span>
            <span className="sky-copy"><b>{option.label}</b><small>{option.detail}</small></span>
            <span className="sky-number">0{index + 1}</span>
          </button>
        ))}
      </GameSheet>
    )}
  </>
);

export default SkyMenu;
