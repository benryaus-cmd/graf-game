import MovementJoystick from '@/components/MovementJoystick';
import PaintDock from '@/components/PaintDock';
import PosterPlacementHud from '@/components/PosterPlacementHud';
import type { PosterPlacementRequest } from '@/game/usePosterPlacement';
import EmoteSheet from '@/components/EmoteSheet';
import AvatarMenu from '@/components/AvatarMenu';
import type { CharacterModelState } from '@/game/assetPreview';
import SkyMenu from '@/components/SkyMenu';
import type { ShopItem, GameProgress } from '@/game/progression';
import type { CameraMode, MovementInput, SkyMode, AvatarEmote } from '@/game/worldTypes';
import type { BrushHead } from '@/game/sprayHeads';
import type { ReactNode } from 'react';

import type { LiveRadioController } from '@/game/liveRadio';

export type HudMenu = 'paint' | 'bots' | 'avatar' | 'sky' | 'chat' | 'art' | 'player' | 'settings' | 'emotes' | 'reference' | 'players' | null;
type PaintTool = 'paint' | 'eraser' | 'off' | 'admin';
interface PaintLayerControl { name: string; visible: boolean }
interface GameHudProps {
  characterState?: CharacterModelState | null;
  onCharacterPreview?: () => void;
  canAdminPaint?: boolean;
  adminFreePaint?: boolean;
  radioController?: LiveRadioController | null;
  radioUrl?: string;
  radioVolume?: number;
  topControls?: ReactNode;
  workspaceControls?: ReactNode;
  onEyedropper?: () => void;
  eyedropperActive?: boolean;
  brushHead?: BrushHead;
  onBrushHeadChange?: (head: BrushHead) => void;
  hideTouchControls?: boolean;
  menuCollapsed?: boolean;
  panelColor: string; accentColor: string; sky: SkyMode; activeMenu: HudMenu;
  musicReady: boolean; paintMode: boolean; eraseMode: boolean; showCrosshair: boolean; color: string;
  brushSize: number; opacity: number; layers: PaintLayerControl[]; selectedLayer: number;
  cameraLabel: string; viewMode: CameraMode; mapZoom: number;
  progress: GameProgress; jumpLabel: string; botsEnabled: boolean; nearbyBotIndex: number | null;
  purchasesDisabled: boolean;
  posterPlacement: PosterPlacementRequest | null; posterSize: number; posterValid: boolean;
  onPosterSizeChange: (size: number) => void; onPosterCommit: () => void; onPosterCancel: () => void;
  onPosterStart: (dataUrl: string, size: number) => void;
  onMenuToggle: (menu: Exclude<HudMenu, null>) => void; onMenuClose: () => void;
  onSkySelect: (mode: SkyMode) => void;
  onToolChange: (tool: PaintTool) => void; onColorChange: (color: string) => void;
  onColorPreview?: (color: string) => void;
  onBrushSizeChange: (size: number) => void; onOpacityChange: (opacity: number) => void;
  onLayerSelect: (index: number) => void; onLayerToggle: (index: number) => void;
  onLayerAdd: () => void; onViewChange: () => void; onMapZoomChange: (zoom: number) => void;
  onPurchase: (item: ShopItem) => void; onEquip: (item: ShopItem) => void;
  onEmote: (emote: AvatarEmote) => void;
  onMovement: (movement: MovementInput) => void; onJump: () => void; onBotsToggle: () => void;
}

const GameHud = (props: GameHudProps) => (
  <div className={`game-hud ${props.activeMenu && !props.menuCollapsed ? `game-hud-menu-open game-menu-${props.activeMenu}` : ''}`}>
    <div className="world-grain" aria-hidden="true" />
    {props.showCrosshair && (
      <div className={`reticle ${props.paintMode ? 'reticle-paint' : ''}`} aria-hidden="true">
        <i /><b />
      </div>
    )}
    <header className="top-hud">
      <div className="top-actions">{props.topControls}
        <button type="button" className="hud-menu-button" aria-label="Open game menu" aria-expanded={props.activeMenu === 'settings'} onClick={() => props.onMenuToggle('settings')}>☰</button>
      </div>
    </header>
    <div className="paint-quick-controls" aria-label="Paint mode and color">
      <button type="button" className="paint-mode-switch" aria-pressed={props.paintMode} aria-label={props.paintMode ? 'Switch to explore mode' : 'Switch to paint mode'} onClick={() => props.onToolChange(props.paintMode ? 'off' : 'paint')}>{props.paintMode ? 'EXPLORE' : 'PAINT'}</button>
      <button type="button" className="paint-color-trigger" data-tutorial="paint-tools" onClick={() => props.onMenuToggle('paint')} aria-label={`Open paint selector, current color ${props.color}`} aria-expanded={props.activeMenu === 'paint'}><i style={{ backgroundColor: props.color }} /><span>TOOLS</span><small>{props.eraseMode ? 'Erase' : props.brushHead ?? 'soft'} · L{props.selectedLayer + 1}</small></button>
    </div>
    {props.viewMode === 'map' && (
      <label className="map-zoom-control">
        <span>MAP VIEW SIZE</span>
        <input
          type="range" min="0.6" max="2.2" step="0.05" value={props.mapZoom}
          aria-label="Adjust map view size"
          onChange={(event) => props.onMapZoomChange(Number(event.target.value))}
        />
        <b>{Math.round(props.mapZoom * 100)}%</b>
      </label>
    )}
    {props.activeMenu === 'sky' && <SkyMenu sky={props.sky} open panelColor={props.panelColor} onToggle={() => props.onMenuToggle('sky')} onClose={props.onMenuClose} onSelect={props.onSkySelect} />}
    {props.activeMenu === 'avatar' && (
      <AvatarMenu
        characterState={props.characterState} onCharacterPreview={props.onCharacterPreview}
        progress={props.progress} panelColor={props.panelColor} onClose={props.onMenuClose}
        onPurchase={props.onPurchase} onEquip={props.onEquip} onEmote={props.onEmote}
        purchasesDisabled={props.purchasesDisabled}
      />
    )}
    {props.posterPlacement && (
      <PosterPlacementHud
        placement={props.posterPlacement} size={props.posterSize} valid={props.posterValid}
        onSizeChange={props.onPosterSizeChange} onPlace={props.onPosterCommit} onCancel={props.onPosterCancel}
      />
    )}
    {!props.hideTouchControls && <MovementJoystick onMove={props.onMovement} />}
    {props.activeMenu === 'emotes' && <EmoteSheet onClose={props.onMenuClose} onEmote={props.onEmote} />}
    {!props.hideTouchControls && <button className="emote-button" type="button" onClick={() => props.onMenuToggle('emotes')} aria-label="Open emotes"><span className="jump-arrow">✦</span><span>EMOTE</span></button>}
    {!props.hideTouchControls && <button className="jump-button" type="button" onPointerDown={event => { if (event.pointerType === 'mouse' && event.button !== 0) return; event.preventDefault(); event.stopPropagation(); props.onJump(); }} onClick={event => { if (event.detail === 0) props.onJump(); }} aria-label={props.jumpLabel}>
      <span className="jump-arrow">↑</span><span>{props.jumpLabel}</span>
    </button>}
    <PaintDock
      workspaceControls={props.workspaceControls}
      onEyedropper={props.onEyedropper} eyedropperActive={props.eyedropperActive}
      brushHead={props.brushHead} onBrushHeadChange={props.onBrushHeadChange}
      open={props.activeMenu === 'paint'} onToggle={() => props.onMenuToggle('paint')} onClose={props.onMenuClose}
      color={props.color} paintMode={props.paintMode} eraseMode={props.eraseMode}
      brushSize={props.brushSize} opacity={props.opacity} panelColor={props.panelColor}
      accentColor={props.accentColor} layers={props.layers} selectedLayer={props.selectedLayer}
      posterSize={props.posterSize} onPosterSizeChange={props.onPosterSizeChange}
      onStartPosterPlacement={props.onPosterStart}
      onColorChange={props.onColorChange} onColorPreview={props.onColorPreview} onToolChange={props.onToolChange}
      onBrushSizeChange={props.onBrushSizeChange} onOpacityChange={props.onOpacityChange}
      onLayerSelect={props.onLayerSelect} onLayerToggle={props.onLayerToggle}
      onLayerAdd={props.onLayerAdd}
    />
  </div>
);

export default GameHud;
