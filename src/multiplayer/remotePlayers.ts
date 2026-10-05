import * as THREE from 'three';
import { createPlayerAvatar } from '../game/playerAvatar';
import { updatePlayerAvatar } from '../game/playerAvatarAppearance';
import { EYE_HEIGHT } from '../game/playerPhysics';
import { interpolatePlayer } from './playerSync';
import { readPlayer, readPlayerState, type PlayerState } from './protocol';

interface RemotePlayer {
  avatar: THREE.Group; current: PlayerState | null; target: PlayerState | null; name: string;
}
export class RemotePlayers {
  private players = new Map<string, RemotePlayer>();
  constructor(private scene: THREE.Scene) {}
  get count(): number { return this.players.size; }
  joined(value: unknown, ownId: string | null): void {
    const player = readPlayer(value);
    if (!player || player.playerId === ownId) return;
    let remote = this.players.get(player.playerId);
    if (!remote) {
      const avatar = createPlayerAvatar(this.scene);
      avatar.visible = false;
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 512; labelCanvas.height = 96;
      const context = labelCanvas.getContext('2d');
      if (context) {
        context.fillStyle = 'rgba(12,18,16,0.8)'; context.fillRect(0, 0, 512, 96);
        context.fillStyle = '#fff'; context.font = 'bold 30px sans-serif';
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(player.displayName, 256, 48, 490);
      }
      const texture = new THREE.CanvasTexture(labelCanvas);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
      label.position.set(0, 2.65, 0); label.scale.set(2.4, 0.45, 1); avatar.add(label);
      remote = { avatar, current: null, target: null, name: player.displayName };
      this.players.set(player.playerId, remote);
    }
    if (player.state) this.state(player.playerId, player.state);
  }
  state(playerId: string, value: unknown): void {
    const state = readPlayerState(value);
    const remote = this.players.get(playerId);
    if (!remote || !state) return;
    remote.target = state;
    if (!remote.current) remote.current = { ...state, position: [...state.position], rotation: [...state.rotation] };
  }
  update(delta: number): void {
    for (const remote of this.players.values()) {
      if (!remote.current || !remote.target) continue;
      remote.current = interpolatePlayer(remote.current, remote.target, delta);
      const state = remote.current;
      remote.avatar.visible = true;
      remote.avatar.position.set(state.position[0], state.position[1] - EYE_HEIGHT, state.position[2]);
      remote.avatar.rotation.y = state.rotation[1];
      updatePlayerAvatar(remote.avatar, delta, state.movement !== 'idle', state.jumping === true);
    }
  }
  left(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
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
  clear(): void { for (const id of [...this.players.keys()]) this.left(id); }
}
