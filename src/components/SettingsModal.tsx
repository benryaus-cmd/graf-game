import { useRef, useState } from 'react';

interface SettingsModalProps {
  onClose: () => void;
  onUnlock: () => void;
  radioVolume?: number;
  onRadioVolume?: (volume: number) => void;
}

const SettingsModal = ({ onClose, onUnlock, radioVolume = .32, onRadioVolume }: SettingsModalProps) => {
  const secretTapTimesRef = useRef<number[]>([]);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleSettingsTitlePress = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const now = performance.now();

    secretTapTimesRef.current = [
      ...secretTapTimesRef.current.filter(time => now - time <= 8000),
      now,
    ].slice(-10);

    if (secretTapTimesRef.current.length >= 10) {
      secretTapTimesRef.current = [];
      setPasswordOpen(true);
    }
  };

  const attemptUnlock = () => {
    if (password === 'gg') {
      onUnlock();
      return;
    }
    setPassword('');
    setPasswordError('Incorrect password');
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 p-5 font-mono text-neutral-100 shadow-2xl">
        {passwordOpen ? (
          <>
            <h2 className="text-sm font-bold tracking-[0.2em]">DEVELOPER ACCESS</h2>
            <input
              type="password"
              value={password}
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={event => {
                setPassword(event.target.value);
                setPasswordError('');
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') attemptUnlock();
              }}
              className="mt-4 w-full rounded-lg bg-neutral-800 px-3 py-2.5 text-sm text-neutral-100 outline-none"
            />
            {passwordError && (
              <p className="mt-2 text-xs text-red-400">{passwordError}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPasswordOpen(false);
                  setPassword('');
                  setPasswordError('');
                }}
                className="min-h-11 flex-1 rounded-lg bg-neutral-800 text-xs tracking-widest"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={attemptUnlock}
                className="min-h-11 flex-1 rounded-lg bg-neutral-700 text-xs tracking-widest"
              >
                UNLOCK
              </button>
            </div>
          </>
        ) : (
          <>
            <h2
              onPointerDown={handleSettingsTitlePress}
              className="text-base font-bold tracking-[0.2em]"
            >
              SETTINGS
            </h2>
            <label className="settings-radio-volume">
              <span>RADIO VOLUME <b>{Math.round(Math.max(0, Math.min(1, Number.isFinite(radioVolume) ? radioVolume : 0)) * 100)}%</b></span>
              <input type="range" min="0" max="100" step="1" aria-label="Radio volume in settings"
                value={Math.round(Math.max(0, Math.min(1, Number.isFinite(radioVolume) ? radioVolume : 0)) * 100)}
                onChange={event => onRadioVolume?.(Number(event.target.value) / 100)} />
            </label>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-lg bg-neutral-800 px-5 text-xs tracking-widest"
              >
                CLOSE
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsModal;
