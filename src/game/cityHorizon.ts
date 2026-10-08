import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCityBlockLayout } from './cityBlockLayout';
import { distanceToChunk } from './cityStreamPolicy';
import { getRenderSettings } from './renderSettings';
import { fogVisualDistance } from './cityAtmosphere';
import { performanceLog } from './performanceLog';

/** Independent visual tiers. These meshes never own paint, collisions or multiplayer state. */
export class CityHorizon {
  readonly root=new THREE.Group();private blocks=new Map<string,THREE.Group>();private signature='';private skylineSignature='';private wanted=new Set<string>();private queue:string[]=[];
  private flat:THREE.InstancedMesh|null=null;private flatKeys:string[]=[];private flatMasks:THREE.InstancedBufferAttribute|null=null;
  private uniforms={far:{value:480},width:{value:1.05}};
  private stats={plain:0,flat:0,queued:0};
  private origin={value:new THREE.Vector2()};
  private materials=['#a69f8e','#908f87','#c0b6a0','#7d837b','#858377'].map(color=>new THREE.MeshBasicMaterial({color}));
  private flatMaterial=new THREE.MeshBasicMaterial({color:'#87938b',side:THREE.DoubleSide});
  constructor(private scene:THREE.Scene){
    this.root.name='city-distant-skyline';scene.add(this.root);scene.userData.cityHorizonStats=this.stats;
    this.flatMaterial.onBeforeCompile=shader=>{
      shader.uniforms.cityOrigin=this.origin;shader.uniforms.skylineFar=this.uniforms.far;shader.uniforms.skylineWidth=this.uniforms.width;
      shader.vertexShader='attribute float cityHidden;\n'+'uniform float skylineFar;\nuniform float skylineWidth;\nuniform vec2 cityOrigin;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
        vec3 cityCenter=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
        vec3 cityFacing=cameraPosition-cityCenter;
        vec3 cityRight=normalize(vec3(cityFacing.z,0.0,-cityFacing.x)+vec3(0.000001,0.0,0.0));
        vec3 cityVertex=cityCenter+cityRight*transformed.x*length(instanceMatrix[0].xyz)*skylineWidth+vec3(0.0,transformed.y*length(instanceMatrix[1].xyz),0.0);
        vec4 mvPosition=viewMatrix*vec4(cityVertex,1.0);
        gl_Position=projectionMatrix*mvPosition;
        vec2 cityBlock=floor(cityCenter.xz/48.0+0.5)*48.0;
        float cityDistance=length(max(abs(cityOrigin-cityBlock)-vec2(24.0),vec2(0.0)));
        if(cityHidden>0.5||cityDistance>skylineFar)gl_Position=vec4(0.0,0.0,2.0,1.0);
      `);
    };
    this.flatMaterial.customProgramCacheKey=()=> 'graffciti-city-billboard-v2';
  }
  update(x:number,z:number,active:Set<string>,camera?:THREE.Camera){
    const settings=getRenderSettings();this.root.visible=settings.horizon;this.origin.value.set(x,z);this.uniforms.far.value=Math.min(settings.skylineDistance,fogVisualDistance(settings,camera));this.uniforms.width.value=settings.skylineWidth;
    if(!settings.horizon){this.stats.plain=0;this.stats.flat=0;return;}
    const cx=Math.floor(x/48+.5),cz=Math.floor(z/48+.5),radius=Math.ceil(settings.horizonDistance/48)+1;
    const signature=`${cx}:${cz}:${settings.horizonDistance}`;
    if(signature!==this.signature){
      const started=performanceLog.active?performance.now():0;this.signature=signature;this.wanted=new Set();
      for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){const bx=cx+dx,bz=cz+dz;if(distanceToChunk(cx*48,cz*48,bx,bz)>settings.horizonDistance+48/Math.sqrt(2))continue;this.wanted.add(`${bx}:${bz}`);}
      for(const[key,root]of this.blocks)if(!this.wanted.has(key)){root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});root.removeFromParent();this.blocks.delete(key);}
      this.queue=[...this.wanted].filter(key=>!this.blocks.has(key)).sort((a,b)=>{const[ax,az]=a.split(':').map(Number),[bx,bz]=b.split(':').map(Number);return distanceToChunk(x,z,ax,az)-distanceToChunk(x,z,bx,bz);});
      if(performanceLog.active)performanceLog.cost('horizon.planRing',performance.now()-started);
    }
    // Large experimental ranges do not build their entire proxy ring in one frame.
    const started=performance.now();let built=0;
    while(this.queue.length&&built<6){const key=this.queue.shift()!;if(!this.wanted.has(key))continue;const[bx,bz]=key.split(':').map(Number);const root=performanceLog.measure('horizon.buildBlock',()=>this.build(bx,bz),key);this.blocks.set(key,root);this.root.add(root);built++;if(performance.now()-started>=settings.streamBudgetMs)break;}
    const skylineSignature=`${cx}:${cz}:${settings.skylineDistance}:${settings.skylineMinHeight}`;
    if(settings.skyline&&skylineSignature!==this.skylineSignature){this.skylineSignature=skylineSignature;performanceLog.measure('horizon.buildFlatRing',()=>this.buildFlat(cx,cz,settings.skylineDistance,settings.skylineMinHeight));}
    if(this.flat){
      this.flat.visible=settings.skyline;let changed=false;const masks=new Map<string,number>(),fogEnd=fogVisualDistance(settings,camera);
      for(let i=0;i<this.flatKeys.length;i++){
        const key=this.flatKeys[i];let hidden=masks.get(key);
        if(hidden===undefined){
          const[bx,bz]=key.split(':').map(Number),distance=distanceToChunk(x,z,bx,bz);
          const detailEnd=Math.min(settings.detailDistance,fogEnd),plainEnd=Math.min(settings.horizonDistance,fogEnd);
          // A loaded 3D replacement owns the handover. Keep a 2m overlap;
          // queued/missing proxies must not leave their skyline hidden.
          const end=Math.max(active.has(key)?detailEnd:0,this.blocks.has(key)?plainEnd:0);
          const pinned=active.has(key)&&distance>detailEnd;
          hidden=pinned||distance<Math.max(0,end-2)?1:0;masks.set(key,hidden);
        }
        if(this.flatMasks!.getX(i)!==hidden){this.flatMasks!.setX(i,hidden);changed=true;}
      }
      if(changed)this.flatMasks!.needsUpdate=true;
    }
    let visible=0;
    for(const[key,root]of this.blocks){const[bx,bz]=key.split(':').map(Number);root.visible=!active.has(key)&&distanceToChunk(x,z,bx,bz)<Math.min(settings.horizonDistance,fogVisualDistance(settings,camera));if(root.visible)visible++;}
    this.stats.plain=visible;this.stats.flat=this.flat?.visible?this.flat.count:0;this.stats.queued=this.queue.length;
  }
  private buildFlat(cx:number,cz:number,distance:number,minHeight:number){
    const buildings:ReturnType<typeof createCityBlockLayout>['buildings']=[],radius=Math.ceil(distance/48)+1;
    for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){
      const bx=cx+dx,bz=cz+dz;if(distanceToChunk(cx*48,cz*48,bx,bz)>distance+48/Math.sqrt(2))continue;
      buildings.push(...createCityBlockLayout(bx,bz).buildings.filter(b=>b.height>=minHeight));
    }
    this.flat?.removeFromParent();this.flat?.dispose();this.flat?.geometry.dispose();this.flat=null;this.flatKeys=[];this.flatMasks=null;
    if(!buildings.length)return;
    const plane=new THREE.PlaneGeometry(1,1);this.flatMasks=new THREE.InstancedBufferAttribute(new Float32Array(buildings.length),1);plane.setAttribute('cityHidden',this.flatMasks);
    const mesh=new THREE.InstancedMesh(plane,this.flatMaterial,buildings.length),matrix=new THREE.Matrix4();mesh.name='city-flat-landmarks';mesh.frustumCulled=false;
    buildings.forEach((b,i)=>{this.flatKeys.push(`${Math.floor(b.x/48+.5)}:${Math.floor(b.z/48+.5)}`);matrix.compose(new THREE.Vector3(b.x,b.height/2,b.z),new THREE.Quaternion(),new THREE.Vector3(Math.max(b.width,b.depth),b.height,1));mesh.setMatrixAt(i,matrix);});
    mesh.instanceMatrix.needsUpdate=true;this.flat=mesh;this.root.add(mesh);
  }
  private build(cx:number,cz:number):THREE.Group {
    const root=new THREE.Group(),geometry:THREE.BufferGeometry[]=[];
    for(const b of createCityBlockLayout(cx,cz).buildings){const g=new THREE.BoxGeometry(b.width+.4,b.height,b.depth+.4);g.translate(b.x,b.height/2,b.z);g.clearGroups();geometry.push(g);}
    const ground=new THREE.BoxGeometry(48,.04,48);ground.translate(cx*48,-.03,cz*48);ground.clearGroups();geometry.push(ground);
    const merged=mergeGeometries(geometry,false)!;geometry.forEach(g=>g.dispose());root.add(new THREE.Mesh(merged,this.materials[Math.abs(cx*3+cz*7)%this.materials.length]));return root;
  }
  dispose(){for(const block of this.blocks.values())block.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.blocks.clear();this.queue=[];this.flat?.dispose();this.flat?.geometry.dispose();this.flatMaterial.dispose();this.materials.forEach(m=>m.dispose());this.root.removeFromParent();delete this.scene.userData.cityHorizonStats;}
}
