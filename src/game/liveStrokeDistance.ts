import * as THREE from 'three';
import type { PaintWall } from './worldTypes';
const bounds=new THREE.Box3();
/** Rendering demand only. Canonical network samples and the local paint path remain intact. */
export function withinLiveStrokeDistance(wall:PaintWall,position:THREE.Vector3,distance:number,selected?:PaintWall|null):boolean {
  if(wall===selected)return true;
  if(!wall.mesh.geometry.boundingBox)wall.mesh.geometry.computeBoundingBox();
  if(!wall.mesh.geometry.boundingBox)return true;
  wall.mesh.updateWorldMatrix(true,false);
  bounds.copy(wall.mesh.geometry.boundingBox).applyMatrix4(wall.mesh.matrixWorld);
  return bounds.distanceToPoint(position)<=distance;
}
