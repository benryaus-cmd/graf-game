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
import RadioControl from '@/components/RadioControl';
import { useSprayAudio } from '@/components/useSprayAudio';
import { usePosterPlacement } from '@/game/usePosterPlacement';
import { getAvatarAppearance, loadGameProgress, saveGameProgress, type GameProgress, type ShopItem } from '@/game/progression';
import tweaksConfig from '@/config/tweaksConfig.json';
import type { AvatarEmote, CameraMode, MovementInput, SkyMode } from '@/game/worldTypes';
import type { BrushHead } from '@/game/sprayHeads';
import { LiveRadioController } from '@/game/liveRadio';
import { RADIO_STREAM_URL } from '@/config/radio';
import TutorialOverlay from '@/components/TutorialOverlay';
import { TUTORIAL_ORDER, nextTutorialStep, readTutorialCompleted, writeTutorialCompleted, type TutorialStep } from '@/game/tutorial';

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
  const [multiplayerRequest, setMultiplayerRequest] = useState<{ action: 'join' | 'leave' | 'chat' | 'resync' | 'like' | 'inspect' | 'delete-piece' | 'set-role' | 'paint-over' | 'quote-protection' | 'buy-protection' | 'admin-action'; text?: string; role?: ServerRole; colour?: string; protectionEnabled?: boolean; adminAction?: AdminAction; options?: AdminActionOptions; sequence: number } | null>(null);
  const requestMultiplayer = (action: 'join' | 'leave' | 'chat' | 'resync' | 'like' | 'inspect' | 'delete-piece' | 'set-role' | 'paint-over' | 'quote-protection' | 'buy-protection' | 'admin-action', text?: string, role?: ServerRole, colour?: string, protectionEnabled?: boolean) => {
    if (action === 'inspect') { setPaintMode(false); requestWorkspace('exit'); setViewMode('first'); }
    if (action === 'join' || action === 'leave') { poster.cancel(); requestWorkspace('clear'); }
    setMultiplayerRequest(previous => ({ action, text, role, colour, protectionEnabled, sequence: (previous?.sequence ?? 0) + 1 }));
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
  const [workspaceView, setWorkspaceView] = useState<PaintWorkspaceView>({ selected: false, active: false, width: 0, height: 0 });
  const [localPieceNames, setLocalPieceNames] = useState<Record<string, string>>(readLocalPieceNames);
  const [pieceTitleDraft, setPieceTitleDraft] = useState('');
  const [protectionEnabled, setProtectionEnabled] = useState(false);
  const workspaceNameKey = workspaceView.bounds ? JSON.stringify(workspaceView.bounds) : '';
  useEffect(() => setPieceTitleDraft(workspaceNameKey ? localPieceNames[workspaceNameKey] ?? '' : ''), [workspaceNameKey]);
  const [workspaceRequest, setWorkspaceRequest] = useState<{ action: PaintWorkspaceAction; size?: number; height?: number; title?: string; protectionEnabled?: boolean; sequence: number } | null>(null);
  const activeProtectionQuote = multiplayerView.protection?.quotes?.[protectionEnabled ? 'protected' : 'unprotected'] ?? null;
  const quoteMatchesWorkspace = !!activeProtectionQuote && !!workspaceView.bounds &&
    activeProtectionQuote.bounds.min.every((value, axis) => value === workspaceView.bounds?.min[axis]) &&
    activeProtectionQuote.bounds.max.every((value, axis) => value === workspaceView.bounds?.max[axis]);
  const protectionStartDisabled = multiplayerStatus.phase === 'solo' ? false : multiplayerStatus.phase !== 'connected'
    ? !multiplayerView.protection?.purchased
    : !multiplayerView.protection?.purchased && (!activeProtectionQuote?.canPurchase || !quoteMatchesWorkspace || !!multiplayerView.protection?.pendingPurchase);
  const protectionStartLabel = protectionStartDisabled
    ? multiplayerStatus.phase !== 'solo' && multiplayerStatus.phase !== 'connected' ? 'RECONNECT TO PURCHASE'
      : multiplayerView.protection?.pendingPurchase ? 'WAITING FOR SERVER' : 'WAITING FOR QUOTE'
    : 'START PAINTING';
  const requestWorkspace = (action: PaintWorkspaceAction, size?: number, height?: number, requestedTitle?: string, requestedProtectionEnabled?: boolean) => {
    if ((action === 'start' || action === 'enter') && multiplayerView.protection?.pendingPurchase) return;
    if (action === 'start' && protectionStartDisabled) return;
    const title = requestedTitle?.trim().slice(0, 60) || undefined;
    if (action === 'finish' && title && workspaceNameKey) {
      const next = { ...localPieceNames, [workspaceNameKey]: title };
      setLocalPieceNames(next);
      try { localStorage.setItem(LOCAL_PIECE_NAMES_KEY, JSON.stringify(next)); } catch { /* local naming is best effort */ }
    }
    setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 });
    if (action === 'enter' || action === 'start') { setPaintMode(true); closeMenu(); }
    if (action === 'finish' || action === 'clear') setPaintMode(false);
    setWorkspaceRequest(previous => ({ action, size, height, title, protectionEnabled: action === 'start' ? requestedProtectionEnabled ?? protectionEnabled : undefined, sequence: (previous?.sequence ?? 0) + 1 }));
    if (action === 'finish' && tutorialStep === 'finish') { setTutorialStep('radio'); setActiveMenu('settings'); }
  };
  const sizingKey = workspaceView.selected && workspaceView.bounds ? JSON.stringify(workspaceView.bounds) : '';
  useEffect(() => {
    if (multiplayerStatus.phase !== 'connected' || !sizingKey || workspaceView.hasPaint || multiplayerView.protection?.purchased || adminFreePaint) return;
    const timer = window.setTimeout(() => requestMultiplayer('quote-protection', undefined, undefined, undefined, protectionEnabled), 350);
    return () => window.clearTimeout(timer);
  }, [sizingKey, multiplayerStatus.phase, workspaceView.hasPaint, multiplayerView.protection?.purchased, adminFreePaint, protectionEnabled]);
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
  const [devViewerOpen, setDevViewerOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(null);
  const [tutorialCompleted, setTutorialCompleted] = useState(readTutorialCompleted);
  const tutorialSizeStartRef = useRef<{ width: number; height: number } | null>(null);
  const tutorialMoveBoundsRef = useRef('');
  const tutorialMoveArmedRef = useRef(false);
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
    const container = shell?.parentElement;
    if (!shell || !container) return;
    const update = () => {
      shell.style.setProperty('--game-container-width', `${container.clientWidth}px`);
      shell.style.setProperty('--game-container-height', `${container.clientHeight}px`);
      setScreenPortrait(container.clientHeight >= container.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (multiplayerView.selectedPieceId) setActiveMenu('art');
  }, [multiplayerView.selectedPieceId, multiplayerView.piecePickSequence]);
  useEffect(() => {
    if (multiplayerView.selectedPlayer) setActiveMenu('player');
    else setActiveMenu(current => current === 'player' ? null : current);
  }, [multiplayerView.selectedPlayer?.playerId, multiplayerView.playerPickSequence]);
  useEffect(() => {
    if (!tutorialStep) return;
    if (['move', 'look', 'select-canvas', 'size-canvas', 'move-canvas', 'start-painting', 'paint', 'finish'].includes(tutorialStep)) setActiveMenu(null);
    if (tutorialStep === 'select-canvas') {
      setPaintMode(true);
      setEraseMode(false);
    }
    if (tutorialStep === 'size-canvas') {
      tutorialSizeStartRef.current = { width: workspaceView.width, height: workspaceView.height };
      setActiveMenu(null);
    }
    if (tutorialStep === 'move-canvas') {
      tutorialMoveBoundsRef.current = workspaceView.bounds ? JSON.stringify(workspaceView.bounds) : '';
      tutorialMoveArmedRef.current = false;
      setActiveMenu(null);
    }
    if (tutorialStep === 'radio' || tutorialStep === 'multiplayer') setActiveMenu('settings');
  }, [tutorialStep]);

  useEffect(() => {
    if (tutorialStep === 'move' && Math.hypot(movement.x, movement.y) > .15) advanceTutorial('move');
  }, [tutorialStep, movement.x, movement.y]);
  useEffect(() => {
    if (tutorialStep === 'look' && Math.hypot(lookInput.x, lookInput.y) > .15) advanceTutorial('look');
  }, [tutorialStep, lookInput.x, lookInput.y]);
  useEffect(() => {
    if (tutorialStep === 'select-canvas' && workspaceView.selected) setTutorialStep('size-canvas');
  }, [tutorialStep, workspaceView.selected]);
  useEffect(() => {
    if (tutorialStep !== 'size-canvas' || !tutorialSizeStartRef.current) return;
    const start = tutorialSizeStartRef.current;
    if (Math.abs(workspaceView.width - start.width) > .01 || Math.abs(workspaceView.height - start.height) > .01) setTutorialStep('move-canvas');
  }, [tutorialStep, workspaceView.width, workspaceView.height]);
  useEffect(() => {
    if (tutorialStep !== 'move-canvas') return;
    if (workspaceView.moving) tutorialMoveArmedRef.current = true;
    const bounds = workspaceView.bounds ? JSON.stringify(workspaceView.bounds) : '';
    if (tutorialMoveArmedRef.current && bounds && bounds !== tutorialMoveBoundsRef.current) setTutorialStep('start-painting');
  }, [tutorialStep, workspaceView.moving, workspaceView.bounds]);
  useEffect(() => {
    if (tutorialStep === 'start-painting' && workspaceView.started) setTutorialStep('paint');
  }, [tutorialStep, workspaceView.started]);
  useEffect(() => {
    if (tutorialStep === 'paint' && workspaceView.hasPaint) setTutorialStep('finish');
  }, [tutorialStep, workspaceView.hasPaint]);
  useEffect(() => {
    if (tutorialStep === 'multiplayer' && multiplayerStatus.phase === 'connected') setTutorialStep('multiplayer-info');
  }, [tutorialStep, multiplayerStatus.phase]);

  const startAudioOnFirstClick = () => {
    const radioState = radioController?.getState();
    if (radioState && !radioState.playing && !radioState.buffering) radioController?.play();
    if (audioStartedRef.current) return;
    audioStartedRef.current = true;
    void warmAudio();
  };
  const toggleMenu = (menu: Exclude<HudMenu, null>) => setActiveMenu(current => current === menu ? null : menu);
  const closeMenu = () => setActiveMenu(null);
  const advanceTutorial = (expected: TutorialStep) => setTutorialStep(current => current === expected ? nextTutorialStep(current) : current);
  const beginTutorial = () => {
    if (multiplayerStatus.phase !== 'solo') requestMultiplayer('leave');
    setHasJoined(true);
    setActiveMenu(null);
    setTutorialStep('move');
  };
  const openTutorial = () => setTutorialStep('welcome');
  const skipTutorial = () => setTutorialStep(null);
  const backTutorial = () => setTutorialStep(current => {
    if (!current) return current;
    const index = TUTORIAL_ORDER.indexOf(current);
    return index > 0 ? TUTORIAL_ORDER[index - 1] : current;
  });
  const restartTutorial = () => {
    writeTutorialCompleted(false);
    setTutorialCompleted(false);
    setTutorialStep('welcome');
  };
  const finishTutorial = () => {
    writeTutorialCompleted(true);
    setTutorialCompleted(true);
    setTutorialStep('complete');
  };
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

  const workspaceHud = <PaintWorkspaceHud compact={activeMenu === 'paint'} view={workspaceView} painting={paintMode && !adminFreePaint} onAction={requestWorkspace}
            protectionEnabled={protectionEnabled} startDisabled={protectionStartDisabled} startLabel={protectionStartLabel}
            pieceTitle={pieceTitleDraft} onPieceTitleChange={setPieceTitleDraft}
            protectedUntil={multiplayerView.protection?.protectedUntil} geometryLocked={!!multiplayerView.protection?.pendingPurchase || !!multiplayerView.protection?.purchased}
            protectionControls={multiplayerStatus.phase === 'connected' && !adminFreePaint && (!workspaceView.hasPaint || !!multiplayerView.protection?.protectedUntil) ? <ProtectionControls
              balance={multiplayerView.protection?.creditBalance ?? null} quote={activeProtectionQuote}
              quotes={multiplayerView.protection?.quotes ?? { unprotected: null, protected: null }} protectionEnabled={protectionEnabled}
              pending={!!multiplayerView.protection?.pendingQuote} pendingPurchase={!!multiplayerView.protection?.pendingPurchase} purchased={!!multiplayerView.protection?.purchased}
              protectedUntil={multiplayerView.protection?.protectedUntil ?? null} notice={multiplayerView.protection?.notice ?? null}
              onQuote={() => requestMultiplayer('quote-protection', undefined, undefined, undefined, protectionEnabled)}
              onProtectionEnabledChange={setProtectionEnabled} /> : undefined} />;

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
            <button type="button" className="cover-tutorial" onClick={openTutorial}>HOW TO PLAY</button>
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
            hideTouchControls={workspaceView.active || !!activeMenu || eyedropperActive}
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
            workspaceControls={activeMenu === 'paint' ? workspaceHud : undefined}
            topControls={<>
              <div className="top-network-controls">
                {multiplayerStatus.phase !== 'solo' ? <CanvasCredits balance={multiplayerView.protection?.creditBalance ?? null} /> : <span className="canvas-credit-status" aria-label="Solo coins">🪙 {progress.coins}</span>}
                {<GraffitiPieces open={activeMenu === 'art'} onOpenChange={open => setActiveMenu(open ? 'art' : null)} canPaintOver={!!multiplayerStatus.canAdminPaint} paintColour={color} onPaintOver={(pieceId, colour) => { if (!multiplayerStatus.canAdminPaint) return false; requestMultiplayer('paint-over', pieceId, undefined, colour); return true; }} selectedPieceId={multiplayerView.selectedPieceId} piecePickSequence={multiplayerView.piecePickSequence} pieces={multiplayerView.pieces ?? []} connected={multiplayerStatus.phase === 'connected'} role={multiplayerStatus.role} canDeletePieces={multiplayerStatus.canDeletePieces} onDelete={pieceId => { if (multiplayerStatus.phase !== 'connected' || !multiplayerStatus.canDeletePieces) return false; requestMultiplayer('delete-piece', pieceId); return true; }} onLike={pieceId => { if (multiplayerStatus.phase !== 'connected') return false; requestMultiplayer('like', pieceId); return true; }} onResync={() => requestMultiplayer('resync')} onView={pieceId => requestMultiplayer('inspect', pieceId)} />}
                <MultiplayerControls chatOpen={activeMenu === 'chat'} onChatToggle={() => toggleMenu('chat')} onChatClose={closeMenu} onOpenMenu={() => toggleMenu('settings')} status={multiplayerStatus} displayName={displayName} avatar={aippyUser.avatar} profileLoading={aippyUser.isLoading}
                  onJoin={() => requestMultiplayer('join')} onLeave={() => requestMultiplayer('leave')}
                  messages={multiplayerView.chat} onChat={text => requestMultiplayer('chat', text)} onResync={() => requestMultiplayer('resync')} />
              </div>
            </>}
          />
          {!activeMenu && <LookJoystick onLook={setLookInput} canvasMode={workspaceView.active} />}
          {activeMenu !== 'paint' && workspaceHud}
          {eyedropperActive && <aside className="eyedropper-hint" role="status"><span>{eyedropperNotice}</span><button type="button" onClick={() => setEyedropperActive(false)}>CANCEL</button></aside>}
          <div hidden={activeMenu === 'paint'}>
          <PlayerInteractionCard open={activeMenu === 'player'} onClose={closeMenu} adminResult={multiplayerView.adminResult} onAdminAction={(action, targetUsername, options) => {
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
          {activeMenu === 'settings' && !devViewerOpen && (
            <SettingsModal
              onClose={closeMenu}
              onUnlock={() => { closeMenu(); setDevViewerOpen(true); }}
              radioVolume={radioVolume} onRadioVolume={volume => radioController?.setVolume(volume)}
            >
              <div className="menu-profile">{aippyUser.avatar && <img src={aippyUser.avatar} alt="" referrerPolicy="no-referrer" />}<div><strong>{displayName}</strong><small>GraffCiti</small></div></div>
              <section className="tool-section"><h3>PLAY</h3><div className="menu-grid">
                <button type="button" onClick={() => toggleMenu('avatar')}>PROFILE &amp; CLOSET</button>
                <button type="button" onClick={() => toggleMenu('art')}>NEARBY ART</button>
                <button type="button" onClick={() => { closeMenu(); openTutorial(); }}>{tutorialCompleted ? 'REPLAY TUTORIAL' : 'TUTORIAL'}</button>
                <button type="button" onClick={changeView}>{CAMERA_LABELS[viewMode]}</button>
                <button type="button" onClick={() => toggleMenu('sky')}>CHANGE SKY</button>
                <button type="button" aria-pressed={portrait} onClick={() => { setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 }); setPortrait(value => !value); closeMenu(); }}>{rotatedPortrait ? 'ROTATE TO LANDSCAPE' : 'ROTATE TO PORTRAIT'}</button>
                {multiplayerStatus.canAdminPaint && <button type="button" aria-pressed={adminFreePaint} onClick={() => selectPaintTool(adminFreePaint ? 'off' : 'admin')}>ADMIN PAINT</button>}
              </div></section>
              <section className="tool-section"><h3>MULTIPLAYER</h3><div className="button-row">
                {multiplayerStatus.phase === 'solo' || multiplayerStatus.phase === 'disconnected' ? <button type="button" data-tutorial="multiplayer-join" disabled={aippyUser.isLoading} onClick={() => requestMultiplayer('join')}>{multiplayerStatus.phase === 'solo' ? 'JOIN MULTIPLAYER' : 'RECONNECT'}</button> : <button type="button" onClick={() => requestMultiplayer('leave')}>{multiplayerStatus.phase === 'connecting' ? 'CANCEL JOINING' : 'PLAY SOLO'}</button>}
                <button type="button" onClick={() => toggleMenu('chat')}>ROOM CHAT</button>
              </div>{multiplayerStatus.notice && <p className="ui-notice" role="status">{multiplayerStatus.notice}</p>}</section>
              <section className="tool-section"><h3>RADIO</h3>{radioController && <RadioControl controller={radioController} url={RADIO_STREAM_URL} initialVolume={musicVolume} onInteraction={() => { if (tutorialStep === 'radio') setTutorialStep('multiplayer'); }} />}</section>
            </SettingsModal>
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
      {tutorialStep && <TutorialOverlay
        step={tutorialStep}
        onStart={beginTutorial}
        onBack={backTutorial}
        onSkip={skipTutorial}
        onContinue={finishTutorial}
        onRestart={restartTutorial}
        onClose={() => setTutorialStep(null)}
      />}
    </main>
  );
};

export default App;
