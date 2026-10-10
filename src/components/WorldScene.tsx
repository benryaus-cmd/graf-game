import { canJoinMultiplayer, type MapId } from '@/game/mapPreference';
import { MAIN_ROOM_ID, MAIN_WORLD_ID } from '@/multiplayer/config';
import { getRenderSettings, subscribeRenderSettings } from '@/game/renderSettings';
import { observeWorldPerformance } from '@/game/worldPerformance';
import { performanceLog } from '@/game/performanceLog';
import { useEffect, useRef, useState } from 'react';
import { BasketballGame, type BasketballView } from '@/game/basketballGame';
import { BasketballSync, type BasketballSyncView } from '@/multiplayer/basketballSync';
import { BasketballControls } from '@/components/BasketballControls';
import './basketball.css';
import * as THREE from 'three';
import { createWorld } from '@/game/createWorld';
import { disposeWorld } from '@/game/disposeWorld';
import { attachWorldControls } from '@/game/worldControls';
import { applySkyLighting } from '@/game/skyEffects';
import { jumpWorld } from '@/game/worldMovement';
import {
  disposePosterPlacementSession, type PosterPlacementSession,
} from '@/game/posterPlacement';
import { loadPosterImage } from '@/game/worldSceneRequests';
import type { PosterPlacementRequest } from '@/game/usePosterPlacement';
import { applyAvatarAppearance, triggerAvatarEmote } from '@/game/playerAvatarAppearance';
import type { AvatarAppearance } from '@/game/progression';
import type { AvatarEmote, CameraMode, LiveSettings, MovementInput, SkyMode, WorldEngine } from '@/game/worldTypes';
import { enterPaintWorkspace, exitPaintWorkspace, clearPaintWorkspace, setPaintWorkspaceSize, setPaintWorkspaceZoom, setPaintWorkspaceLinked, setPaintWorkspaceMoving } from '@/game/paintWorkspace';
import type { PaintWorkspaceView, PaintWorkspaceAction } from '@/components/PaintWorkspaceHud';
import { WorldMultiplayerSession } from '@/multiplayer/worldSession';
import type { MultiplayerStatus, MultiplayerView, PlayerCosmetics } from '@/multiplayer/protocol';
import type { ServerRole } from '@/multiplayer/permissions';
import type { BrushHead } from '@/game/sprayHeads';
import { workspaceWorldBounds } from '@/game/paintWorkspaceFeedback';
import type { AdminAction, AdminActionOptions } from '@/multiplayer/adminActions';
import { ReferenceGuide, type ReferenceSettings } from '@/game/referenceGuide';
import { PieceEditGrace } from '@/game/pieceEditGrace';
import { AssetPreview, type CharacterModelState } from '@/game/assetPreview';
import { CourtyardPortals, BASKETBALL_PORTAL_LANDING, BASKETBALL_PORTAL_YAW } from '@/game/courtyardPortals';
import { useAssetPreviewPreference } from '@/game/assetPreviewPreference';
import { EraserGuide } from '@/game/eraserGuide';
import { SoloPaintHistory } from '@/game/soloPaintHistory';
import { paintRadius } from '@/game/worldPainting';
import type { PaintWorkspaceHistory } from '@/components/PaintWorkspaceHud';

export interface MultiplayerRequest { action: 'join' | 'leave' | 'chat' | 'resync' | 'like' | 'inspect' | 'delete-piece' | 'set-role' | 'paint-over' | 'quote-protection' | 'buy-protection' | 'admin-action' | 'select-player' | 'keep-reference' | 'delete-reference' | 'creator-select' | 'inspect-artwork' | 'delete-artwork'; creator?: { playerId?: string; username: string; nickName: string }; text?: string; role?: ServerRole; colour?: string; protectionEnabled?: boolean; adminAction?: AdminAction; options?: AdminActionOptions; sequence: number }

interface WorldSceneProps {
  mapId:MapId;
  paused?: boolean;
  onCharacterPortal?: () => void;
  onMultiplayerPortal?: () => void;
  onZombiesPortal?: () => void;
  onCharacterModelState?: (state: CharacterModelState) => void;
  onBasketballActiveChange?: (active: boolean) => void;
  onBasketballScore?: () => void;
  onSoloHistoryChange?: (history: PaintWorkspaceHistory) => void;
  reference?: ReferenceSettings | null;
  onReferenceMove?: (x: number, y: number) => void;
  adminFreePaint?: boolean;
  brushHead: BrushHead;
  workspaceRequest: { action: PaintWorkspaceAction; size?: number; height?: number; title?: string; protectionEnabled?: boolean; sequence: number } | null;
  onWorkspaceChange: (view: PaintWorkspaceView) => void;
  eyedropperActive: boolean;
  onColorPick: (colour: string | null) => void;
  multiplayerRequest: MultiplayerRequest | null;
  displayName: string; username: string; nickName: string; onMultiplayerStatus: (status: MultiplayerStatus) => void;
  cosmetics: PlayerCosmetics; onMultiplayerView: (view: MultiplayerView) => void;
  sky: SkyMode; paintMode: boolean; eraseMode: boolean; color: string;
  movement: MovementInput; lookInput: MovementInput; brushSize: number; opacity: number;
  moveSpeed: number; jumpPower: number; lookSensitivity: number; fogDensity: number;
  jumpSignal: number; layerIndex: number; layerVisibility: boolean[];
  viewMode: CameraMode; mapZoom: number; botsEnabled: boolean;
  avatar: AvatarAppearance; emoteSignal: { emote: AvatarEmote; sequence: number } | null;
  posterPlacement: PosterPlacementRequest | null; posterSize: number; posterCommitSignal: number;
  onPosterValidity: (valid: boolean) => void; onPosterPlaced: (sequence: number, placed: boolean) => void;
  onNearbyBot: (index: number | null) => void; onSpray: () => void; onPaint: () => void;
}

const WorldScene = (props: WorldSceneProps) => {
  const [basketballView, setBasketballView] = useState<BasketballView | null>(null);
  const basketballRef = useRef<BasketballGame | null>(null);
  const courtRef = useRef<BasketballSync | null>(null);
  const [courtView, setCourtView] = useState<BasketballSyncView | null>(null);
  const [courtPlayerNames, setCourtPlayerNames] = useState<Record<string, string>>({});
  const leaveBasketball = () => {
    courtRef.current?.leave();
    basketballRef.current?.leave();
  };
  const basketballCallbacks = useRef({active: props.onBasketballActiveChange, score: props.onBasketballScore});
  basketballCallbacks.current = {active: props.onBasketballActiveChange, score: props.onBasketballScore};
  const previewPreference = useAssetPreviewPreference();
  const assetPreviewRef = useRef<AssetPreview | null>(null);
  const portalProps = useRef(props);
  portalProps.current = props;
  const eraserGuideRef = useRef<EraserGuide | null>(null);
  const soloHistoryRef = useRef<SoloPaintHistory | null>(null);
  const soloHistoryCallbackRef = useRef(props.onSoloHistoryChange);
  soloHistoryCallbackRef.current = props.onSoloHistoryChange;
  const workspaceCallbackRef = useRef(props.onWorkspaceChange);
  workspaceCallbackRef.current = props.onWorkspaceChange;
  const colorPickCallbackRef = useRef(props.onColorPick);
  colorPickCallbackRef.current = props.onColorPick;
  const referenceRef = useRef<ReferenceGuide | null>(null);
  const dragRef = useRef<{ id: number; start: THREE.Vector2; x: number; y: number } | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldEngine | null>(null);
  const multiplayerRef = useRef<WorldMultiplayerSession | null>(null);
  const multiplayerStatusRef = useRef(props.onMultiplayerStatus);
  const multiplayerViewRef = useRef(props.onMultiplayerView);
  const posterRef = useRef<PosterPlacementSession | null>(null);
  const posterSizeRef = useRef(props.posterSize);
  const posterCommitRef = useRef(props.posterCommitSignal);
  const sprayRef = useRef(props.onSpray);
  const paintRef = useRef(props.onPaint);
  const nearbyBotRef = useRef(props.onNearbyBot);
  const posterValidityRef = useRef(props.onPosterValidity);
  const posterPlacedRef = useRef(props.onPosterPlaced);
  const liveRef = useRef<LiveSettings>({
    paused: props.paused,
    adminFreePaint: props.adminFreePaint,
    brushHead: props.brushHead,
    eyedropperActive: props.eyedropperActive,
    paintMode: props.paintMode, eraseMode: props.eraseMode, color: props.color,
    opacity: props.eraseMode ? 1 : props.opacity, movement: props.movement, lookInput: props.lookInput, brushSize: props.brushSize,
    moveSpeed: props.moveSpeed, jumpPower: props.jumpPower,
    lookSensitivity: props.lookSensitivity, fogDensity: props.fogDensity,
    layerIndex: props.layerIndex, layerVisibility: props.layerVisibility,
  });

  useEffect(() => {
    multiplayerStatusRef.current = props.onMultiplayerStatus;
    multiplayerViewRef.current = props.onMultiplayerView;
    liveRef.current = {
      paused: props.paused,
      adminFreePaint: props.adminFreePaint,
      brushHead: props.brushHead,
      eyedropperActive: props.eyedropperActive,
      paintMode: props.paintMode, eraseMode: props.eraseMode, color: props.color,
      opacity: props.eraseMode ? 1 : props.opacity, movement: props.movement, lookInput: props.lookInput, brushSize: props.brushSize,
      moveSpeed: props.moveSpeed, jumpPower: props.jumpPower,
      lookSensitivity: props.lookSensitivity, fogDensity: props.fogDensity,
      layerIndex: props.layerIndex, layerVisibility: props.layerVisibility,
    };
    sprayRef.current = props.onSpray;
    paintRef.current = props.onPaint;
    nearbyBotRef.current = props.onNearbyBot;
    posterValidityRef.current = props.onPosterValidity;
    posterPlacedRef.current = props.onPosterPlaced;
    posterSizeRef.current = props.posterSize;
    posterCommitRef.current = props.posterCommitSignal;
    if (posterRef.current) {
      posterRef.current.size = props.posterSize;
      posterRef.current.commitSignal = props.posterCommitSignal;
    }
  }, [props]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    const world = createWorld(container, liveRef.current.fogDensity,props.mapId);
    worldRef.current = world;
    const stopPerformance = observeWorldPerformance(world);
    const applyRenderSettings = () => {
      const settings = getRenderSettings();
      performanceLog.settingsChanged(settings);
      performanceLog.measure('settings.apply',()=>{
        const ratio=Math.min(window.devicePixelRatio,settings.renderScale);
        if(world.renderer.getPixelRatio()!==ratio){world.renderer.setPixelRatio(ratio);world.renderer.setSize(container.clientWidth,container.clientHeight);}
        world.renderer.toneMappingExposure=settings.exposure;
        applySkyLighting(world,world.scene.userData.gameSkyMode??props.sky);
        world.updateChunks(world.playerPosition.x,world.playerPosition.z);
      });
    };
    applyRenderSettings();
    const stopRenderSettings = subscribeRenderSettings(applyRenderSettings);
    const assetPreview = new AssetPreview(world.scene, world.playerAvatar);
    assetPreview.onModelState = state => portalProps.current.onCharacterModelState?.(state);
    assetPreviewRef.current = assetPreview;
    const eraserGuide = new EraserGuide(world.scene, world.renderer.domElement);
    eraserGuideRef.current = eraserGuide;
    const soloHistory = new SoloPaintHistory(world, view => soloHistoryCallbackRef.current?.(view));
    soloHistoryRef.current = soloHistory;
    const guide = new ReferenceGuide(world);
    referenceRef.current = guide;
    world.onPaintWorkspaceChange = workspace => {
      soloHistory.syncSelection();
      multiplayerRef.current?.workspaceChanged();
      guide.refresh();
      const selection = workspace?.selection;
      let bounds: PaintWorkspaceView['bounds'];
      if (selection) bounds = workspaceWorldBounds(selection);
      workspaceCallbackRef.current({ selected: !!selection, active: !!workspace?.active, width: selection?.width ?? 0, height: selection?.height ?? 0, zoom: workspace?.camera.zoom ?? 1, sizeLinked: selection?.sizeLinked ?? true, started: !!selection?.started, moving: !!selection?.moving, hasPaint: !!selection?.hasPaint, editableUntil: workspace?.editableUntil, bounds });
    };
    world.onColorPick = colour => colorPickCallbackRef.current(colour);
    let connectionPhase: MultiplayerStatus['phase'] = 'solo';
    const multiplayer = new WorldMultiplayerSession(world, status => { connectionPhase = status.phase; soloHistory.setAllowed(status.phase === 'solo'); multiplayerStatusRef.current(status); }, view => {
      setCourtPlayerNames(Object.fromEntries((view.onlinePlayers ?? []).map(player => [player.playerId, player.nickName.trim() || (player.username ? '@' + player.username : 'Player')])));
      multiplayerViewRef.current(view);
    });
    multiplayerRef.current = multiplayer;
    const paintSample = world.onPaintSample, paintEnd = world.onPaintEnd;
    world.onBeforePaintSample = (wall, hit, settings) => soloHistory.begin(wall, hit, settings);
    world.onPaintSample = (wall, hit, settings, continues) => {
      if (settings.eraseMode) eraserGuide.show(hit, paintRadius(settings.brushSize));
      soloHistory.changed(); paintSample?.(wall, hit, settings, continues);
    };
    world.onPaintEnd = () => { soloHistory.end(); paintEnd?.(); };
    world.setPaintVisibility(liveRef.current.layerVisibility);
    const stopControls = attachWorldControls(
      world, liveRef, () => sprayRef.current(), () => paintRef.current(), posterRef,
      valid => posterValidityRef.current(valid), (sequence, placed) => posterPlacedRef.current(sequence, placed),
    );
    const basketball = props.mapId === 'map2' ? new BasketballGame(world, view => {
      setBasketballView(view);
      basketballCallbacks.current.active?.(view.active);
    }) : null;
    basketballRef.current = basketball;
    let stopCourt: (() => void) | undefined;
    const court = basketball ? new BasketballSync(multiplayer) : null;
    courtRef.current = court;
    if (basketball && court) {
      let seatEpoch: number | null = null;
      let wasConnected = court.state.connected;
      let wasAvailable = court.state.available;
      stopCourt = court.subscribe((view, event) => {
        setCourtView(view);
        // Changing town admission cancels solo shooting too; no automatic re-entry.
        if (view.connected !== wasConnected || view.available !== wasAvailable) {
          basketball.leave();
          wasConnected = view.connected;
          wasAvailable = view.available;
        }
        if (view.available && view.entered && view.ownSeat) {
          if (seatEpoch !== view.ownSeat.epoch) {
            basketball.leave();
            seatEpoch = view.ownSeat.epoch;
          }
          basketball.positionSharedPlayer(view.ownSeat, view.horseAvailable ? view.court?.horse ?? null : null);
          if (!view.pendingShotId) basketball.syncSharedCounters(view.ownSeat);
        } else if (seatEpoch !== null) {
          basketball.leave();
          seatEpoch = null;
        }
        if (event?.type === 'launch') {
          if (event.own && !event.reconcile && view.pendingShotId === event.launch.shotId) basketball.predictSharedShot(event.launch);
          else basketball.receiveSharedShot(event.launch, event.elapsedSeconds, event.reconcile);
        } else if (event?.type === 'result') {
          basketball.presentSharedResult(event.result, event.playerId === view.ownSeat?.playerId);
        } else if (event?.type === 'reset') basketball.rejectSharedShot(event.shotId);
      });
      setCourtView(court.state);
    }
    if (basketball) {
      basketball.onResult = result => { if (result.outcome === 'make') basketballCallbacks.current.score?.(); };
    }
    const portals = props.mapId === 'map2' ? new CourtyardPortals(world.scene, action => {
      if (action === 'characters') portalProps.current.onCharacterPortal?.();
      else if (action === 'multiplayer') portalProps.current.onMultiplayerPortal?.();
      else if (action === 'zombies') portalProps.current.onZombiesPortal?.();
      else {
        world.playerPosition.fromArray(BASKETBALL_PORTAL_LANDING);
        world.playerYaw = BASKETBALL_PORTAL_YAW;
        world.playerPitch = 0;
        world.velocityY = 0;
      }
    }) : null;
    world.onBasketballFrame = nowMs => {
      basketball?.update(nowMs);
      const p = portalProps.current;
      portals?.update(world.playerPosition, {
        enabled: !p.paused && p.viewMode !== 'map' && !p.paintMode && !p.eyedropperActive && !p.posterPlacement
          && !p.reference?.moving && !world.activityLocked && !world.paintWorkspace?.active && !world.paintWorkspace?.selection?.moving,
        solo: connectionPhase === 'solo' || connectionPhase === 'disconnected',
      });
    };
    const savePaint = () => world.savePaint();
    const saveWhenHidden = () => { if (document.visibilityState === 'hidden') savePaint(); };
    window.addEventListener('pagehide', savePaint);
    document.addEventListener('visibilitychange', saveWhenHidden);
    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      world.camera.aspect = width / height;
      world.camera.updateProjectionMatrix();
      const mapHeight = 52;
      const mapWidth = mapHeight * width / height;
      world.mapCamera.left = -mapWidth / 2;
      world.mapCamera.right = mapWidth / 2;
      world.mapCamera.top = mapHeight / 2;
      world.mapCamera.bottom = -mapHeight / 2;
      world.mapCamera.updateProjectionMatrix();
      world.renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      editGrace.current.resume();
      court?.leave();
      stopCourt?.();
      court?.dispose();
      courtRef.current = null;
      basketball?.dispose();
      basketballRef.current = null;
      portals?.dispose();
      world.onBasketballFrame = undefined;
      basketballCallbacks.current.active?.(false);
      stopControls();
      stopPerformance(); stopRenderSettings();
      multiplayer.dispose();
      if (multiplayerRef.current === multiplayer) multiplayerRef.current = null;
      window.removeEventListener('pagehide', savePaint);
      document.removeEventListener('visibilitychange', saveWhenHidden);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      if (posterRef.current) disposePosterPlacementSession(world, posterRef.current);
      posterRef.current = null;
      guide.dispose(); referenceRef.current = null;
      eraserGuide.dispose(); eraserGuideRef.current = null;
      soloHistory.reset(); soloHistoryRef.current = null; world.onBeforePaintSample = undefined;
      assetPreview.dispose(); assetPreviewRef.current = null;
      disposeWorld(world);
      if (worldRef.current === world) worldRef.current = null;
    };
  }, []);

  useEffect(() => { void assetPreviewRef.current?.configure(previewPreference); }, [previewPreference]);
  useEffect(() => { eraserGuideRef.current?.setEnabled(props.paintMode && props.eraseMode && !props.eyedropperActive); }, [props.paintMode, props.eraseMode, props.eyedropperActive]);

  const editGrace = useRef(new PieceEditGrace());

  useEffect(() => {
    const request = props.multiplayerRequest;
    if (!request) return;
    if (request.action === 'join'&&canJoinMultiplayer(props.mapId)) { leaveBasketball(); multiplayerRef.current?.join(props.displayName, MAIN_ROOM_ID, { username: props.username, nickName: props.nickName }, MAIN_WORLD_ID); }
    else if (request.action === 'leave') { leaveBasketball(); multiplayerRef.current?.leave(); }
    else if (request.action === 'chat') multiplayerRef.current?.sendChat(request.text ?? '');
    else if (request.action === 'inspect') multiplayerRef.current?.inspectPiece(request.text ?? '');
    else if (request.action === 'creator-select' && request.creator) multiplayerRef.current?.selectCreator(request.creator);
    else if (request.action === 'inspect-artwork') multiplayerRef.current?.inspectArtwork(request.text ?? '');
    else if (request.action === 'delete-artwork') multiplayerRef.current?.deleteArtwork(request.text ?? '');
    else if (request.action === 'keep-reference') {
      const draft = referenceRef.current?.capture();
      if (draft) void multiplayerRef.current?.keepReference(draft);
    }
    else if (request.action === 'delete-reference') multiplayerRef.current?.deleteReference(request.text ?? '');
    else if (request.action === 'select-player') multiplayerRef.current?.selectPlayer(request.text ?? '');
    else if (request.action === 'like') multiplayerRef.current?.likePiece(request.text ?? '');
    else if (request.action === 'delete-piece') multiplayerRef.current?.deletePiece(request.text ?? '');
    else if (request.action === 'set-role' && request.role) multiplayerRef.current?.setRole(request.text ?? '', request.role);
    else if (request.action === 'admin-action' && request.adminAction) multiplayerRef.current?.adminAction(request.adminAction, request.text ?? '', request.options ?? {});
    else if (request.action === 'quote-protection') multiplayerRef.current?.quoteProtection(request.protectionEnabled ?? false);
    else if (request.action === 'buy-protection') multiplayerRef.current?.purchaseProtection(request.protectionEnabled ?? false);
    else if (request.action === 'paint-over') multiplayerRef.current?.adminPaintOver(request.text ?? '', request.colour ?? props.color);
    else multiplayerRef.current?.resync();
  }, [props.multiplayerRequest,props.mapId]);

  useEffect(() => {
    const world = worldRef.current, request = props.workspaceRequest;
    if (!world || !request || world.activityLocked) return;
    if (request.action === 'undo') { if (!world.multiplayerActive) soloHistoryRef.current?.undo(); else multiplayerRef.current?.undoStroke(); return; }
    if (request.action === 'redo') { if (!world.multiplayerActive) soloHistoryRef.current?.redo(); else multiplayerRef.current?.redoStroke(); return; }
    editGrace.current.resume();
    world.onPaintEnd?.();
    if (request.action === 'start') {
      if (world.multiplayerActive && !world.paintWorkspace?.selection?.purchaseApproved) {
        multiplayerRef.current?.purchaseProtection(request.protectionEnabled ?? false);
        return;
      }
      if (world.paintWorkspace?.selection) { world.paintWorkspace.selection.started = true; world.paintWorkspace.selection.moving = false; }
      world.onPaintWorkspaceChange?.(world.paintWorkspace);
    }
    else if (request.action === 'enter') {
      if (world.multiplayerActive && !world.paintWorkspace?.selection?.purchaseApproved) return;
      if (world.paintWorkspace?.editableUntil) {
        multiplayerRef.current?.cancelPreparedPieceFlatten();
      }
      if (world.paintWorkspace?.selection) world.paintWorkspace.selection.started = true;
      if (world.paintWorkspace) world.paintWorkspace.editableUntil = undefined;
      if (world.paintWorkspace?.selection) world.paintWorkspace.selection.preview.visible = true;
      enterPaintWorkspace(world);
    }
    else if (request.action === 'exit') {
      if (world.paintWorkspace?.editableUntil) { multiplayerRef.current?.finalizePiece(request.title); clearPaintWorkspace(world); }
      else exitPaintWorkspace(world);
    }
    else if (request.action === 'resize') { if (!world.paintWorkspace?.selection?.purchaseApproved) setPaintWorkspaceSize(world, request.size ?? 2, request.height); }
    else if (request.action === 'zoom') setPaintWorkspaceZoom(world, request.size ?? 1);
    else if (request.action === 'fit') { world.paintWorkspace?.pan?.set(0, 0); setPaintWorkspaceZoom(world, 1); }
    else if (request.action === 'link') setPaintWorkspaceLinked(world, (request.size ?? 0) > 0);
    else if (request.action === 'move') { if (!world.paintWorkspace?.selection?.purchaseApproved) setPaintWorkspaceMoving(world, (request.size ?? 0) > 0); }
    else if (request.action === 'finish' && world.paintWorkspace?.selection?.hasPaint) {
      if (request.title) multiplayerRef.current?.setSelectedPieceTitle(request.title);
      multiplayerRef.current?.preparePieceFlatten();
      exitPaintWorkspace(world);
      const state = world.paintWorkspace;
      state.selection!.preview.visible = false;
      state.editableUntil = editGrace.current.start(() => {
        if (worldRef.current !== world || world.paintWorkspace !== state) return;
        multiplayerRef.current?.finalizePiece(request.title);
        clearPaintWorkspace(world);
      });
      world.onPaintWorkspaceChange?.(state);
    }
    else { multiplayerRef.current?.completePiece(); clearPaintWorkspace(world); }
  }, [props.workspaceRequest]);

  useEffect(() => { multiplayerRef.current?.setCosmetics(props.cosmetics); }, [props.cosmetics]);

  useEffect(() => loadPosterImage(
    props.posterPlacement, worldRef, posterRef, posterSizeRef, posterCommitRef, posterValidityRef,
  ), [props.posterPlacement?.sequence, props.posterPlacement?.dataUrl]);

  useEffect(() => {
    let previousIndex = -1;
    const timer = window.setInterval(() => {
      const world = worldRef.current;
      let nearest: number | null = null;
      let closest = 5.5;
      if (world?.botsEnabled) {
        world.bots.forEach((bot) => {
          if (!bot.group.visible) return;
          const distance = Math.hypot(bot.group.position.x - world.playerPosition.x, bot.group.position.z - world.playerPosition.z);
          if (distance < closest) { closest = distance; nearest = bot.index; }
        });
      }
      const index = nearest ?? null;
      if (index !== previousIndex) {
        previousIndex = index ?? -1;
        nearbyBotRef.current(index);
      }
    }, 300);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    if (!world || world.jumpSignal === props.jumpSignal) return;
    world.jumpSignal = props.jumpSignal;
    if (!props.paused) jumpWorld(world, props.jumpPower);
  }, [props.jumpSignal, props.jumpPower, props.paused]);

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    applySkyLighting(world, props.sky);
    if (!world.activityLocked) world.cameraMode = props.viewMode;
    if (!world.activityLocked) world.playerAvatar.visible = props.viewMode !== 'first';
    world.mapCamera.zoom = props.mapZoom;
    world.mapCamera.updateProjectionMatrix();
    world.botsEnabled = props.botsEnabled;
    world.setPaintVisibility(props.layerVisibility);
    if (world.scene.fog instanceof THREE.FogExp2) world.scene.fog.density = getRenderSettings().fogDensity;
    if (world.equippedOutfit !== props.avatar.outfit) world.abilityActive = false;
    world.equippedOutfit = props.avatar.outfit;
    applyAvatarAppearance(world.playerAvatar, props.avatar);
  }, [props.sky, props.viewMode, props.mapZoom, props.botsEnabled, props.layerVisibility, props.fogDensity, props.avatar]);

  useEffect(() => {
    const world = worldRef.current;
    if (!world || !props.emoteSignal) return;
    triggerAvatarEmote(world.playerAvatar, props.emoteSignal.emote);
    multiplayerRef.current?.emote(props.emoteSignal.emote);
  }, [props.emoteSignal]);

  useEffect(() => { referenceRef.current?.set(props.reference ?? null); }, [props.reference]);

  useEffect(() => {
    if (props.paused) worldRef.current?.cancelWorldInput?.();
    if (props.paused || props.viewMode === 'map' || props.paintMode || props.eyedropperActive || props.posterPlacement || props.reference?.moving) {
      courtRef.current?.leave();
      basketballRef.current?.leave();
    }
  }, [props.paused, props.viewMode, props.paintMode, props.eyedropperActive, props.posterPlacement, props.reference?.moving]);

  return <><div ref={mountRef} className="world-mount" />
    <BasketballControls view={basketballView} shared={courtView} playerNames={courtPlayerNames} paused={!!props.paused}
      exploring={!props.paintMode && !props.eyedropperActive && !props.posterPlacement && !props.reference?.moving && !worldRef.current?.paintWorkspace?.active}
      onEnter={() => {
        const court = courtRef.current;
        if (court?.state.connected && court.state.available) court.enter();
        else basketballRef.current?.enter();
      }}
      onLeave={leaveBasketball}
      onInviteHorse={(playerId, spotId) => courtRef.current?.inviteHorse(playerId, spotId)}
      onAcceptHorse={() => courtRef.current?.acceptHorse()}
      onSpot={id => { if (!(courtRef.current?.state.connected && courtRef.current.state.available)) basketballRef.current?.enter(id); }}
      onShoot={gesture => {
        const game = basketballRef.current, court = courtRef.current;
        if (court?.state.connected && court.state.available) {
          const input = game?.getSharedShotInput(gesture);
          if (input) court.shoot(input.gesture, input.releaseOffset);
        } else game?.shoot(gesture);
      }}
      onBallTarget={() => basketballRef.current?.getHeldBallTarget() ?? null}
      onBallMove={point => basketballRef.current?.setHeldBallScreenPosition(point)} />
    {props.reference?.moving && !basketballView?.active && <div className="reference-move-surface" aria-label="Drag to position reference image"
      onPointerDown={event => {
        if (dragRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const start = referenceRef.current?.point(event, event.currentTarget);
        if (!start || !referenceRef.current?.contains(start)) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { id: event.pointerId, start, x: props.reference!.x, y: props.reference!.y };
      }}
      onPointerMove={event => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        const point = referenceRef.current?.point(event, event.currentTarget);
        if (point) props.onReferenceMove?.(drag.x + point.x - drag.start.x, drag.y + point.y - drag.start.y);
      }}
      onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onLostPointerCapture={() => { dragRef.current = null; }} />}
  </>;
};

export default WorldScene;
