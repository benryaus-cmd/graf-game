const BOT_NAMES = [
  'MICA', 'ROOK', 'DOT', 'JUNO', 'BRICK', 'NOVA', 'KITO', 'MOSS', 'ZIP', 'LOU',
  'PIP', 'TAVI', 'BEAN', 'SAGE', 'KIKI', 'INDI', 'OZZY', 'LUX', 'BUBBLE', 'FINN',
];

interface BotControlsProps {
  enabled: boolean;
  drawingDisabled?: boolean;
  panelColor: string;
  nearbyBotIndex: number | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onBotsToggle: () => void;
}

const BotControls = ({
  enabled, panelColor, nearbyBotIndex, open, onToggle, onClose, onBotsToggle,
}: BotControlsProps) => {
  const nearby = enabled && nearbyBotIndex !== null;
  const nearbyName = nearby ? BOT_NAMES[nearbyBotIndex] : null;

  return (
    <div className="bot-controls">
      {!open && (
        <button
          className={`bot-trigger ${enabled ? 'bot-trigger-on' : ''}`}
          type="button" aria-expanded={open} onClick={onToggle}
        >
          <i /> CREW <b>20</b>
        </button>
      )}
      {open && (
        <section className="bot-panel" style={{ backgroundColor: panelColor }} aria-label="Local painter crew">
          <header className="bot-panel-header">
            <div><small>THE CREW</small><b>20 CITY PAINTERS</b></div>
            <div className="bot-header-actions">
              <button
                type="button" className={`bot-enable ${enabled ? 'bot-enable-on' : ''}`}
                aria-pressed={enabled} onClick={onBotsToggle}
              >{enabled ? 'CREW · ON' : 'CREW · OFF'}</button>
              <button type="button" className="bot-close" aria-label="Close painter menu" onClick={onClose}>×</button>
            </div>
          </header>
          <div className={`bot-range-status ${nearby ? 'bot-range-nearby' : ''}`} aria-live="polite">
            {!enabled ? 'CREW RESTING' : nearbyName ? `NEARBY · ${nearbyName}` : 'PAINTERS ARE ROAMING THE BLOCK'}
          </div>
          <p className="bot-footnote">Local painters make their own marks around the neighborhood.</p>
        </section>
      )}
    </div>
  );
};

export default BotControls;
