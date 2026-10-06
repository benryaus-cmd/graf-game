import * as THREE from 'three';
import type { PaintWorkspaceSelection } from '@/game/worldTypes';
import type { Message } from './protocol';
import type { PieceMetadata } from './pieceSync';
import { encodeSurface } from './surfaces';

const MAX_FLATTEN_DIMENSION = 1024;
const WEBP_QUALITY = 0.82;

export interface FlattenedPieceCapture {
  dataUrl: string;
  surfaceId: string;
  face: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  width: number;
  height: number;
}

export function captureFlattenedPiece(
  selection: PaintWorkspaceSelection,
  layerVisibility: boolean[],
): FlattenedPieceCapture | null {
  const surfaceId = selection.wall.surfaceId;
  if (!surfaceId) return null;

  const face = selection.face;

  const available = selection.wall.layers
    .map((layer, index) => ({
      context: layer.contexts[face],
      visible: layerVisibility[index] ?? true,
    }))
    .filter(entry => !!entry.context && entry.visible);

  const reference = available[0]?.context;
  if (!reference) return null;

  const bounds = selection.bounds;
  const sourceWidth = reference.canvas.width;
  const sourceHeight = reference.canvas.height;

  const cropX0 = Math.max(0, Math.floor(bounds.minU * sourceWidth));
  const cropX1 = Math.min(sourceWidth, Math.ceil(bounds.maxU * sourceWidth));

  // Wall painting uses inverted canvas Y:
  // canvasY = (1 - normalizedV) * canvas.height
  const cropY0 = Math.max(0, Math.floor((1 - bounds.maxV) * sourceHeight));
  const cropY1 = Math.min(sourceHeight, Math.ceil((1 - bounds.minV) * sourceHeight));

  const cropWidth = cropX1 - cropX0;
  const cropHeight = cropY1 - cropY0;

  if (cropWidth <= 0 || cropHeight <= 0) return null;

  const scale = Math.min(
    1,
    MAX_FLATTEN_DIMENSION / Math.max(cropWidth, cropHeight),
  );

  const outputWidth = Math.max(1, Math.round(cropWidth * scale));
  const outputHeight = Math.max(1, Math.round(cropHeight * scale));

  const output = document.createElement('canvas');
  output.width = outputWidth;
  output.height = outputHeight;

  const target = output.getContext('2d');
  if (!target) return null;

  target.clearRect(0, 0, outputWidth, outputHeight);
  target.globalAlpha = 1;
  target.globalCompositeOperation = 'source-over';
  target.imageSmoothingEnabled = true;
  target.imageSmoothingQuality = 'high';

  for (const entry of available) {
    const context = entry.context;
    if (!context) continue;

    const source = context.canvas;

    const sx0 = Math.max(0, Math.floor(bounds.minU * source.width));
    const sx1 = Math.min(source.width, Math.ceil(bounds.maxU * source.width));
    const sy0 = Math.max(0, Math.floor((1 - bounds.maxV) * source.height));
    const sy1 = Math.min(source.height, Math.ceil((1 - bounds.minV) * source.height));

    const sw = sx1 - sx0;
    const sh = sy1 - sy0;

    if (sw <= 0 || sh <= 0) continue;

    target.drawImage(
      source,
      sx0,
      sy0,
      sw,
      sh,
      0,
      0,
      outputWidth,
      outputHeight,
    );
  }

  const wall = selection.wall;

  wall.mesh.updateWorldMatrix(true, false);

  const localPosition = wall.mesh.worldToLocal(
    selection.center.clone(),
  );

  const worldNormalPoint = selection.center
    .clone()
    .add(selection.normal);

  const localNormalPoint = wall.mesh.worldToLocal(
    worldNormalPoint,
  );

  const localNormal = localNormalPoint
    .sub(localPosition)
    .normalize();

  const localQuaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    localNormal,
  );

  return {
    dataUrl: output.toDataURL('image/webp', WEBP_QUALITY),
    surfaceId: encodeSurface(surfaceId, face, 0),
    face,
    position: [
      localPosition.x,
      localPosition.y,
      localPosition.z,
    ],
    quaternion: [
      localQuaternion.x,
      localQuaternion.y,
      localQuaternion.z,
      localQuaternion.w,
    ],
    width: selection.width,
    height: selection.height,
  };
}

export function flattenedPieceArtworkMessage(piece: PieceMetadata): Message | null {
  if (
    piece.flattened !== true ||
    !piece.assetRef ||
    !piece.surfaceId ||
    !piece.position ||
    !piece.quaternion ||
    !Number.isFinite(piece.width) ||
    !Number.isFinite(piece.height)
  ) return null;

  return {
    type: 'artwork_placed',
    artworkId: `piece:${piece.pieceId}`,
    assetRef: piece.assetRef,
    surfaceId: piece.surfaceId,
    face: piece.face ?? '',
    position: piece.position,
    quaternion: piece.quaternion,
    width: piece.width,
    height: piece.height,
    sequence: piece.sequence,
  };
}