import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addPosterOverlay } from '../src/game/posterOverlay';
import type { PaintWall, PosterArtwork } from '../src/game/worldTypes';

test('persisted artwork offsets outward along its rotated normal without mutating saved placement', () => {
  for (const normal of [new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1),new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,1,0)]) {
    const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
    const artwork={image:'https://24.144.88.205/artwork/c8428415-dc54-415f-a52d-68df4a82793e.webp',position:[0,0,0.018],quaternion:rotation.toArray(),width:2,height:2} as PosterArtwork;
    const saved=JSON.stringify(artwork), parent=new THREE.Group();
    addPosterOverlay({mesh:parent,layers:[]} as unknown as PaintWall,artwork,{} as HTMLImageElement);
    const mesh=parent.children[0] as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
    const expected=new THREE.Vector3().fromArray(artwork.position).addScaledVector(normal,0.006);
    assert.ok(mesh.position.distanceTo(expected)<1e-10);
    assert.equal(JSON.stringify(artwork),saved);
    assert.equal(mesh.material.depthTest,true);
    assert.equal(mesh.material.depthWrite,false);
    assert.equal(mesh.material.side,THREE.DoubleSide);
    assert.equal(mesh.material.polygonOffset,true);
    assert.equal(mesh.material.polygonOffsetFactor,-4);
    assert.equal(mesh.material.polygonOffsetUnits,-4);
    mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();
  }
});
