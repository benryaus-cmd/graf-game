import type { AvatarEmote } from '@/game/worldTypes';
import { useState } from 'react';
import GameSheet from './GameSheet';
import { setAssetPreviewPreference, useAssetPreviewPreference } from '@/game/assetPreviewPreference';
import { SHOP_ITEMS, type GameProgress, type ShopCategory, type ShopItem } from '@/game/progression';

interface AvatarMenuProps {
  progress: GameProgress;
  panelColor: string;
  purchasesDisabled: boolean;
  onClose: () => void;
  onPurchase: (item: ShopItem) => void;
  onEquip: (item: ShopItem) => void;
  onEmote: (emote: AvatarEmote) => void;
}

const TABS: Array<{ id: ShopCategory | 'emote'; label: string }> = [
  { id: 'outfit', label: 'SUITS' },
  { id: 'top', label: 'TOPS' },
  { id: 'bottom', label: 'BOTTOMS' },
  { id: 'accessory', label: 'GEAR' },
  { id: 'emote', label: 'EMOTES' },
];
const EMOTES: Array<{ id: AvatarEmote; icon: string; label: string }> = [
  { id: 'joy', icon: '✦', label: 'JUMP FOR JOY' },
  { id: 'cry', icon: '☂', label: 'CRY' },
  { id: 'think', icon: '…', label: 'THINK' },
  { id: 'sleepy', icon: 'z', label: 'SLEEPY' },
  { id: 'spin', icon: '⟳', label: 'SPIN' },
];

const AvatarMenu = ({ progress, panelColor, purchasesDisabled, onClose, onPurchase, onEquip, onEmote }: AvatarMenuProps) => {
  const [category, setCategory] = useState<ShopCategory | 'emote'>('outfit');
  const preview = useAssetPreviewPreference();
  const items = category === 'emote' ? [] : SHOP_ITEMS.filter((item) => item.category === category);
  const equipped = category === 'emote' ? '' : progress[category];

  return (
    <GameSheet title="STREET CLOSET" subtitle="Your look" onClose={onClose} closeLabel="Close closet" className="avatar-sheet">
      <div className="closet-balance"><span>🪙</span> {progress.coins} SOLO COINS <small>{purchasesDisabled ? 'SOLO SHOP PAUSED' : 'EARN BY PAINTING'}</small></div>
      {purchasesDisabled && <p className="closet-footnote">Inventory, purchases, pickups and trading are unavailable until verified Aippy accounts are connected. You can still wear your existing solo looks.</p>}
      <div className="closet-items" aria-label="Character model">
        <button type="button" className={`closet-item ${preview.model === 'original' ? 'closet-item-selected' : ''}`} aria-pressed={preview.model === 'original'} onClick={() => setAssetPreviewPreference({ ...preview, model: 'original' })}>
          <span className="closet-copy"><b>EXISTING CHARACTER</b><small>Your equipped clothes and gear</small></span><span className="closet-action">{preview.model === 'original' ? 'ON' : 'WEAR'}</span>
        </button>
        <button type="button" className={`closet-item ${preview.model === 'hoodie' ? 'closet-item-selected' : ''}`} aria-pressed={preview.model === 'hoodie'} onClick={() => setAssetPreviewPreference({ ...preview, model: 'hoodie' })}>
          <span className="closet-copy"><b>HOODIE CHARACTER</b><small>Free Quaternius model · preview on this device</small></span><span className="closet-action">{preview.model === 'hoodie' ? 'ON' : 'TRY'}</span>
        </button>

      </div>
      {preview.model === 'hoodie' && <p className="closet-footnote">See your character in third person. This device preview uses its own clothes; your existing outfit, abilities and multiplayer appearance are preserved. The original character stays visible until the model loads.</p>}
      <nav className="closet-tabs" aria-label="Closet categories">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={category === tab.id ? 'closet-tab closet-tab-active' : 'closet-tab'}
            aria-pressed={category === tab.id}
            onClick={() => setCategory(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {category === 'emote' ? (
        <div className="emote-grid" aria-label="Choose an avatar animation">
          {EMOTES.map((emote) => (
            <button key={emote.id} type="button" className="emote-card" onClick={() => onEmote(emote.id)}>
              <span aria-hidden="true">{emote.icon}</span>
              <b>{emote.label}</b>
              <small>PLAY</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="closet-items">
          {items.map((item) => {
            const owned = progress.owned.includes(item.id);
            const selected = preview.model === 'original' && equipped === item.id.slice(item.id.indexOf(':') + 1);
            return (
              <button
                key={item.id}
                type="button"
                className={`closet-item ${item.exclusive ? 'closet-item-exclusive' : ''} ${selected ? 'closet-item-selected' : ''}`}
                disabled={(owned && selected) || (!owned && purchasesDisabled)}
                onClick={() => { setAssetPreviewPreference({ ...preview, model: 'original' }); (owned ? onEquip : onPurchase)(item); }}
              >
                <span
                  className={`closet-swatch ${item.category === 'outfit' ? `swatch-${item.id.split(':')[1]}` : ''}`}
                  style={{ backgroundColor: item.color ?? '#7f887e' }}
                />
                <span className="closet-copy">
                  <b>{item.name}</b>
                  <small>{item.detail}</small>
                </span>
                <span className="closet-action">
                  {selected ? 'ON' : owned ? 'WEAR' : `🪙 ${item.cost}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="closet-footnote">{category === 'emote' ? 'Pick a mood and let your avatar express it.' : 'Special looks come with their own movement powers.'}</p>
    </GameSheet>
  );
};

export default AvatarMenu;
