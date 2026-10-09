import * as THREE from 'three';

export type CourtyardPortalAction = 'characters' | 'basketball' | 'multiplayer';
export const COURTYARD_PORTALS = Object.freeze([
  { action: 'characters' as const, label: 'CHARACTERS', position: [-6, 0, -3] as const, color: '#ad8aff' },
  { action: 'basketball' as const, label: 'BASKETBALL', position: [0, 0, -3] as const, color: '#ffb35c' },
  { action: 'multiplayer' as const, label: 'MULTIPLAYER', position: [6, 0, -3] as const, color: '#5de8d3' },
]);
// Paved east approach: outside shooting seats, benches and the court's bounds.
export const BASKETBALL_PORTAL_LANDING = [-42, 1.72, -32] as const;
export const BASKETBALL_PORTAL_YAW = Math.atan2(11, 8.08);

const GLYPHS: Record<string, string[]> = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
};

// Tiny crisp text atlas works without a DOM or network and stays readable at distance.
function labelTexture(label: string) {
  const width = label.length * 6 + 5, height = 13;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([12, 23, 35, 255], i);
  [...label].forEach((letter, index) => {
    GLYPHS[letter].forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel === '1') pixels.set([246, 250, 255, 255], ((height - 1 - y - 3) * width + 3 + index * 6 + x) * 4);
      });
    });
  });
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class CourtyardPortals {
  private readonly group = new THREE.Group();
  private readonly portals: { group: THREE.Group; occupied: boolean }[] = [];
  private readonly resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  private disposed = false;

  constructor(scene: THREE.Scene, private readonly onAction: (action: CourtyardPortalAction) => void) {
    this.group.name = 'courtyard-portals';
    const padGeometry = this.keep(new THREE.CylinderGeometry(1.38, 1.38, .08, 32));
    const ringGeometry = this.keep(new THREE.TorusGeometry(1.3, .045, 4, 32));
    const archGeometry = this.keep(new THREE.TorusGeometry(1.25, .065, 4, 20, Math.PI));
    const postGeometry = this.keep(new THREE.CylinderGeometry(.065, .065, 1.95, 5));
    const labelGeometry = this.keep(new THREE.PlaneGeometry(3.6, .72));
    const trimGeometry = this.keep(new THREE.PlaneGeometry(3.72, .84));
    const dark = this.keep(new THREE.MeshBasicMaterial({ color: '#152333' }));
    for (const portal of COURTYARD_PORTALS) {
      const group = new THREE.Group();
      group.name = `courtyard-portal-${portal.action}`;
      group.position.fromArray(portal.position);
      const neon = this.keep(new THREE.MeshBasicMaterial({ color: portal.color, toneMapped: false, side: THREE.DoubleSide }));
      const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z = 0) => {
        const object = new THREE.Mesh(geometry, material);
        object.position.set(x, y, z);
        group.add(object);
        return object;
      };
      mesh(padGeometry, dark, 0, .05);
      mesh(ringGeometry, neon, 0, .1).rotation.x = -Math.PI / 2;
      mesh(archGeometry, neon, 0, 1.99);
      mesh(postGeometry, neon, -1.25, 1.015);
      mesh(postGeometry, neon, 1.25, 1.015);
      mesh(trimGeometry, neon, 0, 3.65, -.005);
      const texture = this.keep(labelTexture(portal.label));
      const labelMaterial = this.keep(new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }));
      const label = mesh(labelGeometry, labelMaterial, 0, 3.65, .005);
      label.name = `courtyard-label-${portal.action}`;
      label.userData.label = portal.label;
      this.group.add(group);
      this.portals.push({ group, occupied: false });
    }
    scene.add(this.group);
  }

  private keep<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }

  update(position: THREE.Vector3, options: { enabled: boolean; solo: boolean }) {
    if (this.disposed) return;
    for (const [index, state] of this.portals.entries()) {
      const portal = COURTYARD_PORTALS[index];
      const available = portal.action !== 'multiplayer' || options.solo;
      state.group.visible = available;
      const distance = Math.hypot(position.x - portal.position[0], position.z - portal.position[2]);
      const inside = distance <= (state.occupied ? 1.55 : 1.1);
      const entered = inside && !state.occupied;
      // Track occupancy even when UI/activity/connection gates are closed. Closing a
      // menu while standing on a pad never silently starts another activity.
      state.occupied = inside;
      if (entered && position.y >= -.2 && position.y <= 3 && options.enabled && available) {
        this.onAction(portal.action);
        break;
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
  }
}
