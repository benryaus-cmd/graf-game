import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import assetsData from '@/config/assets';
import { aippyTweaks } from '@aippy/runtime/tweaks';
import { useSound } from '@aippy/runtime/audio';
import GameHud, { type HudMenu } from '@/components/GameHud';
import WorldScene from '@/components/WorldScene';
import LookJoystick from '@/components/LookJoystick';
import GraffitiPieces from '@/components/GraffitiPieces';
import PaintWorkspaceHud, { type PaintWorkspaceView, type PaintWorkspaceAction } from '@/components/PaintWorkspaceHud';
import MultiplayerControls from '@/components/MultiplayerControls';
import PlayerInteractionCard from '@/components/PlayerInteractionCard';
import { useUserInfo } from '@aippy/runtime/user';
import { aippyDisplayName } from '@/multiplayer/profile';
import type { MultiplayerStatus, MultiplayerView } from '@/multiplayer/protocol';
import type { ServerRole } from '@/multiplayer/permissions';
import SettingsModal from '@/components/SettingsModal';
import { useSprayAudio } from '@/components/useSprayAudio';
import { usePosterPlacement } from '@/game/usePosterPlacement';
import { getAvatarAppearance, loadGameProgress, saveGameProgress, type GameProgress, type ShopItem } from '@/game/progression';
import tweaksConfig from '@/config/tweaksConfig.json';
import type { AvatarEmote, CameraMode, MovementInput, SkyMode } from '@/game/worldTypes';
import type { BrushHead } from '@/game/sprayHeads';

const ProjectFileViewer = lazy(() => import('@/components/ProjectFileViewer'));

const tweaks = aippyTweaks(tweaksConfig);
const COVER_IMAGE_URL = assetsData.IMAGE_ABZY;
const COLORS = ['#ff4d43', '#ff65a5', '#45d7df', '#ffd34e', '#b9e84e', '#f7f2dc'];
const CAMERA_LABELS: Record<CameraMode, string> = {
  first: 'FIRST PERSON', third: 'THIRD PERSON', map: 'MAP VIEW',
};
const MAX_LAYERS = 8;
interface PaintLayerState { name: string; visible: boolean }
interface EmoteSignal { emote: AvatarEmote; sequence: number }
type PaintTool = 'paint' | 'eraser' | 'off';

const App = () => {
  const aippyUser = useUserInfo();
  const displayName = aippyDisplayName(aippyUser);
  const [multiplayerStatus, setMultiplayerStatus] = useState<MultiplayerStatus>({ phase: 'solo', playerCount: 0 });
  const [multiplayerView, setMultiplayerView] = useState<MultiplayerView>({ chat: [], revision: 0, accountFeaturesAvailable: false, worldItemCount: 0 });
  const [multiplayerRequest, setMultiplayerRequest] = useState<{ action: 'join' | 'leave' | 'chat' | 'resync' | 'like' | 'inspect' | 'delete-piece' | 'set-role'; text?: string; role?: ServerRole; sequence: number } | null>(null);
  const requestMultiplayer = (action: 'join' | 'leave' | 'chat' | 'resync' | 'like' | 'inspect' | 'delete-piece' | 'set-role', text?: string, role?: ServerRole) => {
    if (action === 'inspect') { setPaintMode(false); requestWorkspace('exit'); setViewMode('first'); }
    if (action === 'join' || action === 'leave') { poster.cancel(); requestWorkspace('clear'); }
    setMultiplayerRequest(previous => ({ action, text, role, sequence: (previous?.sequence ?? 0) + 1 }));
  };
  const accentColor = tweaks.accentColor.useState();
  const panelColor = tweaks.panelColor.useState();
  const initialBrushSize = tweaks.brushSize.useState();
  const moveSpeed = tweaks.moveSpeed.useState();
  const jumpPower = tweaks.jumpPower.useState();
  const lookSensitivity = tweaks.lookSensitivity.useState();
  const musicVolume = tweaks.musicVolume.useState();
  const fogDensity = tweaks.fogDensity.useState();
  const showCrosshair = tweaks.showCrosshair.useState();
  const [hasJoined, setHasJoined] = useState(false);
  const [brushSelection, setBrushSelection] = useState<{ value: number; source: number } | null>(null);
  const brushSize = brushSelection?.source === initialBrushSize ? brushSelection.value : Math.max(.1, Math.min(10, initialBrushSize / 3));
  const [opacity, setOpacity] = useState(0.88);
  const [brushHead, setBrushHead] = useState<BrushHead>('soft');
  const { play, stopAll } = useSound({ ambient: assetsData.AUDIO_AZQA }, { preload: true });
  const { warmAudio, playSpray, playChime } = useSprayAudio();
  const [sky, setSky] = useState<SkyMode>('day');
  const [paintMode, setPaintMode] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<PaintWorkspaceView>({ selected: false, active: false, width: 0, height: 0 });
  const [workspaceRequest, setWorkspaceRequest] = useState<{ action: PaintWorkspaceAction; size?: number; sequence: number } | null>(null);
  const requestWorkspace = (action: PaintWorkspaceAction, size?: number) => {
    setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 });
    if (action === 'enter') { setPaintMode(true); closeMenu(); }
    if (action === 'finish' || action === 'clear') setPaintMode(false);
    setWorkspaceRequest(previous => ({ action, size, sequence: (previous?.sequence ?? 0) + 1 }));
  };
  const [eraseMode, setEraseMode] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [activeMenu, setActiveMenu] = useState<HudMenu>(null);
  const [musicReady, setMusicReady] = useState(false);
  const [movement, setMovement] = useState<MovementInput>({ x: 0, y: 0 });
  const [lookInput, setLookInput] = useState<MovementInput>({ x: 0, y: 0 });
  const [jumpSignal, setJumpSignal] = useState(0);
  const [viewMode, setViewMode] = useState<CameraMode>('first');
  const [mapZoom, setMapZoom] = useState(1);
  const [botsEnabled, setBotsEnabled] = useState(false);
  const [nearbyBotIndex, setNearbyBotIndex] = useState<number | null>(null);
  const poster = usePosterPlacement();
  const [layers, setLayers] = useState<PaintLayerState[]>([{ name: 'Layer 1', visible: true }]);
  const [selectedLayer, setSelectedLayer] = useState(0);
  const [progress, setProgress] = useState<GameProgress>(loadGameProgress);
  const [emoteSignal, setEmoteSignal] = useState<EmoteSignal | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devViewerOpen, setDevViewerOpen] = useState(false);
  const audioStartedRef = useRef(false);
  const lastCoinAtRef = useRef(0);
  useEffect(() => () => stopAll(), [stopAll]);
  useEffect(() => saveGameProgress(progress), [progress]);

  const startAudioOnFirstClick = () => {
    if (audioStartedRef.current) return;
    audioStartedRef.current = true;
    setMusicReady(true);
    void play('ambient', { loop: true, volume: musicVolume }).catch(error => {
      console.warn('[Aippy] Ambient music could not be played.', error);
    });
    void warmAudio();
  };
  const toggleMenu = (menu: Exclude<HudMenu, null>) => setActiveMenu(current => current === menu ? null : menu);
  const closeMenu = () => setActiveMenu(null);
  const updateBrushSize = (value: number) => setBrushSelection({ value: Math.max(.1, Math.min(10, value / 3)), source: initialBrushSize });
  const selectColor = (nextColor: string) => { setColor(nextColor); playChime(); };
  const selectPaintTool = (tool: PaintTool) => {
    if (tool !== 'off' && workspaceView.editableUntil) requestWorkspace('enter');
    if (tool === 'off' && workspaceView.active) requestWorkspace('exit');
    setPaintMode(tool !== 'off');
    setEraseMode(tool === 'eraser');
  };
  const selectSky = (mode: SkyMode) => { setSky(mode); closeMenu(); playChime(); };
  const startPosterPlacement = (dataUrl: string, size: number) => {
    if (workspaceView.active) requestWorkspace('exit');
    poster.start(dataUrl, size);
    setPaintMode(false);
    setEraseMode(false);
    closeMenu();
  };
  const earnPaintCoin = () => {
    if (multiplayerStatus.phase !== 'solo') return;
    const now = performance.now();
    if (now - lastCoinAtRef.current < 800) return;
    lastCoinAtRef.current = now;
    setProgress(current => ({ ...current, coins: current.coins + 1 }));
  };
  const purchaseItem = (item: ShopItem) => {
    if (multiplayerStatus.phase !== 'solo') return;
    if (progress.owned.includes(item.id) || progress.coins < item.cost) return;
    const value = item.id.slice(item.id.indexOf(':') + 1);
    setProgress(current => {
      if (current.owned.includes(item.id) || current.coins < item.cost) return current;
      return {
        ...current,
        coins: current.coins - item.cost,
        owned: [...current.owned, item.id],
        [item.slot]: value,
      };
    });
    playChime();
  };
  const equipItem = (item: ShopItem) => {
    if (!progress.owned.includes(item.id)) return;
    const value = item.id.slice(item.id.indexOf(':') + 1);
    setProgress(current => ({ ...current, [item.slot]: value }));
    playChime();
  };
  const addLayer = () => {
    if (layers.length >= MAX_LAYERS) return;
    const index = layers.length;
    setLayers(current => [...current, { name: `Layer ${index + 1}`, visible: true }]);
    setSelectedLayer(index);
    playChime();
  };
  const toggleLayer = (index: number) => setLayers(current => current.map((layer, itemIndex) => (
    itemIndex === index ? { ...layer, visible: !layer.visible } : layer
  )));
  const changeView = () => {
    const modes: CameraMode[] = ['first', 'third', 'map'];
    setViewMode(current => modes[(modes.indexOf(current) + 1) % modes.length]);
  };
  const playEmote = (emote: AvatarEmote) => {
    setViewMode('third');
    setEmoteSignal(current => ({ emote, sequence: (current?.sequence ?? 0) + 1 }));
  };
  const appearance = useMemo(() => getAvatarAppearance(progress), [progress]);
  const cosmetics = useMemo(() => ({ outfit: progress.outfit, top: progress.top, bottom: progress.bottom, accessory: progress.accessory }), [progress.outfit, progress.top, progress.bottom, progress.accessory]);
  const layerVisibility = useMemo(() => layers.map(layer => layer.visible), [layers]);
  const jumpLabel = progress.outfit === 'jax' ? 'FLY' : progress.outfit === 'ringmaster' ? 'LEVITATE'
    : progress.outfit === 'pomni' ? 'HIGH JUMP' : 'JUMP';

  return (
    <main
      className={`game-shell ${portrait ? 'game-portrait' : ''} ${workspaceView.active ? 'canvas-mode' : ''}`}
      style={{ '--accent': accentColor, '--panel': panelColor } as CSSProperties}
      onClickCapture={startAudioOnFirstClick}
    >
      {!hasJoined ? (
        <section className="cover-screen" aria-label="Welcome to Sidestreet">
          <img className="cover-art" src={COVER_IMAGE_URL} alt="A sunlit blocky landscape with a winding stream and blossoms" />
          <div className="cover-shade" />
          <div className="cover-content">
            <span className="cover-kicker">AN OPEN CREATIVE WORLD</span>
            <h1>SIDESTREET</h1>
            <p>Find your corner. Make it yours.</p>
            <button type="button" className="cover-enter" onClick={() => setHasJoined(true)}>
              ENTER THE WORLD <span aria-hidden="true">↗</span>
            </button>
            <small>EXPLORE · PAINT · EXPRESS</small>
          </div>
        </section>
      ) : (
        <>
          <WorldScene
            brushHead={brushHead}
            workspaceRequest={workspaceRequest} onWorkspaceChange={setWorkspaceView}
            multiplayerRequest={multiplayerRequest} displayName={displayName} username={aippyUser.username} nickName={aippyUser.nickName} onMultiplayerStatus={setMultiplayerStatus}
            cosmetics={cosmetics} onMultiplayerView={setMultiplayerView}
            sky={sky} paintMode={paintMode} eraseMode={eraseMode} color={color}
            movement={movement} lookInput={lookInput} brushSize={brushSize} opacity={opacity} moveSpeed={moveSpeed}
            jumpPower={jumpPower} lookSensitivity={lookSensitivity} fogDensity={fogDensity}
            jumpSignal={jumpSignal} layerIndex={selectedLayer} layerVisibility={layerVisibility}
            viewMode={viewMode} mapZoom={mapZoom} botsEnabled={botsEnabled && multiplayerStatus.phase === 'solo'} avatar={appearance}
            emoteSignal={emoteSignal}
            posterPlacement={poster.placement} posterSize={poster.size}
            posterCommitSignal={poster.commitSignal} onPosterValidity={poster.setValid}
            onPosterPlaced={poster.complete}
            onNearbyBot={setNearbyBotIndex}
            onSpray={playSpray} onPaint={earnPaintCoin}
          />
          <GameHud
            brushHead={brushHead} onBrushHeadChange={setBrushHead}
            hideTouchControls={workspaceView.active || activeMenu === 'paint'}
            panelColor={panelColor} accentColor={accentColor} sky={sky} activeMenu={activeMenu}
            musicReady={musicReady} paintMode={paintMode} eraseMode={eraseMode}
            showCrosshair={showCrosshair} color={color} brushSize={brushSize * 3} opacity={opacity}
            layers={layers} selectedLayer={selectedLayer} cameraLabel={CAMERA_LABELS[viewMode]}
            viewMode={viewMode} mapZoom={mapZoom} progress={progress}
            purchasesDisabled={multiplayerStatus.phase !== 'solo'}
            jumpLabel={jumpLabel} botsEnabled={botsEnabled} nearbyBotIndex={nearbyBotIndex}
            posterPlacement={poster.placement} posterSize={poster.size} posterValid={poster.valid}
            onPosterSizeChange={poster.changeSize} onPosterCommit={poster.requestCommit}
            onPosterCancel={poster.cancel} onPosterStart={startPosterPlacement}
            onMenuToggle={toggleMenu} onMenuClose={closeMenu} onSkySelect={selectSky}
            onToolChange={selectPaintTool} onColorChange={selectColor}
            onBrushSizeChange={updateBrushSize} onOpacityChange={setOpacity}
            onLayerSelect={setSelectedLayer} onLayerToggle={toggleLayer} onLayerAdd={addLayer}
            onViewChange={changeView} onMapZoomChange={setMapZoom}
            onPurchase={purchaseItem} onEquip={equipItem} onEmote={playEmote}
            onMovement={setMovement} onJump={() => setJumpSignal(signal => signal + 1)}
            onBotsToggle={() => setBotsEnabled(enabled => !enabled)}
          />
          <button type="button" className="portrait-toggle" aria-pressed={portrait}
            onClick={() => { setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 }); setPortrait(value => !value); }}>
            {portrait ? '↻ LANDSCAPE' : '↻ PORTRAIT'}
          </button>
          {activeMenu !== 'paint' && <LookJoystick onLook={setLookInput} canvasMode={workspaceView.active} />}
          {activeMenu !== 'paint' && <PaintWorkspaceHud view={workspaceView} painting={paintMode} onAction={requestWorkspace} />}
          <div hidden={activeMenu === 'paint'}>
          {multiplayerStatus.phase !== 'solo' && <GraffitiPieces pieces={multiplayerView.pieces ?? []} connected={multiplayerStatus.phase === 'connected'} role={multiplayerStatus.role} canDeletePieces={multiplayerStatus.canDeletePieces} onDelete={pieceId => { if (multiplayerStatus.phase !== 'connected' || !multiplayerStatus.canDeletePieces) return false; requestMultiplayer('delete-piece', pieceId); return true; }} onLike={pieceId => { if (multiplayerStatus.phase !== 'connected') return false; requestMultiplayer('like', pieceId); return true; }} onResync={() => requestMultiplayer('resync')} onView={pieceId => requestMultiplayer('inspect', pieceId)} />}
          <MultiplayerControls
            status={multiplayerStatus} displayName={displayName} avatar={aippyUser.avatar} profileLoading={aippyUser.isLoading}
            onJoin={() => requestMultiplayer('join')} onLeave={() => requestMultiplayer('leave')}
            messages={multiplayerView.chat} onChat={text => requestMultiplayer('chat', text)} onResync={() => requestMultiplayer('resync')}
          />
          <PlayerInteractionCard selected={multiplayerView.selectedPlayer} ownRole={multiplayerStatus.role} connected={multiplayerStatus.phase === 'connected'} notice={multiplayerStatus.notice} roleChange={multiplayerView.roleChange}
            onSetRole={(username, role) => {
              const ownRole = multiplayerStatus.role;
              if (multiplayerStatus.phase !== 'connected' || (ownRole !== 'owner' && ownRole !== 'admin') || (ownRole === 'admin' && role === 'owner')) return false;
              requestMultiplayer('set-role', username, role); return true;
            }} />
          </div>
          <button
            type="button"
            className="absolute right-3 top-16 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-sm text-white/40"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
          {settingsOpen && !devViewerOpen && (
            <SettingsModal
              onClose={() => setSettingsOpen(false)}
              onUnlock={() => setDevViewerOpen(true)}
            />
          )}
          {devViewerOpen && (
            <Suspense fallback={(
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-950 font-mono text-xs text-neutral-500">
                LOADING…
              </div>
            )}
            >
              <ProjectFileViewer onClose={() => setDevViewerOpen(false)} />
            </Suspense>
          )}
        </>
      )}
    </main>
  );
};

export default App;
