import { useRef, useState, type ReactNode } from 'react';
import GameSheet from './GameSheet';

interface SettingsModalProps {
  onClose: () => void;
  onUnlock: () => void;
  radioVolume?: number;
  onRadioVolume?: (volume: number) => void;
  children?: ReactNode;
}

export default function SettingsModal({ onClose, onUnlock, radioVolume = .32, onRadioVolume, children }: SettingsModalProps) {
  const taps = useRef<number[]>([]);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const unlock = () => {
    if (password === 'gg') { onUnlock(); return; }
    setPassword(''); setPasswordError('Incorrect password');
  };
  const volume = Math.round(Math.max(0, Math.min(1, Number.isFinite(radioVolume) ? radioVolume : 0)) * 100);
  return <GameSheet title={passwordOpen ? 'DEVELOPER ACCESS' : 'GAME MENU'} onClose={onClose} closeLabel="Close game menu" className="settings-sheet">
    {passwordOpen ? <>
      <label className="ui-field">PASSWORD<input type="password" value={password} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={event => { setPassword(event.target.value); setPasswordError(''); }} onKeyDown={event => { if (event.key === 'Enter') unlock(); }} /></label>
      {passwordError && <p className="ui-notice" role="alert">{passwordError}</p>}
      <div className="button-row"><button type="button" onClick={() => { setPasswordOpen(false); setPassword(''); setPasswordError(''); }}>CANCEL</button><button type="button" onClick={unlock}>UNLOCK</button></div>
    </> : <>
      {children}
      <section className="tool-section"><h3 onPointerDown={event => {
        event.preventDefault(); event.stopPropagation(); const now = performance.now();
        taps.current = [...taps.current.filter(time => now - time <= 8000), now].slice(-10);
        if (taps.current.length >= 10) { taps.current = []; setPasswordOpen(true); }
      }}>SETTINGS</h3>
        <label className="paint-range"><span><b>RADIO VOLUME</b><i>{volume}%</i></span><input type="range" min="0" max="100" step="1" aria-label="Radio volume in settings" value={volume} onChange={event => onRadioVolume?.(Number(event.target.value) / 100)} /></label>
      </section>
    </>}
  </GameSheet>;
}
