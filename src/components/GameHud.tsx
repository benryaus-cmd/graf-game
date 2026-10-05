import MovementJoystick from '@/components/MovementJoystick';
import PaintDock from '@/components/PaintDock';
import PosterPlacementHud from '@/components/PosterPlacementHud';
import type { PosterPlacementRequest } from '@/game/usePosterPlacement';
import AvatarMenu from '@/components/AvatarMenu';
import SkyMenu from '@/components/SkyMenu';
import type { ShopItem, GameProgress } from '@/game/progression';
import type { CameraMode, MovementInput, SkyMode, AvatarEmote } from '@/game/worldTypes';

export type HudMenu = 'paint' | 'bots' | 'avatar' | 'sky' | null;
type PaintTool = 'paint' | 'eraser' | 'off';
interface PaintLayerControl { name: string; visible: boolean }
interface GameHudProps {
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
  onBrushSizeChange: (size: number) => void; onOpacityChange: (opacity: number) => void;
  onLayerSelect: (index: number) => void; onLayerToggle: (index: number) => void;
  onLayerAdd: () => void; onViewChange: () => void; onMapZoomChange: (zoom: number) => void;
  onPurchase: (item: ShopItem) => void; onEquip: (item: ShopItem) => void;
  onEmote: (emote: AvatarEmote) => void;
  onMovement: (movement: MovementInput) => void; onJump: () => void; onBotsToggle: () => void;
}

const GameHud = (props: GameHudProps) => (
  <div className={`game-hud ${props.activeMenu ? `game-hud-menu-open game-menu-${props.activeMenu}` : ''}`}>
    <div className="world-grain" aria-hidden="true" />
    {props.activeMenu && (
      <button
        type="button" className="hud-menu-scrim" aria-label="Close open menu"
        onClick={props.onMenuClose}
      />
    )}
    {props.showCrosshair && (
      <div className={`reticle ${props.paintMode ? 'reticle-paint' : ''}`} aria-hidden="true">
        <i /><b />
      </div>
    )}
    <header className="top-hud">
      <div className="top-actions">
        <div className="paint-quick-controls" aria-label="Paint mode and color">
          <button
            type="button" className="paint-mode-switch"
            aria-pressed={props.paintMode}
            aria-label={props.paintMode ? 'Switch to explore mode' : 'Switch to paint mode'}
            onClick={() => props.onToolChange(props.paintMode ? 'off' : 'paint')}
          >{props.paintMode ? 'PAINT' : 'EXPLORE'}</button>
          <button
            type="button" className="paint-color-trigger"
            onClick={() => props.onMenuToggle('paint')}
            aria-label={`Open paint selector, current color ${props.color}`}
            aria-expanded={props.activeMenu === 'paint'}
          ><i style={{ backgroundColor: props.color }} /><span>PAINT TOOLS</span></button>
        </div>
        <span className={`sound-status ${props.musicReady ? 'sound-playing' : ''}`}><i /> LO-FI</span>
        <SkyMenu
          sky={props.sky} open={props.activeMenu === 'sky'} panelColor={props.panelColor}
          onToggle={() => props.onMenuToggle('sky')} onClose={props.onMenuClose}
          onSelect={props.onSkySelect}
        />
      </div>
    </header>
    <div className="game-actions">
      <button
        type="button" className="view-switch" onClick={props.onViewChange}
        aria-label={`Change view, now ${props.cameraLabel}`}
      >
        <span>◉</span> {props.cameraLabel}
      </button>
      <button
        type="button" className="avatar-open" onClick={() => props.onMenuToggle('avatar')}
        aria-expanded={props.activeMenu === 'avatar'}
      >
        <span className="coin-icon">◆</span> {props.progress.coins} <b>AVATAR</b>
      </button>
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
    {props.activeMenu === 'avatar' && (
      <AvatarMenu
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
    <MovementJoystick onMove={props.onMovement} />
    <button className="jump-button" type="button" onClick={props.onJump} aria-label={props.jumpLabel}>
      <span className="jump-arrow">↑</span><span>{props.jumpLabel}</span>
    </button>
    <PaintDock
      open={props.activeMenu === 'paint'} onToggle={() => props.onMenuToggle('paint')}
      color={props.color} paintMode={props.paintMode} eraseMode={props.eraseMode}
      brushSize={props.brushSize} opacity={props.opacity} panelColor={props.panelColor}
      accentColor={props.accentColor} layers={props.layers} selectedLayer={props.selectedLayer}
      posterSize={props.posterSize} onPosterSizeChange={props.onPosterSizeChange}
      onStartPosterPlacement={props.onPosterStart}
      onColorChange={props.onColorChange} onToolChange={props.onToolChange}
      onBrushSizeChange={props.onBrushSizeChange} onOpacityChange={props.onOpacityChange}
      onLayerSelect={props.onLayerSelect} onLayerToggle={props.onLayerToggle}
      onLayerAdd={props.onLayerAdd}
    />
  </div>
);

export default GameHud;
