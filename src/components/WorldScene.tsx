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
import { loadBotArtwork, loadPosterImage } from '@/game/worldSceneRequests';
import type { PosterPlacementRequest } from '@/game/usePosterPlacement';
import { applyAvatarAppearance, triggerAvatarEmote } from '@/game/playerAvatarAppearance';
import type { AvatarAppearance } from '@/game/progression';
import type { BotArtworkRequest } from '@/game/useBotArtwork';
import type { AvatarEmote, CameraMode, LiveSettings, MovementInput, SkyMode, WorldEngine } from '@/game/worldTypes';

interface WorldSceneProps {
  sky: SkyMode; paintMode: boolean; eraseMode: boolean; color: string;
  movement: MovementInput; brushSize: number; opacity: number;
  moveSpeed: number; jumpPower: number; lookSensitivity: number; fogDensity: number;
  jumpSignal: number; layerIndex: number; layerVisibility: boolean[];
  viewMode: CameraMode; mapZoom: number; botsEnabled: boolean;
  avatar: AvatarAppearance; emoteSignal: { emote: AvatarEmote; sequence: number } | null;
  artworkRequest: BotArtworkRequest | null;
  posterPlacement: PosterPlacementRequest | null; posterSize: number; posterCommitSignal: number;
  onPosterValidity: (valid: boolean) => void; onPosterPlaced: (sequence: number, placed: boolean) => void;
  onArtworkPlaced: (sequence: number, placed: boolean) => void;
  onNearbyBot: (index: number | null) => void; onSpray: () => void; onPaint: () => void;
}

const WorldScene = (props: WorldSceneProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldEngine | null>(null);
  const posterRef = useRef<PosterPlacementSession | null>(null);
  const posterSizeRef = useRef(props.posterSize);
  const posterCommitRef = useRef(props.posterCommitSignal);
  const sprayRef = useRef(props.onSpray);
  const paintRef = useRef(props.onPaint);
  const nearbyBotRef = useRef(props.onNearbyBot);
  const artworkPlacedRef = useRef(props.onArtworkPlaced);
  const posterValidityRef = useRef(props.onPosterValidity);
  const posterPlacedRef = useRef(props.onPosterPlaced);
  const liveRef = useRef<LiveSettings>({
    paintMode: props.paintMode, eraseMode: props.eraseMode, color: props.color,
    opacity: props.opacity, movement: props.movement, brushSize: props.brushSize,
    moveSpeed: props.moveSpeed, jumpPower: props.jumpPower,
    lookSensitivity: props.lookSensitivity, fogDensity: props.fogDensity,
    layerIndex: props.layerIndex, layerVisibility: props.layerVisibility,
  });

  useEffect(() => {
    liveRef.current = {
      paintMode: props.paintMode, eraseMode: props.eraseMode, color: props.color,
      opacity: props.opacity, movement: props.movement, brushSize: props.brushSize,
      moveSpeed: props.moveSpeed, jumpPower: props.jumpPower,
      lookSensitivity: props.lookSensitivity, fogDensity: props.fogDensity,
      layerIndex: props.layerIndex, layerVisibility: props.layerVisibility,
    };
    sprayRef.current = props.onSpray;
    paintRef.current = props.onPaint;
    nearbyBotRef.current = props.onNearbyBot;
    artworkPlacedRef.current = props.onArtworkPlaced;
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
      stopControls();
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

  useEffect(() => loadPosterImage(
    props.posterPlacement, worldRef, posterRef, posterSizeRef, posterCommitRef, posterValidityRef,
  ), [props.posterPlacement?.sequence, props.posterPlacement?.dataUrl]);
  useEffect(() => loadBotArtwork(props.artworkRequest, worldRef, artworkPlacedRef), [props.artworkRequest]);

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
  }, [props.emoteSignal]);

  return <div ref={mountRef} className="world-mount" />;
};

export default WorldScene;