import * as THREE from 'three';
import { SpeechBubble } from '../game/speechBubble';
import { createPlayerAvatar } from '../game/playerAvatar';
import { updatePlayerAvatar, applyAvatarAppearance, triggerAvatarEmote } from '../game/playerAvatarAppearance';
import { SHOP_ITEMS } from '../game/shopCatalog';
import type { AvatarEmote } from '../game/worldTypes';
import type { ServerRole } from './permissions';
import { EYE_HEIGHT } from '../game/playerPhysics';
import { interpolatePlayer } from './playerSync';
import { readPlayer, readPlayerState, type PlayerState, type Message } from './protocol';
import { elementPointerPoint } from '../game/pointerCoordinates';

interface RemotePlayer {
  bubble?: SpeechBubble; avatar: THREE.Group; current: PlayerState | null; target: PlayerState | null; name: string;
  username?: string; role?: ServerRole; appearance?: string; lastEmote?: string;
}
export interface PickedPlayer { playerId: string; username: string; nickName: string; role?: ServerRole }
export class RemotePlayers {
  private players = new Map<string, RemotePlayer>();
  private actions = new Set<string>();
  constructor(private scene: THREE.Scene) {}
  get count(): number { return this.players.size; }
  roster(): PickedPlayer[] { return [...this.players.keys()].map(id => this.get(id)!); }
  joined(value: unknown, ownId: string | null): void {
    const player = readPlayer(value);
    if (!player || player.playerId === ownId) return;
    let remote = this.players.get(player.playerId);
    if (!remote) {
      const avatar = createPlayerAvatar(this.scene);
      avatar.visible = false;
      const name = player.nickName || player.displayName || (player.username ? '@' + player.username : 'PLAYER');
      const username = player.username?.replace(/^@/, '');
      const showHandle = !!player.nickName && !!username && username.toLocaleLowerCase() !== player.nickName.replace(/^@/, '').toLocaleLowerCase();
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 512; labelCanvas.height = 112;
      const context = labelCanvas.getContext('2d');
      if (context) {
        context.fillStyle = 'rgba(12,18,16,0.8)'; context.fillRect(0, 0, 512, 112);
        context.fillStyle = '#fff'; context.font = 'bold 30px sans-serif';
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(name, 256, showHandle ? 38 : 56, 490);
        if (showHandle) {
          context.fillStyle = 'rgba(232,239,233,0.82)'; context.font = '22px sans-serif';
          context.fillText('@' + username, 256, 80, 490);
        }
      }
      const texture = new THREE.CanvasTexture(labelCanvas);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
      label.position.set(0, 2.65, 0); label.scale.set(2.4, showHandle ? 0.53 : 0.45, 1); avatar.add(label);
      remote = { avatar, current: null, target: null, name, username, role: isRole((player as typeof player & { role?: unknown }).role) ? (player as typeof player & { role: ServerRole }).role : undefined };
      this.players.set(player.playerId, remote);
    }
    if (player.username) remote.username = player.username.replace(/^@/, '');
    const role = (player as typeof player & { role?: unknown }).role;
    if (isRole(role)) remote.role = role;
    if (player.state) this.state(player.playerId, player.state);
  }
  roleChanged(playerId: string, username: string, role: ServerRole): void {
    const remote = this.players.get(playerId);
    if (!remote) return;
    remote.username = username.replace(/^@/, '');
    remote.role = role;
  }
  get(playerId: string): PickedPlayer | null {
    const remote = this.players.get(playerId);
    if (!remote) return null;
    return { playerId, username: remote.username ?? '', nickName: remote.name, role: remote.role };
  }
  roleForUsername(username: string): ServerRole | undefined {
    const normalized = username.replace(/^@/, '').toLowerCase();
    return [...this.players.values()].find(player => player.username?.toLowerCase() === normalized)?.role;
  }
  pick(event: PointerEvent, canvas: HTMLElement, camera: THREE.Camera, wallMeshes: THREE.Object3D[], playerPosition: THREE.Vector3): PickedPlayer | null {
    const point = elementPointerPoint(canvas, event);
    const pointer = new THREE.Vector2(point.x * 2 - 1, 1 - point.y * 2);
    const raycaster = new THREE.Raycaster();
    raycaster.far = 12;
    raycaster.setFromCamera(pointer, camera);
    const walls = raycaster.intersectObjects(wallMeshes, false)[0];
    const roots = [...this.players.entries()].filter(([, p]) => p.avatar.visible && p.current &&
      p.avatar.position.distanceTo(playerPosition) <= 12).map(([, p]) => p.avatar);
    const hit = raycaster.intersectObjects(roots, true).find(candidate => candidate.distance <= 12 && (!walls || candidate.distance < walls.distance));
    if (!hit) return null;
    let root: THREE.Object3D | null = hit.object;
    while (root && !roots.includes(root as THREE.Group)) root = root.parent;
    const entry = root && [...this.players.entries()].find(([, p]) => p.avatar === root);
    return entry ? this.get(entry[0]) : null;
  }
  state(playerId: string, value: unknown): void {
    const state = readPlayerState(value);
    const remote = this.players.get(playerId);
    if (!remote || !state) return;
    remote.target = state;
    if (state.emote !== remote.lastEmote) {
      remote.lastEmote = state.emote;
      if (isEmote(state.emote)) triggerAvatarEmote(remote.avatar, state.emote);
    }
    if (!remote.current) remote.current = { ...state, position: [...state.position], rotation: [...state.rotation] };
  }
  update(delta: number): void {
    for (const remote of this.players.values()) {
      if (!remote.current || !remote.target) continue;
      remote.current = interpolatePlayer(remote.current, remote.target, delta);
      const state = remote.current;
      if (state.cosmetics && remote.appearance !== JSON.stringify(state.cosmetics)) {
        const cosmetics = state.cosmetics;
        const known = (slot: string, value: string, fallback: string) => SHOP_ITEMS.some(i => i.id === slot + ':' + value) ? value : fallback;
        const outfit = known('outfit', cosmetics.outfit, 'street');
        const accessory = known('accessory', cosmetics.accessory, 'none');
        const top = SHOP_ITEMS.find(i => i.id === 'top:' + cosmetics.top);
        const bottom = SHOP_ITEMS.find(i => i.id === 'bottom:' + cosmetics.bottom);
        applyAvatarAppearance(remote.avatar, { outfit, accessory, topColor: top?.color ?? '#e87851', bottomColor: bottom?.color ?? '#353a40' });
        remote.appearance = JSON.stringify(cosmetics);
      }
      const parts = remote.avatar.userData.parts;
      if (parts?.accessories) {
        for (const held of ['sprayCan', 'basketball']) {
          parts.accessories[held].visible = state.visibleHeldItem === held || state.cosmetics?.accessory === held;
        }
      }
      remote.avatar.visible = true;
      remote.avatar.position.set(state.position[0], state.position[1] - EYE_HEIGHT, state.position[2]);
      remote.avatar.rotation.y = state.rotation[1] + Math.PI;
      updatePlayerAvatar(remote.avatar, delta, state.movement !== 'idle', state.jumping === true || state.flightState === 'flying' || state.flightState === 'levitating');
    }
  }
  say(playerId: string, text: string): void {
    const remote = this.players.get(playerId);
    if (!remote) return;
    remote.bubble ??= new SpeechBubble(remote.avatar);
    remote.bubble.show(text);
  }
  left(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.bubble?.dispose();
    this.scene.remove(player.avatar);
    const geometry = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
    player.avatar.traverse(object => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return;
      if (object instanceof THREE.Mesh) geometry.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map);
      }
    });
    geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    this.players.delete(playerId);
  }
  action(message: Message): void {
    if (typeof message.playerId !== 'string' || typeof message.actionId !== 'string' || this.actions.has(message.actionId)) return;
    const remote = this.players.get(message.playerId);
    if (!remote) return;
    this.actions.add(message.actionId);
    if (this.actions.size > 1000) this.actions.delete(this.actions.values().next().value!);
    const emote = (message.data as { emote?: unknown } | undefined)?.emote;
    if (message.action === 'emote' && isEmote(emote)) {
      remote.lastEmote = emote; triggerAvatarEmote(remote.avatar, emote);
    }
  }
  clear(): void { for (const id of [...this.players.keys()]) this.left(id); this.actions.clear(); }
}

function isEmote(value: unknown): value is AvatarEmote { return typeof value === 'string' && ['joy','cry','think','sleepy','spin'].includes(value); }
function isRole(value: unknown): value is ServerRole { return value === 'player' || value === 'moderator' || value === 'admin' || value === 'owner'; }
