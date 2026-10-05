import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import menuBackground from '@/assets/graffciti-menu.webp';
import { aippyTweaks } from '@aippy/runtime/tweaks';
import GameHud, { type HudMenu } from '@/components/GameHud';
import WorldScene from '@/components/WorldScene';
import LookJoystick from '@/components/LookJoystick';
import type { AdminAction, AdminActionOptions } from '@/multiplayer/adminActions';
import CanvasCredits from '@/components/CanvasCredits';
import ProtectionControls from '@/components/ProtectionControls';
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
import { LiveRadioController } from '@/game/liveRadio';
import { RADIO_STREAM_URL } from '@/config/radio';

const ProjectFileViewer = lazy(() => import('@/components/ProjectFileViewer'));

const tweaks = aippyTweaks(tweaksConfig);
const COVER_IMAGE_URL = menuBackground;
const COLORS = ['#ff4d43', '#ff65a5', '#45d7df', '#ffd34e', '#b9e84e', '#f7f2dc'];
const CAMERA_LABELS: Record<CameraMode, string> = {
  first: 'FIRST PERSON', third: 'THIRD PERSON', map: 'MAP VIEW',
};
const MAX_LAYERS = 5;
const LOCAL_PIECE_NAMES_KEY = 'sidestreet.local-piece-names.v1';
const readLocalPieceNames = (): Record<string, string> => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LOCAL_PIECE_NAMES_KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, title]) => key.length <= 300 && typeof title === 'string' && title.length <= 60).slice(-1000));
  } catch { return {}; }
};
interface PaintLayerState { name: string; visible: boolean }
interface EmoteSignal { emote: AvatarEmote; sequence: number }
type PaintTool = 'paint' | 'eraser' | 'off' | 'admin';

const App = () => {
  const aippyUser = useUserInfo();
  const displayName = aippyDisplayName(aippyUser);
  const [multiplayerStatus, setMultiplayerStatus] = useState<MultiplayerStatus>({ phase: 'solo', playerCount: 0 });
  const [multiplayerView, setMultiplayerView] = useState<MultiplayerView>({ chat: [], revision: 0, accountFeaturesAvailable: false, worldItemCount: 0 });
  const [multiplayerRequest, setMultiplayerRequest] = useState<{ action: 'join' | 'leave' | 'chat' | 'resync' | 'like' | 'inspect' | 'delete-piece' | 'set-role' | 'paint-over' | 'quote-protection' | 'buy-protection' | 'admin-action'; text?: string; role?: ServerRole; colour?: string; adminAction?: AdminAction; options?: AdminActionOptions; sequence: number } | null>(null);
  const requestMultiplayer = (action: 'join' | 'leave' | 'chat' | 'resync' | 'like' | 'inspect' | 'delete-piece' | 'set-role' | 'paint-over' | 'quote-protection' | 'buy-protection' | 'admin-action', text?: string, role?: ServerRole, colour?: string) => {
    if (action === 'inspect') { setPaintMode(false); requestWorkspace('exit'); setViewMode('first'); }
    if (action === 'join' || action === 'leave') { poster.cancel(); requestWorkspace('clear'); }
    setMultiplayerRequest(previous => ({ action, text, role, colour, sequence: (previous?.sequence ?? 0) + 1 }));
  };
  const accentColor = tweaks.accentColor.useState();
  const panelColor = tweaks.panelColor.useState();
  const initialBrushSize = tweaks.brushSize.useState();
  const moveSpeed = tweaks.moveSpeed.useState();
  const jumpPower = tweaks.jumpPower.useState();
  const lookSensitivity = tweaks.lookSensitivity.useState();
  const musicVolume = tweaks.musicVolume.useState();
  const [radioController, setRadioController] = useState<LiveRadioController | null>(null);
  const [radioVolume, setRadioVolume] = useState(musicVolume);
  const initialRadioVolume = useRef(musicVolume);
  const fogDensity = tweaks.fogDensity.useState();
  const showCrosshair = tweaks.showCrosshair.useState();
  const [hasJoined, setHasJoined] = useState(false);
  const [brushSelection, setBrushSelection] = useState<{ value: number; source: number } | null>(null);
  const brushSize = brushSelection?.source === initialBrushSize ? brushSelection.value : Math.max(.1, Math.min(10, initialBrushSize / 3));
  const [opacity, setOpacity] = useState(0.88);
  const [brushHead, setBrushHead] = useState<BrushHead>('soft');
  const { warmAudio, playSpray, playChime } = useSprayAudio();
  const [sky, setSky] = useState<SkyMode>('day');
  const [paintMode, setPaintMode] = useState(false);
  const [adminPainting, setAdminPainting] = useState(false);
  const adminFreePaint = adminPainting && multiplayerStatus.phase === 'connected' && !!multiplayerStatus.canAdminPaint;
  const [portrait, setPortrait] = useState(false);
  const [screenPortrait, setScreenPortrait] = useState(() => window.innerHeight >= window.innerWidth);
  const rotatedPortrait = portrait ? !screenPortrait : screenPortrait;
  useEffect(() => {
    const update = () => setScreenPortrait(window.innerHeight >= window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const [workspaceView, setWorkspaceView] = useState<PaintWorkspaceView>({ selected: false, active: false, width: 0, height: 0 });
  const [localPieceNames, setLocalPieceNames] = useState<Record<string, string>>(readLocalPieceNames);
  const [pieceTitleDraft, setPieceTitleDraft] = useState('');
  const workspaceNameKey = workspaceView.bounds ? JSON.stringify(workspaceView.bounds) : '';
  useEffect(() => setPieceTitleDraft(workspaceNameKey ? localPieceNames[workspaceNameKey] ?? '' : ''), [workspaceNameKey]);
  const [workspaceRequest, setWorkspaceRequest] = useState<{ action: PaintWorkspaceAction; size?: number; height?: number; title?: string; sequence: number } | null>(null);
  const requestWorkspace = (action: PaintWorkspaceAction, size?: number, height?: number, requestedTitle?: string) => {
    if ((action === 'start' || action === 'enter') && multiplayerView.protection?.pendingPurchase) return;
    const title = requestedTitle?.trim().slice(0, 60) || undefined;
    if (action === 'finish' && title && workspaceNameKey) {
      const next = { ...localPieceNames, [workspaceNameKey]: title };
      setLocalPieceNames(next);
      try { localStorage.setItem(LOCAL_PIECE_NAMES_KEY, JSON.stringify(next)); } catch { /* local naming is best effort */ }
    }
    setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 });
    if (action === 'enter' || action === 'start') { setPaintMode(true); closeMenu(); }
    if (action === 'finish' || action === 'clear') setPaintMode(false);
    setWorkspaceRequest(previous => ({ action, size, height, title, sequence: (previous?.sequence ?? 0) + 1 }));
  };
  const sizingKey = workspaceView.selected && workspaceView.bounds ? JSON.stringify(workspaceView.bounds) : '';
  useEffect(() => {
    if (multiplayerStatus.phase !== 'connected' || !sizingKey || workspaceView.hasPaint || multiplayerView.protection?.protectedUntil || adminFreePaint) return;
    const timer = window.setTimeout(() => requestMultiplayer('quote-protection'), 350);
    return () => window.clearTimeout(timer);
  }, [sizingKey, multiplayerStatus.phase, workspaceView.hasPaint, multiplayerView.protection?.protectedUntil, adminFreePaint]);
  useEffect(() => {
    if (adminPainting && !multiplayerStatus.canAdminPaint) { setAdminPainting(false); setPaintMode(false); }
  }, [adminPainting, multiplayerStatus.canAdminPaint]);
  const [eraseMode, setEraseMode] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [eyedropperNotice, setEyedropperNotice] = useState('');
  const [activeMenu, setActiveMenu] = useState<HudMenu>(null);
  const [movement, setMovement] = useState<MovementInput>({ x: 0, y: 0 });
  const [lookInput, setLookInput] = useState<MovementInput>({ x: 0, y: 0 });
  const [jumpSignal, setJumpSignal] = useState(0);
  const [viewMode, setViewMode] = useState<CameraMode>('first');
  const [mapZoom, setMapZoom] = useState(1);
  const [botsEnabled, setBotsEnabled] = useState(false);
  const [nearbyBotIndex, setNearbyBotIndex] = useState<number | null>(null);
  const poster = usePosterPlacement();
  const [layers, setLayers] = useState<PaintLayerState[]>(Array.from({ length: MAX_LAYERS }, (_, index) => ({ name: `Layer ${index + 1}`, visible: true })));
  const [selectedLayer, setSelectedLayer] = useState(2);
  const [progress, setProgress] = useState<GameProgress>(loadGameProgress);
  const [emoteSignal, setEmoteSignal] = useState<EmoteSignal | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devViewerOpen, setDevViewerOpen] = useState(false);
  const audioStartedRef = useRef(false);
  const lastCoinAtRef = useRef(0);
  const shellRef = useRef<HTMLElement>(null);
  useEffect(() => saveGameProgress(progress), [progress]);
  useEffect(() => {
    const radio = new LiveRadioController(RADIO_STREAM_URL, initialRadioVolume.current);
    setRadioController(radio);
    const unsubscribe = radio.subscribe(state => setRadioVolume(state.volume));
    radio.prepare();
    radio.play();
    return () => { unsubscribe(); radio.dispose(); };
  }, []);
  useEffect(() => {
    const shell = shellRef.current;
    const header = shell?.querySelector<HTMLElement>('.top-hud');
    if (!shell || !header) return;
    const update = () => shell.style.setProperty('--hud-height', `${header.offsetTop + header.offsetHeight + 8}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, [hasJoined, portrait]);

  const startAudioOnFirstClick = () => {
    const radioState = radioController?.getState();
    if (radioState && !radioState.playing && !radioState.buffering) radioController?.play();
    if (audioStartedRef.current) return;
    audioStartedRef.current = true;
    void warmAudio();
  };
  const toggleMenu = (menu: Exclude<HudMenu, null>) => setActiveMenu(current => current === menu ? null : menu);
  const closeMenu = () => setActiveMenu(null);
  const updateBrushSize = (value: number) => setBrushSelection({ value: Math.max(.1, Math.min(10, value / 3)), source: initialBrushSize });
  const selectColor = (nextColor: string) => { setColor(nextColor); playChime(); };
  const selectPaintTool = (tool: PaintTool) => {
    setAdminPainting(tool === 'admin');
    if (tool === 'admin') { requestWorkspace('clear'); setPaintMode(true); closeMenu(); return; }
    setEyedropperActive(false);
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
  const pickColour = (next: string | null) => {
    if (!next) { setEyedropperNotice('No readable paint here. Tap a painted spot.'); return; }
    selectColor(next); setEyedropperActive(false); setEyedropperNotice('');
  };
  const cosmetics = useMemo(() => ({ outfit: progress.outfit, top: progress.top, bottom: progress.bottom, accessory: progress.accessory }), [progress.outfit, progress.top, progress.bottom, progress.accessory]);
  const layerVisibility = useMemo(() => layers.map(layer => layer.visible), [layers]);
  const jumpLabel = progress.outfit === 'jax' ? 'FLY' : progress.outfit === 'ringmaster' ? 'LEVITATE'
    : progress.outfit === 'pomni' ? 'HIGH JUMP' : 'JUMP';

  return (
    <main
      ref={shellRef}
      className={`game-shell ${portrait ? 'game-portrait' : ''} ${workspaceView.active ? 'canvas-mode' : ''}`}
      style={{ '--accent': accentColor, '--panel': panelColor } as CSSProperties}
      onClickCapture={startAudioOnFirstClick}
    >
      {!hasJoined ? (
        <section className="cover-screen" aria-label="Welcome to GraffCiti">
          <img className="cover-art" src={COVER_IMAGE_URL} alt="Graffiti-covered city alley" />
          <div className="cover-shade" />
          <div className="cover-content">
            <span className="cover-kicker">AN OPEN CREATIVE WORLD</span>
            <h1>GraffCiti</h1>
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
            eyedropperActive={eyedropperActive} onColorPick={pickColour}
            brushHead={brushHead}
            workspaceRequest={workspaceRequest} onWorkspaceChange={setWorkspaceView}
            multiplayerRequest={multiplayerRequest} displayName={displayName} username={aippyUser.username} nickName={aippyUser.nickName} onMultiplayerStatus={setMultiplayerStatus}
            cosmetics={cosmetics} onMultiplayerView={setMultiplayerView}
            adminFreePaint={adminFreePaint} sky={sky} paintMode={paintMode} eraseMode={eraseMode} color={color}
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
            eyedropperActive={eyedropperActive} onEyedropper={() => { setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 }); setEyedropperNotice('Tap existing paint to pick its colour.'); setEyedropperActive(true); }}
            brushHead={brushHead} onBrushHeadChange={setBrushHead}
            hideTouchControls={workspaceView.active || activeMenu === 'paint' || eyedropperActive}
            panelColor={panelColor} accentColor={accentColor} sky={sky} activeMenu={activeMenu}
            canAdminPaint={!!multiplayerStatus.canAdminPaint} adminFreePaint={adminFreePaint} musicReady={false} radioController={radioController} radioUrl={radioController ? RADIO_STREAM_URL : undefined} radioVolume={musicVolume} paintMode={paintMode} eraseMode={eraseMode}
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
            topControls={<>
              <button type="button" className="portrait-toggle" aria-pressed={portrait} title={rotatedPortrait ? 'Rotate left to landscape' : 'Rotate left to portrait'}
                aria-label={rotatedPortrait ? 'Rotate left to landscape' : 'Rotate left to portrait'}
                onClick={() => { setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 }); setPortrait(value => !value); }}>↶ <span>{rotatedPortrait ? 'LANDSCAPE' : 'PORTRAIT'}</span></button>
              <button type="button" className="settings-trigger" aria-label="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
              <div className="top-network-controls" hidden={activeMenu === 'paint'}>
                {multiplayerStatus.phase !== 'solo' && <CanvasCredits balance={multiplayerView.protection?.creditBalance ?? null} />}
                {<GraffitiPieces canPaintOver={!!multiplayerStatus.canAdminPaint} paintColour={color} onPaintOver={(pieceId, colour) => { if (!multiplayerStatus.canAdminPaint) return false; requestMultiplayer('paint-over', pieceId, undefined, colour); return true; }} selectedPieceId={multiplayerView.selectedPieceId} piecePickSequence={multiplayerView.piecePickSequence} pieces={multiplayerView.pieces ?? []} connected={multiplayerStatus.phase === 'connected'} role={multiplayerStatus.role} canDeletePieces={multiplayerStatus.canDeletePieces} onDelete={pieceId => { if (multiplayerStatus.phase !== 'connected' || !multiplayerStatus.canDeletePieces) return false; requestMultiplayer('delete-piece', pieceId); return true; }} onLike={pieceId => { if (multiplayerStatus.phase !== 'connected') return false; requestMultiplayer('like', pieceId); return true; }} onResync={() => requestMultiplayer('resync')} onView={pieceId => requestMultiplayer('inspect', pieceId)} />}
                <MultiplayerControls status={multiplayerStatus} displayName={displayName} avatar={aippyUser.avatar} profileLoading={aippyUser.isLoading}
                  onJoin={() => requestMultiplayer('join')} onLeave={() => requestMultiplayer('leave')}
                  messages={multiplayerView.chat} onChat={text => requestMultiplayer('chat', text)} onResync={() => requestMultiplayer('resync')} />
              </div>
            </>}
          />
          {activeMenu !== 'paint' && <LookJoystick onLook={setLookInput} canvasMode={workspaceView.active} />}
          {activeMenu !== 'paint' && <PaintWorkspaceHud view={workspaceView} painting={paintMode && !adminFreePaint} onAction={requestWorkspace}
            pieceTitle={pieceTitleDraft} onPieceTitleChange={setPieceTitleDraft}
            protectedUntil={multiplayerView.protection?.protectedUntil} geometryLocked={!!multiplayerView.protection?.pendingPurchase || !!multiplayerView.protection?.protectedUntil}
            protectionControls={multiplayerStatus.phase === 'connected' && !adminFreePaint && (!workspaceView.hasPaint || !!multiplayerView.protection?.protectedUntil) ? <ProtectionControls
              balance={multiplayerView.protection?.creditBalance ?? null} quote={multiplayerView.protection?.quote ?? null}
              pending={!!multiplayerView.protection?.pendingQuote || !!multiplayerView.protection?.pendingPurchase}
              protectedUntil={multiplayerView.protection?.protectedUntil ?? null} notice={multiplayerView.protection?.notice ?? null}
              onQuote={() => requestMultiplayer('quote-protection')} onPurchase={() => requestMultiplayer('buy-protection')} /> : undefined} />}
          {eyedropperActive && <aside className="eyedropper-hint" role="status"><span>{eyedropperNotice}</span><button type="button" onClick={() => setEyedropperActive(false)}>CANCEL</button></aside>}
          <div hidden={activeMenu === 'paint'}>
          <PlayerInteractionCard adminResult={multiplayerView.adminResult} onAdminAction={(action, targetUsername, options) => {
            if (multiplayerStatus.phase !== 'connected' || !['admin', 'owner'].includes(multiplayerStatus.role ?? '')) return false;
            setMultiplayerRequest(previous => ({ action: 'admin-action', text: targetUsername, adminAction: action, options, sequence: (previous?.sequence ?? 0) + 1 }));
            return true;
          }} selected={multiplayerView.selectedPlayer} ownRole={multiplayerStatus.role} connected={multiplayerStatus.phase === 'connected'} notice={multiplayerStatus.notice} roleChange={multiplayerView.roleChange}
            onSetRole={(username, role) => {
              const ownRole = multiplayerStatus.role;
              if (multiplayerStatus.phase !== 'connected' || (ownRole !== 'owner' && ownRole !== 'admin') || (ownRole === 'admin' && role === 'owner')) return false;
              requestMultiplayer('set-role', username, role); return true;
            }} />
          </div>
          {settingsOpen && !devViewerOpen && (
            <SettingsModal
              onClose={() => setSettingsOpen(false)}
              onUnlock={() => setDevViewerOpen(true)}
              radioVolume={radioVolume} onRadioVolume={volume => radioController?.setVolume(volume)}
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
