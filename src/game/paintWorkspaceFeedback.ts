import * as THREE from 'three';
import type { PaintWorkspaceSelection } from './worldTypes';
import type { PieceBounds } from '../multiplayer/pieceSync';
import { WORKSPACE_FILL_ORDER } from './worldOverlayOrder';

const cachedBounds = new WeakMap<PaintWorkspaceSelection, PieceBounds>();
export function workspaceWorldBounds(selection: PaintWorkspaceSelection): PieceBounds {
  const cached = cachedBounds.get(selection);
  if (cached) return cached;
  const box = new THREE.Box3();
  const positions = selection.preview.geometry.getAttribute('position');
  selection.wall.mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < positions.count; i++) box.expandByPoint(selection.wall.mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i)));
  // Use the exact rectangle: padding would inflate the charged area and exceed the 8 m limit.
  const bounds = { min: box.min.toArray() as [number, number, number], max: box.max.toArray() as [number, number, number] };
  cachedBounds.set(selection, bounds);
  return bounds;
}

/** Advisory only. Shared paint permission always comes from the server. */
export function setWorkspaceInvalid(selection: PaintWorkspaceSelection | null | undefined, invalid: boolean): void {
  if (!selection) return;
  const preview = selection.preview;
  let fill = preview.userData.invalidFill as THREE.Mesh | undefined;
  if (invalid && !fill) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', preview.geometry.getAttribute('position').clone());
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const material = new THREE.MeshBasicMaterial({ color: '#ff2222', transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
    fill = new THREE.Mesh(geometry, material);
    fill.layers.mask = preview.layers.mask;
    fill.renderOrder = WORKSPACE_FILL_ORDER;
    preview.add(fill);
    preview.userData.invalidFill = fill;
    preview.geometry.addEventListener('dispose', () => { geometry.dispose(); material.dispose(); preview.userData.invalidFill = undefined; });
  }
  if (fill) fill.visible = invalid;
}
