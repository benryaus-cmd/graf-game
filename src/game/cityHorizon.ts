import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCityBlockLayout } from './cityBlockLayout';
import { distanceToChunk } from './cityStreamPolicy';
import { getRenderSettings } from './renderSettings';
/** Opaque low-detail blocks: no paint layers, collision, network messages or image downloads. */
export class CityHorizon {
  readonly root=new THREE.Group();private blocks=new Map<string,THREE.Group>();private signature='';
  private materials=[new THREE.MeshBasicMaterial({color:'#a69f8e'}),new THREE.MeshBasicMaterial({color:'#908f87'}),new THREE.MeshBasicMaterial({color:'#c0b6a0'}),new THREE.MeshBasicMaterial({color:'#7d837b'}),new THREE.MeshBasicMaterial({color:'#858377'})];
  constructor(scene:THREE.Scene){this.root.name='city-distant-skyline';scene.add(this.root);}
  update(x:number,z:number,active:Set<string>){const settings=getRenderSettings();this.root.visible=settings.horizon;
    if(!settings.horizon)return;const cx=Math.floor(x/48+.5),cz=Math.floor(z/48+.5),radius=Math.ceil(settings.horizonDistance/48)+1;
    const signature=`${cx}:${cz}:${settings.horizonDistance}`;
    if(signature!==this.signature){this.signature=signature;const wanted=new Set<string>();
      for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){const bx=cx+dx,bz=cz+dz;if(distanceToChunk(cx*48,cz*48,bx,bz)>settings.horizonDistance)continue;const key=`${bx}:${bz}`;wanted.add(key);if(!this.blocks.has(key)){const root=this.build(bx,bz);this.blocks.set(key,root);this.root.add(root);}}
      for(const[key,root]of this.blocks)if(!wanted.has(key)){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});root.removeFromParent();this.blocks.delete(key);}
    }
    for(const[key,root]of this.blocks){const[bx,bz]=key.split(':').map(Number);root.visible=!active.has(key)&&distanceToChunk(x,z,bx,bz)<settings.horizonDistance;}
  }
  private build(cx:number,cz:number):THREE.Group {const root=new THREE.Group(),geometry:THREE.BufferGeometry[]=[];
    for(const b of createCityBlockLayout(cx,cz).buildings){const g=new THREE.BoxGeometry(b.width+.4,b.height,b.depth+.4);g.translate(b.x,b.height/2,b.z);g.clearGroups();geometry.push(g);}
    // Ground is continuous in the proxy ring too: prevents distant streets ending in sky.
    const ground=new THREE.BoxGeometry(48,.04,48);ground.translate(cx*48,-.03,cz*48);ground.clearGroups();geometry.push(ground);
    const merged=mergeGeometries(geometry,false)!;geometry.forEach(g=>g.dispose());const material=this.materials[Math.abs(cx*3+cz*7)%this.materials.length];root.add(new THREE.Mesh(merged,material));return root;
  }
  dispose(){for(const block of this.blocks.values())block.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.blocks.clear();this.materials.forEach(m=>m.dispose());this.root.removeFromParent();}
}
