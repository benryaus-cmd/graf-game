import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadModel, release } from './assetPreview';
import { getRenderSettings } from './renderSettings';
import { performanceLog } from './performanceLog';
import type { Collider } from './worldTypes';
import type { CityBuildingDescription } from './cityBlockLayout';

// Quaternius Cube World (CC0), self-contained glTF with a small palette texture.
const TREE_URL='https://raw.githubusercontent.com/benryaus-cmd/graf-game/9328c81ea02b53a1f9a07be490164be501e87f25/public/assets/city/tree.gltf';
export const COURTYARD_TREES:readonly [number,number,number][]=[[42,0,11],[54,0,11],[42,0,21],[54,0,21],[42,0,-11],[54,0,-11],[42,0,-21],[54,0,-21]];
export function addUrbanCourtyard(parent:THREE.Group,colliders:Collider[],buildings:CityBuildingDescription[]) {
  const root=new THREE.Group();root.name='urban-courtyard';parent.add(root);
  const batches=new Map<string,THREE.BufferGeometry[]>();
  const box=(color:string,x:number,y:number,z:number,w:number,h:number,d:number)=>{const geometry=new THREE.BoxGeometry(w,h,d);geometry.clearGroups();geometry.translate(x,y,z);if(!batches.has(color))batches.set(color,[]);batches.get(color)!.push(geometry);};
  // Preserve the two crossing movement corridors and the legacy tunnel approaches.
  box('#b5ad98',48,.035,0,48,.07,6);box('#b5ad98',48,.035,0,6,.07,48);
  box('#959686',48,.04,16,17,.08,15);box('#959686',48,.04,-16,17,.08,15);
  for(const [x,,z] of COURTYARD_TREES){box('#9da17e',x,.045,z,5.2,.09,5.2);box('#ddd2bc',x,.13,z-2.6,5.5,.22,.18);box('#ddd2bc',x,.13,z+2.6,5.5,.22,.18);box('#ddd2bc',x-2.6,.13,z,.18,.22,5.4);box('#ddd2bc',x+2.6,.13,z,.18,.22,5.4);}
  for(const x of [43.5,52.5])for(const z of [-16,16]){box('#795842',x,.65,z,.75,.18,3.2);box('#a88761',x+Math.sign(x-48)*.3,1,z,.12,.5,3.2);for(const bz of [z-1.2,z+1.2])box('#4e5852',x,.3,bz,.5,.6,.15);colliders.push({minX:x-.45,maxX:x+.45,minZ:z-1.65,maxZ:z+1.65,minY:0,maxY:1.2});}
  const facadeColors=['#c9b79c','#b5bbad','#cab8aa','#b3bfc0'];
  buildings.forEach((b,i)=>{if(b.tower)return;const front=b.z+b.depth/2;box('#725d49',b.x,b.height+.1,b.z,b.width+1,.22,b.depth+1);box('#86654d',b.x,3.5,front+.6,3.2,.2,1.4);
    // Recolour the same canonical surfaces without moving or changing their IDs/UVs.
    const tint=new THREE.MeshStandardMaterial({color:facadeColors[i],roughness:1});let used=false;
    for(const object of parent.children)if(object instanceof THREE.Mesh && Array.isArray(object.material) && Math.abs(object.position.x-b.x)<=b.width/2+.6&&Math.abs(object.position.z-b.z)<=b.depth/2+.6){const visual=object.userData.baseVisual as THREE.Mesh|undefined;if(visual){visual.material=tint;used=true;}}
    if(!used)tint.dispose();
  });
  for(const [color,geometries]of batches){const merged=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());root.add(new THREE.Mesh(merged,new THREE.MeshStandardMaterial({color,roughness:1})));}
  const fallback=new THREE.Group();fallback.name='courtyard-tree-fallback';root.add(fallback);
  const geometry=new THREE.IcosahedronGeometry(1.3,0),material=new THREE.MeshStandardMaterial({color:'#7e9a62',roughness:1});
  const foliage=new THREE.InstancedMesh(geometry,material,COURTYARD_TREES.length);const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.24,2.2,5),new THREE.MeshStandardMaterial({color:'#7c6752',roughness:1}),COURTYARD_TREES.length);const matrix=new THREE.Matrix4();
  COURTYARD_TREES.forEach(([x,y,z],i)=>{matrix.compose(new THREE.Vector3(x,y+3,z),new THREE.Quaternion(),new THREE.Vector3(1,1.4,1));foliage.setMatrixAt(i,matrix);matrix.makeTranslation(x,y+1.1,z);trunk.setMatrixAt(i,matrix);colliders.push({minX:x-.25,maxX:x+.25,minZ:z-.25,maxZ:z+.25,minY:0,maxY:2.3});});fallback.add(foliage,trunk);
  let closed=false;let trees:THREE.Group|null=null;const request=new AbortController();
  void loadModel(TREE_URL,request.signal).then(model=>{
    if(closed){release(model.scene);return;}
    const bounds=new THREE.Box3().setFromObject(model.scene),size=bounds.getSize(new THREE.Vector3());if(!size.y||!Number.isFinite(size.y)){release(model.scene);throw Error('Empty courtyard tree');}
    model.scene.updateMatrixWorld(true);const instances=new THREE.Group();instances.name='quaternius-courtyard-trees';
    model.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const mesh=new THREE.InstancedMesh(o.geometry,o.material,COURTYARD_TREES.length),scale=4.8/size.y;
      COURTYARD_TREES.forEach(([x,y,z],i)=>{const center=bounds.getCenter(new THREE.Vector3());const transform=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),i*.73),new THREE.Vector3(scale,scale,scale));transform.multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z)).multiply(o.matrixWorld);mesh.setMatrixAt(i,transform);});mesh.computeBoundingSphere();instances.add(mesh);
    });trees=instances;root.add(instances);model.scene.clear();fallback.visible=false;performanceLog.event('Courtyard tree loaded (shared instances)');
  }).catch(error=>{if(!closed)performanceLog.event('Tree fallback: '+String(error));});
  root.userData.updateScenery=()=>{const visible=getRenderSettings().scenery;if(trees)trees.visible=visible;fallback.visible=!trees||!visible;foliage.visible=visible;};
  root.userData.disposeFixture=()=>{if(closed)return;closed=true;request.abort();root.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});};root.userData.updateScenery();
  return root;
}
