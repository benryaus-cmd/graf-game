import { getMapId, selectMap, readMapSky, saveMapSky, MORNING_PRESET, canJoinMultiplayer, type MapId } from '@/game/mapPreference';
import { setRenderSettings } from '@/game/renderSettings';
import { SheetCollapseContext } from '@/components/GameSheet';
import PlayersSheet from '@/components/PlayersSheet';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import menuBackground from '@/assets/graffciti-menu.webp';
import { createPortal } from 'react-dom';
import { aippyTweaks } from '@aippy/runtime/tweaks';
import GameHud, { type HudMenu } from '@/components/GameHud';
import WorldScene, { type MultiplayerRequest } from '@/components/WorldScene';
import LookJoystick from '@/components/LookJoystick';
import CanvasCredits from '@/components/CanvasCredits';
import ProtectionControls from '@/components/ProtectionControls';
import GraffitiPieces from '@/components/GraffitiPieces';
import PaintWorkspaceHud, { type PaintWorkspaceView, type PaintWorkspaceAction, type PaintWorkspaceHistory } from '@/components/PaintWorkspaceHud';
import { EmoteViewReturn } from '@/game/emoteViewReturn';
import { useAssetPreviewPreference } from '@/game/assetPreviewPreference';
import type { CharacterModelState } from '@/game/assetPreview';
import MultiplayerControls from '@/components/MultiplayerControls';
import PlayerInteractionCard from '@/components/PlayerInteractionCard';
import { useUserInfo } from '@aippy/runtime/user';
import { aippyDisplayName } from '@/multiplayer/profile';
import type { MultiplayerStatus, MultiplayerView } from '@/multiplayer/protocol';
import type { ServerRole } from '@/multiplayer/permissions';
import SettingsModal from '@/components/SettingsModal';
import DeveloperPanel from '@/components/DeveloperPanel';
import GameSheet from '@/components/GameSheet';
import RadioControl from '@/components/RadioControl';
import { useSprayAudio } from '@/components/useSprayAudio';
import { usePosterPlacement } from '@/game/usePosterPlacement';
import { getAvatarAppearance, loadGameProgress, saveGameProgress, type GameProgress, type ShopItem } from '@/game/progression';
import tweaksConfig from '@/config/tweaksConfig.json';
import type { AvatarEmote, CameraMode, MovementInput, SkyMode } from '@/game/worldTypes';
import type { BrushHead } from '@/game/sprayHeads';
import { LiveRadioController } from '@/game/liveRadio';
import { RADIO_STREAM_URL } from '@/config/radio';
import { CLIENT_VERSION } from '@/config/clientVersion';
import ReferenceSheet from '@/components/ReferenceSheet';
import ReferenceControls from '@/components/ReferenceControls';
import type { ReferenceSettings } from '@/game/referenceGuide';
import TutorialOverlay from '@/components/TutorialOverlay';
import { TUTORIAL_ORDER, nextTutorialStep, tutorialStartStep, tutorialObservedStep, readTutorialCompleted, writeTutorialCompleted, type TutorialStep } from '@/game/tutorial';

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
  const [mapId,setMapId]=useState<MapId>(getMapId);
  const [newMapPrompt, setNewMapPrompt] = useState(false);
  const [basketballActive,setBasketballActive]=useState(false);
  const characterPreference = useAssetPreviewPreference();
  const [characterState, setCharacterState] = useState<CharacterModelState | null>(null);
  const aippyUser = useUserInfo();
  const displayName = aippyDisplayName(aippyUser);
  const [multiplayerStatus, setMultiplayerStatus] = useState<MultiplayerStatus>({ phase: 'solo', playerCount: 0 });
  const [multiplayerView, setMultiplayerView] = useState<MultiplayerView>({ chat: [], revision: 0, accountFeaturesAvailable: false, worldItemCount: 0 });
  const [multiplayerRequest, setMultiplayerRequest] = useState<MultiplayerRequest | null>(null);
  const [multiplayerConsentOpen, setMultiplayerConsentOpen] = useState(false);
  const confirmedMultiplayerJoin = useRef(false);
  const requestMultiplayer = (action: MultiplayerRequest['action'], text?: string, role?: ServerRole, colour?: string, protectionEnabled?: boolean, creator?: MultiplayerRequest['creator']) => {
    if(action==='join'&&!canJoinMultiplayer(mapId))return;
    if (action === 'join' && !confirmedMultiplayerJoin.current) {
      setMultiplayerConsentOpen(true);
      return;
    }
    if (action === 'join') confirmedMultiplayerJoin.current = false;
    if (action === 'inspect' || action === 'inspect-artwork') { setPaintMode(false); requestWorkspace('exit'); setViewMode('first'); }
    if (action === 'join' || action === 'leave') { setReference(null); poster.cancel(); requestWorkspace('clear'); }
    setMultiplayerRequest(previous => ({ action, text, role, colour, protectionEnabled, creator, sequence: (previous?.sequence ?? 0) + 1 }));
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
  useEffect(() => {
    if (hasJoined && mapId === 'original') setNewMapPrompt(true);
  }, [hasJoined, mapId]);
  const [brushSelection, setBrushSelection] = useState<{ value: number; source: number } | null>(null);
  const brushSize = brushSelection?.source === initialBrushSize ? brushSelection.value : Math.max(.1, Math.min(10, initialBrushSize / 3));
  const [opacity, setOpacity] = useState(0.88);
  const [brushHead, setBrushHead] = useState<BrushHead>('soft');
  const { warmAudio, playSpray, playChime, playBasketSwish } = useSprayAudio();
  const [sky, setSky] = useState<SkyMode>(()=>readMapSky(getMapId()));
  const [paintMode, setPaintMode] = useState(false);
  const [adminPainting, setAdminPainting] = useState(false);
  const adminFreePaint = adminPainting && multiplayerStatus.phase === 'connected' && !!multiplayerStatus.canAdminPaint;
  const [portrait, setPortrait] = useState(false);
  const [screenPortrait, setScreenPortrait] = useState(() => window.innerHeight >= window.innerWidth);
  const rotatedPortrait = portrait ? !screenPortrait : screenPortrait;
  const [canvasCollapsed, setCanvasCollapsed] = useState(true);
  const [reference, setReference] = useState<ReferenceSettings | null>(null);
  useEffect(() => { const url = reference?.url; return () => { if (url) URL.revokeObjectURL(url); }; }, [reference?.url]);
  const [workspaceView, setWorkspaceView] = useState<PaintWorkspaceView>({ selected: false, active: false, width: 0, height: 0 });
  useEffect(() => { if (!workspaceView.selected) { setCanvasCollapsed(true); setReference(null); } }, [workspaceView.selected]);
  useEffect(() => { setReference(null); }, [multiplayerStatus.phase, multiplayerView.ownPlayerId]);
  const referenceRevision = useRef(multiplayerView.revision);
  useEffect(() => {
    if (multiplayerView.revision < referenceRevision.current) setReference(null);
    referenceRevision.current = multiplayerView.revision;
  }, [multiplayerView.revision]);
  const [localPieceNames, setLocalPieceNames] = useState<Record<string, string>>(readLocalPieceNames);
  const [pieceTitleDraft, setPieceTitleDraft] = useState('');
  const [protectionEnabled, setProtectionEnabled] = useState(false);
  const workspaceNameKey = workspaceView.bounds ? (mapId==='map2'?'map2-v1:':'')+JSON.stringify(workspaceView.bounds) : '';
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
    if (['start', 'enter', 'exit', 'finish', 'clear', 'move'].includes(action)) setCanvasCollapsed(true);
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
    if (action === 'finish' && tutorialStep === 'finish' && workspaceView.hasPaint) { setTutorialReview(false); setTutorialStep('save'); closeMenu(); }
  };
  const sizingKey = workspaceView.selected && workspaceView.bounds ? (mapId==='map2'?'map2-v1:':'')+JSON.stringify(workspaceView.bounds) : '';
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
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const menuBlocking = newMapPrompt || multiplayerConsentOpen || (!!activeMenu && !sheetCollapsed);
  const [movement, setMovement] = useState<MovementInput>({ x: 0, y: 0 });
  const [lookInput, setLookInput] = useState<MovementInput>({ x: 0, y: 0 });
  const [jumpSignal, setJumpSignal] = useState(0);
  const [viewMode, setViewMode] = useState<CameraMode>('third');
  const [mapZoom, setMapZoom] = useState(1);
  const [botsEnabled, setBotsEnabled] = useState(false);
  const [nearbyBotIndex, setNearbyBotIndex] = useState<number | null>(null);
  const poster = usePosterPlacement();
  const [layers, setLayers] = useState<PaintLayerState[]>(Array.from({ length: MAX_LAYERS }, (_, index) => ({ name: `Layer ${index + 1}`, visible: true })));
  const [selectedLayer, setSelectedLayer] = useState(2);
  const [progress, setProgress] = useState<GameProgress>(loadGameProgress);
  const [emoteSignal, setEmoteSignal] = useState<EmoteSignal | null>(null);
  const [soloHistory, setSoloHistory] = useState<PaintWorkspaceHistory>({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, limit: 2 });
  const emoteViewReturn = useRef(new EmoteViewReturn());
  useEffect(() => () => emoteViewReturn.current.cancel(), []);
  useEffect(() => { if (viewMode !== 'third') emoteViewReturn.current.cancel(); }, [viewMode]);
  const [devViewerOpen, setDevViewerOpen] = useState(false);
  const [developerChoice, setDeveloperChoice] = useState(false);
  const [liveSettingsOpen, setLiveSettingsOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(null);
  const [tutorialReview, setTutorialReview] = useState(false);
  const [tutorialCompleted, setTutorialCompleted] = useState(readTutorialCompleted);
  const tutorialSizeStartRef = useRef<{ width: number; height: number } | null>(null);
  const tutorialMoveBoundsRef = useRef('');
  const tutorialMoveArmedRef = useRef(false);
  const tutorialSaveArmedRef = useRef(false);
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
    if (multiplayerView.selectedPieceId || multiplayerView.selectedArtworkId) setActiveMenu('art');
  }, [multiplayerView.selectedPieceId, multiplayerView.selectedArtworkId, multiplayerView.piecePickSequence]);
  useEffect(() => {
    if (multiplayerView.selectedPlayer) setActiveMenu('player');
    else setActiveMenu(current => current === 'player' ? null : current);
  }, [multiplayerView.selectedPlayer?.playerId, multiplayerView.playerPickSequence]);
  useEffect(() => {
    if (!tutorialStep) return;
    if (['move', 'look', 'select-canvas', 'size-canvas', 'move-canvas', 'start-painting', 'paint', 'finish', 'save'].includes(tutorialStep)) setActiveMenu(null);
    if (tutorialStep === 'tools') setActiveMenu('paint');
    if (tutorialStep === 'radio' || tutorialStep === 'multiplayer') setActiveMenu('settings');
    if (tutorialReview) return;
    if (tutorialStep === 'select-canvas') {
      setPaintMode(true);
      setEraseMode(false);
    }
    if (tutorialStep === 'size-canvas') {
      tutorialSizeStartRef.current = { width: workspaceView.width, height: workspaceView.height };
      setActiveMenu(null);
    }
    if (tutorialStep === 'move-canvas') {
      tutorialMoveBoundsRef.current = workspaceView.bounds ? (mapId==='map2'?'map2-v1:':'')+JSON.stringify(workspaceView.bounds) : '';
      tutorialMoveArmedRef.current = false;
      setActiveMenu(null);
    }
    if (tutorialStep === 'save') tutorialSaveArmedRef.current = !!workspaceView.editableUntil;
  }, [tutorialStep, tutorialReview]);

  useEffect(() => {
    if (!tutorialReview && tutorialStep === 'move' && Math.hypot(movement.x, movement.y) > .15) advanceTutorial('move');
  }, [tutorialStep, tutorialReview, movement.x, movement.y]);
  useEffect(() => {
    if (!tutorialReview && tutorialStep === 'look' && Math.hypot(lookInput.x, lookInput.y) > .15) advanceTutorial('look');
  }, [tutorialStep, tutorialReview, lookInput.x, lookInput.y]);
  useEffect(() => {
    if (tutorialReview || tutorialStep !== 'size-canvas' || !tutorialSizeStartRef.current) return;
    const start = tutorialSizeStartRef.current;
    if (Math.abs(workspaceView.width - start.width) > .01 || Math.abs(workspaceView.height - start.height) > .01) setTutorialStep('move-canvas');
  }, [tutorialStep, tutorialReview, workspaceView.width, workspaceView.height]);
  useEffect(() => {
    if (tutorialReview || tutorialStep !== 'move-canvas') return;
    if (workspaceView.moving) tutorialMoveArmedRef.current = true;
    const bounds = workspaceView.bounds ? (mapId==='map2'?'map2-v1:':'')+JSON.stringify(workspaceView.bounds) : '';
    if (tutorialMoveArmedRef.current && bounds && bounds !== tutorialMoveBoundsRef.current && !workspaceView.moving) setTutorialStep('start-painting');
  }, [tutorialStep, tutorialReview, workspaceView.moving, workspaceView.bounds]);
  useEffect(() => {
    if (!tutorialStep || tutorialReview) return;
    if (tutorialStep === 'save' && workspaceView.editableUntil) tutorialSaveArmedRef.current = true;
    const next = tutorialObservedStep(tutorialStep, workspaceView, { saveArmed: tutorialSaveArmedRef.current });
    if (next !== tutorialStep) setTutorialStep(next);
  }, [tutorialStep, tutorialReview, workspaceView.selected, workspaceView.started, workspaceView.hasPaint, workspaceView.editableUntil]);
  useEffect(() => {
    if (!tutorialReview && tutorialStep === 'multiplayer' && multiplayerStatus.phase === 'connected') setTutorialStep('multiplayer-info');
  }, [tutorialStep, tutorialReview, multiplayerStatus.phase]);

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
    setReference(current => current?.moving ? { ...current, moving: false } : current);
    setTutorialReview(false);
    setHasJoined(true);
    setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 });
    setAdminPainting(false);
    if (workspaceView.selected) setPaintMode(true);
    setActiveMenu(null);
    setTutorialStep(tutorialStartStep(workspaceView));
  };
  const openTutorial = () => { setTutorialReview(false); setTutorialStep('welcome'); };
  const skipTutorial = () => {
    if (workspaceView.moving) requestWorkspace('move', 0);
    if (tutorialStep === 'multiplayer-info') finishTutorial();
    else if (tutorialStep === 'welcome') setTutorialStep(null);
    else if (tutorialStep) setTutorialStep(nextTutorialStep(tutorialStep));
  };
  const continueTutorial = () => {
    if (tutorialReview && tutorialStep) {
      setTutorialReview(false);
      if (tutorialStep === 'welcome') beginTutorial();
    } else if (tutorialStep === 'tools') {
      selectPaintTool('paint');
      if (workspaceView.started) requestWorkspace('enter');
      closeMenu(); setTutorialStep('paint');
    } else if (tutorialStep === 'paint') {
      if (activeMenu === 'paint') closeMenu(); else setActiveMenu('paint');
    } else if (tutorialStep === 'multiplayer-info') finishTutorial();
  };
  const backTutorial = () => {
    setTutorialReview(true);
    if (workspaceView.moving) requestWorkspace('move', 0);
    setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 });
    setTutorialStep(current => {
      if (!current) return current;
      const index = TUTORIAL_ORDER.indexOf(current);
      return index > 0 ? TUTORIAL_ORDER[index - 1] : current;
    });
  };
  const restartTutorial = () => {
    writeTutorialCompleted(false);
    setTutorialCompleted(false);
    setTutorialReview(false);
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
  const selectSky = (mode: SkyMode) => { saveMapSky(mapId,mode);setRenderSettings({skyMode:'game',...(mapId==='map2'&&mode==='night'?{streetLights:true}:{})});setSky(mode); closeMenu(); playChime(); };
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
    if (basketballActive) return;
    emoteViewReturn.current.cancel();
    const modes: CameraMode[] = ['first', 'third', 'map'];
    setViewMode(current => modes[(modes.indexOf(current) + 1) % modes.length]);
  };
  const playEmote = (emote: AvatarEmote) => {
    if (basketballActive) return;
    closeMenu();
    emoteViewReturn.current.choose(viewMode, setViewMode);
    setEmoteSignal(current => ({ emote, sequence: (current?.sequence ?? 0) + 1 }));
  };
  const appearance = useMemo(() => getAvatarAppearance(progress), [progress]);
  const pickColour = (next: string | null) => {
    if (!next) { setEyedropperNotice('No readable paint here. Tap a painted spot.'); return; }
    selectColor(next); setEyedropperActive(false); setEyedropperNotice('');
  };
  const cosmetics = useMemo(() => ({ outfit: progress.outfit, top: progress.top, bottom: progress.bottom, accessory: progress.accessory, characterModel: characterPreference.model }), [progress.outfit, progress.top, progress.bottom, progress.accessory, characterPreference.model]);
  const layerVisibility = useMemo(() => layers.map(layer => layer.visible), [layers]);
  const jumpLabel = progress.outfit === 'jax' ? 'FLY' : progress.outfit === 'ringmaster' ? 'LEVITATE'
    : progress.outfit === 'pomni' ? 'HIGH JUMP' : 'JUMP';

  const workspaceHud = <PaintWorkspaceHud history={multiplayerStatus.phase === 'solo' ? soloHistory : multiplayerView.strokeHistory ?? undefined} collapsed={canvasCollapsed} onCollapsedChange={setCanvasCollapsed} onReference={() => { setCanvasCollapsed(true); toggleMenu('reference'); }} view={workspaceView} painting={paintMode && !adminFreePaint} onAction={requestWorkspace}
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

  const changeMap=(next:MapId)=>{
    if(next===mapId){closeMenu();if(next==='original')setNewMapPrompt(true);return;}
    setBasketballActive(false);
    setMovement({x:0,y:0});setLookInput({x:0,y:0});setPaintMode(false);setEyedropperActive(false);setReference(null);poster.cancel();setWorkspaceRequest(null);setMultiplayerRequest(null);setEmoteSignal(null);setViewMode('third');
    setWorkspaceView({selected:false,active:false,width:0,height:0,zoom:1,sizeLinked:true,started:false,moving:false,hasPaint:false});
    setMultiplayerStatus({phase:'solo',playerCount:0});setMultiplayerView({chat:[],revision:0,accountFeaturesAvailable:false,worldItemCount:0});
    selectMap(next);setMapId(next);setSky(readMapSky(next));closeMenu();
  };
  return (
    <SheetCollapseContext.Provider value={setSheetCollapsed}><main
      ref={shellRef}
      className={`game-shell ${basketballActive ? 'basketball-active' : ''} ${portrait ? 'game-portrait' : ''} ${workspaceView.active ? 'canvas-mode' : ''} ${tutorialStep ? 'has-tutorial' : ''} ${reference?.moving ? 'has-reference-adjust' : ''} ${sheetCollapsed && activeMenu ? 'has-collapsed-sheet' : ''}`}
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
          <WorldScene key={mapId} mapId={mapId}
            paused={menuBlocking || developerChoice || devViewerOpen || liveSettingsOpen}
            onCharacterModelState={setCharacterState}
            onCharacterPortal={() => { setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 }); setViewMode('third'); setSheetCollapsed(false); setActiveMenu('avatar'); }}
            onMultiplayerPortal={() => { setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 }); if (aippyUser.isLoading) { setSheetCollapsed(false); setActiveMenu('settings'); } else requestMultiplayer('join'); }}
            onBasketballActiveChange={active => { if (active) emoteViewReturn.current.cancel(); setBasketballActive(active); }} onBasketballScore={() => playBasketSwish(radioVolume)}
            onSoloHistoryChange={setSoloHistory}
            reference={reference} onReferenceMove={(x, y) => setReference(current => current ? { ...current, x, y } : null)}
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
            characterState={characterState} onCharacterPreview={() => setViewMode('third')}
            eyedropperActive={eyedropperActive} onEyedropper={() => { setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 }); setEyedropperNotice('Tap existing paint to pick its colour.'); setEyedropperActive(true); }}
            brushHead={brushHead} onBrushHeadChange={setBrushHead}
            menuCollapsed={sheetCollapsed} hideTouchControls={basketballActive || workspaceView.active || menuBlocking || eyedropperActive || !!reference?.moving}
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
            onToolChange={selectPaintTool} onColorChange={selectColor} onColorPreview={setColor}
            onBrushSizeChange={updateBrushSize} onOpacityChange={setOpacity}
            onLayerSelect={setSelectedLayer} onLayerToggle={toggleLayer} onLayerAdd={addLayer}
            onViewChange={changeView} onMapZoomChange={setMapZoom}
            onPurchase={purchaseItem} onEquip={equipItem} onEmote={playEmote}
            onMovement={setMovement} onJump={() => setJumpSignal(signal => signal + 1)}
            onBotsToggle={() => setBotsEnabled(enabled => !enabled)}

            topControls={<>
              <div className="top-network-controls">
                {multiplayerStatus.phase !== 'solo' ? <CanvasCredits online={multiplayerStatus.phase === 'connected'} balance={multiplayerView.protection?.creditBalance ?? null} /> : <span className="canvas-credit-status" aria-label="Solo coins">🪙 {progress.coins}</span>}
                {<GraffitiPieces open={activeMenu === 'art'} onOpenChange={open => setActiveMenu(open ? 'art' : null)} canPaintOver={!!multiplayerStatus.canAdminPaint} paintColour={color} onPaintOver={(pieceId, colour) => { if (!multiplayerStatus.canAdminPaint) return false; requestMultiplayer('paint-over', pieceId, undefined, colour); return true; }} artworks={multiplayerView.artworks ?? []} selectedArtworkId={multiplayerView.selectedArtworkId} onViewArtwork={id => requestMultiplayer('inspect-artwork', id)} onDeleteArtwork={id => { if (multiplayerStatus.phase !== 'connected' || !multiplayerStatus.canDeletePieces) return false; requestMultiplayer('delete-artwork', id); return true; }} onCreatorSelect={creator => requestMultiplayer('creator-select', undefined, undefined, undefined, undefined, creator)} selectedPieceId={multiplayerView.selectedPieceId} piecePickSequence={multiplayerView.piecePickSequence} pieces={multiplayerView.pieces ?? []} connected={multiplayerStatus.phase === 'connected'} role={multiplayerStatus.role} canDeletePieces={multiplayerStatus.canDeletePieces} onDelete={pieceId => { if (multiplayerStatus.phase !== 'connected' || !multiplayerStatus.canDeletePieces) return false; requestMultiplayer('delete-piece', pieceId); return true; }} onLike={pieceId => { if (multiplayerStatus.phase !== 'connected') return false; requestMultiplayer('like', pieceId); return true; }} onResync={() => requestMultiplayer('resync')} onView={pieceId => requestMultiplayer('inspect', pieceId)} />}
                {!canJoinMultiplayer(mapId)?<span className="connection-pill phase-solo" aria-label="Original world local only"><i/>ORIGINAL · LOCAL</span>:<MultiplayerControls chatMute={multiplayerView.chatMute} chatOpen={activeMenu === 'chat'} onChatToggle={() => toggleMenu('chat')} onChatClose={closeMenu} onOpenMenu={() => toggleMenu('settings')} onPlayers={() => toggleMenu('players')} onPlayerSelect={id => requestMultiplayer('select-player', id)} status={multiplayerStatus} displayName={displayName} avatar={aippyUser.avatar} profileLoading={aippyUser.isLoading}
                  onJoin={() => requestMultiplayer('join')} onLeave={() => requestMultiplayer('leave')}
                  messages={multiplayerView.chat} onChat={text => requestMultiplayer('chat', text)} onResync={() => requestMultiplayer('resync')} />}
              </div>
            </>}
          />
          {!basketballActive && !menuBlocking && !reference?.moving && <LookJoystick onLook={setLookInput} canvasMode={workspaceView.active} />}
          <div hidden={basketballActive || menuBlocking || !!reference?.moving}>{workspaceHud}</div>
          {workspaceView.selected && !menuBlocking && reference && (reference.moving || canvasCollapsed) && <ReferenceControls guide={reference} onChange={setReference} onOpen={() => toggleMenu('reference')} />}
          {activeMenu === 'players' && <PlayersSheet players={multiplayerView.onlinePlayers ?? []} ownPlayerId={multiplayerView.ownPlayerId} onSelect={id => requestMultiplayer('select-player', id)} onChat={() => toggleMenu('chat')} onClose={closeMenu} />}
          {activeMenu === 'reference' && <ReferenceSheet selected={workspaceView.selected} guide={reference} onChange={setReference} onClose={closeMenu}
            ownerReferences={multiplayerView.ownerReferences ?? []} canKeepReference={!!multiplayerView.canKeepReference}
            ownerReferenceBusy={multiplayerView.ownerReferenceBusy} ownerReferenceNotice={multiplayerView.ownerReferenceNotice}
            onKeepReference={multiplayerView.canKeepReference ? () => requestMultiplayer('keep-reference') : undefined}
            onDeleteOwnerReference={multiplayerView.canKeepReference ? id => requestMultiplayer('delete-reference', id) : undefined} />}
          {eyedropperActive && <aside className="eyedropper-hint" role="status"><span>{eyedropperNotice}</span><button type="button" onClick={() => setEyedropperActive(false)}>CANCEL</button></aside>}
          <div hidden={activeMenu === 'paint'}>
          <PlayerInteractionCard canRemoveAllArt={!!multiplayerStatus.canRemoveAllArt} artRemoval={multiplayerView.artRemoval} isSelf={multiplayerView.selectedPlayer?.playerId === multiplayerView.ownPlayerId} onPlayers={() => toggleMenu('players')} onChat={() => toggleMenu('chat')} open={activeMenu === 'player'} onClose={closeMenu} adminResult={multiplayerView.adminResult} onAdminAction={(action, targetUsername, options) => {
            if (multiplayerStatus.phase !== 'connected' || !['admin', 'owner'].includes(multiplayerStatus.role ?? '') || (action === 'give-credits' && multiplayerStatus.role !== 'owner') || (action === 'remove-all-art' && !multiplayerStatus.canRemoveAllArt)) return false;
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
              onUnlock={() => { closeMenu(); setDeveloperChoice(true); }}
              radioVolume={radioVolume} onRadioVolume={volume => radioController?.setVolume(volume)}
            >
              <div className="menu-profile">{aippyUser.avatar && <img src={aippyUser.avatar} alt="" referrerPolicy="no-referrer" />}<div><strong>{displayName}</strong><small>GraffCiti · Client {CLIENT_VERSION}</small></div></div>
              <section className="tool-section"><h3>PLAY</h3><div className="menu-grid">
                <button type="button" onClick={() => toggleMenu('avatar')}>PROFILE &amp; CLOSET</button>
                <button type="button" onClick={() => toggleMenu('art')}>NEARBY ART</button>
                <button type="button" onClick={() => { closeMenu(); openTutorial(); }}>{tutorialCompleted ? 'REPLAY TUTORIAL' : 'TUTORIAL'}</button>
                <button type="button" onClick={changeView}>{CAMERA_LABELS[viewMode]}</button>
                <button type="button" onClick={() => toggleMenu('sky')}>CHANGE SKY</button>
                <button type="button" aria-pressed={mapId==='map2'} onClick={()=>changeMap('map2')}>TOWN · MAIN WORLD</button>
                <button type="button" aria-pressed={mapId==='original'} onClick={()=>changeMap('original')}>ORIGINAL · LOCAL ONLY</button>
                <button type="button" aria-pressed={portrait} onClick={() => { setMovement({ x: 0, y: 0 }); setLookInput({ x: 0, y: 0 }); setPortrait(value => !value); closeMenu(); }}>{rotatedPortrait ? 'ROTATE TO LANDSCAPE' : 'ROTATE TO PORTRAIT'}</button>
                {multiplayerStatus.canAdminPaint && <button type="button" aria-pressed={adminFreePaint} onClick={() => selectPaintTool(adminFreePaint ? 'off' : 'admin')}>ADMIN PAINT</button>}
              </div></section>
              {canJoinMultiplayer(mapId)&&<section className="tool-section"><h3>MULTIPLAYER</h3><div className="button-row">
                {multiplayerStatus.phase === 'solo' || multiplayerStatus.phase === 'disconnected' ? <button type="button" data-tutorial="multiplayer-join" disabled={aippyUser.isLoading} onClick={() => requestMultiplayer('join')}>{multiplayerStatus.phase === 'solo' ? 'JOIN MULTIPLAYER' : 'RECONNECT'}</button> : <button type="button" onClick={() => requestMultiplayer('leave')}>{multiplayerStatus.phase === 'connecting' ? 'CANCEL JOINING' : 'PLAY SOLO'}</button>}
                <button type="button" onClick={() => toggleMenu('chat')}>ROOM CHAT</button>
                {multiplayerStatus.phase === 'connected' && <button type="button" onClick={() => toggleMenu('players')}>ONLINE PLAYERS</button>}
              </div>{multiplayerStatus.notice && <p className="ui-notice" role="status">{multiplayerStatus.notice}</p>}</section>}
              <section className="tool-section"><h3>RADIO</h3>{radioController && <RadioControl controller={radioController} url={RADIO_STREAM_URL} initialVolume={musicVolume} onInteraction={() => { if (!tutorialReview && tutorialStep === 'radio') setTutorialStep('multiplayer'); }} />}</section>
            </SettingsModal>
          )}
          {multiplayerConsentOpen && createPortal(
            <div role="presentation" style={{position:'fixed',inset:0,zIndex:2147483647,background:'rgba(0,0,0,.78)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
              <section role="dialog" aria-modal="true" aria-labelledby="multiplayer-consent-heading" style={{width:'min(400px,100%)',maxHeight:'100%',overflowY:'auto',background:'#20251f',color:'#f5f2e6',padding:20,border:'1px solid #899184',borderRadius:12,boxShadow:'0 12px 36px #000a',textAlign:'center'}}>
                <h2 id="multiplayer-consent-heading" style={{fontSize:18,fontWeight:900,margin:'0 0 14px'}}>MULTIPLAYER NOTICE</h2>
                <p style={{fontSize:14,lineHeight:1.5,margin:'0 0 14px'}}>Multiplayer includes real players and user-created graffiti. We moderate content, but some artwork or conversations may be inappropriate or offensive.</p>
                <p style={{fontSize:14,fontWeight:800,margin:'0 0 18px'}}>All content is flagged to the creator for moderation. Explicit images and swearing are not allowed. Violations may result in a ban. I understand that multiplayer content may not be suitable for all ages.</p>
                <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap'}}>
                  <button type="button" onClick={()=>setMultiplayerConsentOpen(false)} style={{flex:'1 1 110px',minHeight:46,borderRadius:8,border:'1px solid #737a71',background:'#333b33',color:'#fff'}}>GO BACK</button>
                  <button type="button" onClick={()=>{setMultiplayerConsentOpen(false);confirmedMultiplayerJoin.current=true;requestMultiplayer('join');}} style={{flex:'1 1 110px',minHeight:46,borderRadius:8,border:'1px solid #deb66f',background:'#b5853d',color:'#141611',fontWeight:900}}>I UNDERSTAND · CONTINUE</button>
                </div>
              </section>
            </div>, document.body
          )}
          {developerChoice && <GameSheet title="DEVELOPER TOOLS" onClose={() => setDeveloperChoice(false)}><div className="menu-grid"><button onClick={() => { setDeveloperChoice(false); setDevViewerOpen(true); }}>PROJECT FILE VIEWER</button><button onClick={() => { setDeveloperChoice(false); setLiveSettingsOpen(true); }}>LIVE GAME SETTINGS</button></div></GameSheet>}
          {liveSettingsOpen && <DeveloperPanel onClose={() => setLiveSettingsOpen(false)} onFiles={() => { setLiveSettingsOpen(false); setDevViewerOpen(true); }} onMorningPreset={()=>{setSky('pastel');saveMapSky(mapId,'pastel');setRenderSettings({...MORNING_PRESET});}} />}
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
      {newMapPrompt && <GameSheet title="New map available." onClose={() => setNewMapPrompt(false)}>
        <p>Join now.</p>
        <div className="button-row">
          <button type="button" className="ui-primary" onClick={() => { setNewMapPrompt(false); changeMap('map2'); }}>Yes</button>
          <button type="button" onClick={() => setNewMapPrompt(false)}>No</button>
        </div>
      </GameSheet>}
      {tutorialStep && !newMapPrompt && <TutorialOverlay
        step={tutorialStep}
        menu={activeMenu}
        reviewing={tutorialReview}
        multiplayerPhase={multiplayerStatus.phase}
        notice={multiplayerStatus.notice}
        onStart={beginTutorial}
        onBack={backTutorial}
        onSkip={skipTutorial}
        onContinue={continueTutorial}
        onRestart={restartTutorial}
        onClose={() => setTutorialStep(null)}
        onExit={() => setTutorialStep(null)}
      />}
    </main></SheetCollapseContext.Provider>
  );
};

export default App;
