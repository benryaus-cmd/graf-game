import { useEffect, useRef } from 'react';
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
import { enterPaintWorkspace, exitPaintWorkspace, clearPaintWorkspace, setPaintWorkspaceSize, setPaintWorkspaceZoom, setPaintWorkspaceLinked } from '@/game/paintWorkspace';
import type { PaintWorkspaceView, PaintWorkspaceAction } from '@/components/PaintWorkspaceHud';
import { WorldMultiplayerSession } from '@/multiplayer/worldSession';
import type { MultiplayerStatus, MultiplayerView, PlayerCosmetics } from '@/multiplayer/protocol';
import type { ServerRole } from '@/multiplayer/permissions';
import type { BrushHead } from '@/game/sprayHeads';
import { PieceEditGrace } from '@/game/pieceEditGrace';

interface WorldSceneProps {
  brushHead: BrushHead;
  workspaceRequest: { action: PaintWorkspaceAction; size?: number; height?: number; sequence: number } | null;
  onWorkspaceChange: (view: PaintWorkspaceView) => void;
  eyedropperActive: boolean;
  onColorPick: (colour: string | null) => void;
  multiplayerRequest: { action: 'join' | 'leave' | 'chat' | 'resync' | 'like' | 'inspect' | 'delete-piece' | 'set-role'; text?: string; role?: ServerRole; sequence: number } | null;
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
  const workspaceCallbackRef = useRef(props.onWorkspaceChange);
  workspaceCallbackRef.current = props.onWorkspaceChange;
  const colorPickCallbackRef = useRef(props.onColorPick);
  colorPickCallbackRef.current = props.onColorPick;
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
    brushHead: props.brushHead,
    eyedropperActive: props.eyedropperActive,
    paintMode: props.paintMode, eraseMode: props.eraseMode, color: props.color,
    opacity: props.opacity, movement: props.movement, lookInput: props.lookInput, brushSize: props.brushSize,
    moveSpeed: props.moveSpeed, jumpPower: props.jumpPower,
    lookSensitivity: props.lookSensitivity, fogDensity: props.fogDensity,
    layerIndex: props.layerIndex, layerVisibility: props.layerVisibility,
  });

  useEffect(() => {
    multiplayerStatusRef.current = props.onMultiplayerStatus;
    multiplayerViewRef.current = props.onMultiplayerView;
    liveRef.current = {
      brushHead: props.brushHead,
      eyedropperActive: props.eyedropperActive,
      paintMode: props.paintMode, eraseMode: props.eraseMode, color: props.color,
      opacity: props.opacity, movement: props.movement, lookInput: props.lookInput, brushSize: props.brushSize,
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
    const world = createWorld(container, liveRef.current.fogDensity);
    worldRef.current = world;
    world.onPaintWorkspaceChange = workspace => workspaceCallbackRef.current({ selected: !!workspace?.selection, active: !!workspace?.active, width: workspace?.selection?.width ?? 0, height: workspace?.selection?.height ?? 0, zoom: workspace?.camera.zoom ?? 1, sizeLinked: workspace?.selection?.sizeLinked ?? true, hasPaint: !!workspace?.selection?.hasPaint, editableUntil: workspace?.editableUntil });
    world.onColorPick = colour => colorPickCallbackRef.current(colour);
    const multiplayer = new WorldMultiplayerSession(world, status => multiplayerStatusRef.current(status), view => multiplayerViewRef.current(view));
    multiplayerRef.current = multiplayer;
    world.setPaintVisibility(liveRef.current.layerVisibility);
    const stopControls = attachWorldControls(
      world, liveRef, () => sprayRef.current(), () => paintRef.current(), posterRef,
      valid => posterValidityRef.current(valid), (sequence, placed) => posterPlacedRef.current(sequence, placed),
    );
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
      stopControls();
      multiplayer.dispose();
      if (multiplayerRef.current === multiplayer) multiplayerRef.current = null;
      window.removeEventListener('pagehide', savePaint);
      document.removeEventListener('visibilitychange', saveWhenHidden);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      if (posterRef.current) disposePosterPlacementSession(world, posterRef.current);
      posterRef.current = null;
      disposeWorld(world);
      if (worldRef.current === world) worldRef.current = null;
    };
  }, []);

  const editGrace = useRef(new PieceEditGrace());

  useEffect(() => {
    const request = props.multiplayerRequest;
    if (!request) return;
    if (request.action === 'join') multiplayerRef.current?.join(props.displayName, undefined, { username: props.username, nickName: props.nickName });
    else if (request.action === 'leave') multiplayerRef.current?.leave();
    else if (request.action === 'chat') multiplayerRef.current?.sendChat(request.text ?? '');
    else if (request.action === 'inspect') multiplayerRef.current?.inspectPiece(request.text ?? '');
    else if (request.action === 'like') multiplayerRef.current?.likePiece(request.text ?? '');
    else if (request.action === 'delete-piece') multiplayerRef.current?.deletePiece(request.text ?? '');
    else if (request.action === 'set-role' && request.role) multiplayerRef.current?.setRole(request.text ?? '', request.role);
    else multiplayerRef.current?.resync();
  }, [props.multiplayerRequest]);

  useEffect(() => {
    const world = worldRef.current, request = props.workspaceRequest;
    if (!world || !request) return;
    editGrace.current.resume();
    world.onPaintEnd?.();
    if (request.action === 'enter') {
      if (world.paintWorkspace) world.paintWorkspace.editableUntil = undefined;
      if (world.paintWorkspace?.selection) world.paintWorkspace.selection.preview.visible = true;
      enterPaintWorkspace(world);
    }
    else if (request.action === 'exit') {
      if (world.paintWorkspace?.editableUntil) { multiplayerRef.current?.completePiece(); clearPaintWorkspace(world); }
      else exitPaintWorkspace(world);
    }
    else if (request.action === 'resize') setPaintWorkspaceSize(world, request.size ?? 2, request.height);
    else if (request.action === 'zoom') setPaintWorkspaceZoom(world, request.size ?? 1);
    else if (request.action === 'fit') { world.paintWorkspace?.pan?.set(0, 0); setPaintWorkspaceZoom(world, 1); }
    else if (request.action === 'link') setPaintWorkspaceLinked(world, (request.size ?? 0) > 0);
    else if (request.action === 'finish' && world.paintWorkspace?.selection?.hasPaint) {
      exitPaintWorkspace(world);
      const state = world.paintWorkspace;
      state.selection!.preview.visible = false;
      state.editableUntil = editGrace.current.start(() => {
        if (worldRef.current !== world || world.paintWorkspace !== state) return;
        multiplayerRef.current?.completePiece();
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
    jumpWorld(world, props.jumpPower);
  }, [props.jumpSignal, props.jumpPower]);

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    applySkyLighting(world, props.sky);
    world.cameraMode = props.viewMode;
    world.playerAvatar.visible = props.viewMode !== 'first';
    world.mapCamera.zoom = props.mapZoom;
    world.mapCamera.updateProjectionMatrix();
    world.botsEnabled = props.botsEnabled;
    world.setPaintVisibility(props.layerVisibility);
    if (world.scene.fog instanceof THREE.FogExp2) world.scene.fog.density = props.fogDensity;
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

  return <div ref={mountRef} className="world-mount" />;
};

export default WorldScene;
