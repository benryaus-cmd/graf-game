import * as THREE from 'three';
import { getRenderSettings, MAX_STREET_LIGHTS, type RenderSettings } from './renderSettings';

/** Visual reach only: no colliders, paint surfaces, texture requests or shadows. */
export function fogVisualDistance(settings:RenderSettings,camera?:THREE.Camera):number {
  if(!settings.fogCull||camera&&!(camera instanceof THREE.PerspectiveCamera))return Infinity;
  // Three fog uses view depth; retain the full corner ray on wide screens too.
  const tangent=camera instanceof THREE.PerspectiveCamera?Math.tan(camera.fov*Math.PI/360)/camera.zoom:0;
  const padding=camera instanceof THREE.PerspectiveCamera?Math.max(1.8,Math.sqrt(1+tangent*tangent*(1+camera.aspect*camera.aspect))):1.8;
  return settings.fogStyle==='linear'?settings.fogFar*padding:settings.fogDensity>0?Math.sqrt(-Math.log(.002))/settings.fogDensity*padding:Infinity;
}

export function lampActivation(distance:number,settings:RenderSettings):number {const end=settings.lampActivationDistance,fade=Math.min(end,settings.lampFadeDistance);return distance>end?0:fade>0?Math.min(1,(end-distance)/fade):1;}

export class CityAtmosphere {
  readonly root=new THREE.Group();readonly ground:THREE.Mesh;
  readonly lights:THREE.PointLight[]=[];
  readonly playerLight=new THREE.PointLight('#ffead0',0,10,2);
  private poles:THREE.InstancedMesh;private heads:THREE.InstancedMesh;private bulbs:THREE.InstancedMesh;private pools:THREE.InstancedMesh;
  private extra:THREE.Vector3[]=[];private signature='';private nextUpdate=0;
  readonly stats={lamps:0,realLights:0,groundReach:0};
  constructor(private scene:THREE.Scene,private layout?:readonly [number,number][]){
    this.root.name='city-atmosphere';scene.add(this.root);scene.userData.cityAtmosphereStats=this.stats;
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:'#8b8982',roughness:1}));
    this.ground.name='city-ground-extension';this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.055;this.ground.frustumCulled=false;this.root.add(this.ground);
    this.poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.11,.16,5.4,5),new THREE.MeshStandardMaterial({color:'#77796e',roughness:1}),128);
    this.heads=new THREE.InstancedMesh(new THREE.BoxGeometry(.8,.16,.45),new THREE.MeshStandardMaterial({color:'#65695e',roughness:1}),128);
    this.bulbs=new THREE.InstancedMesh(new THREE.PlaneGeometry(.6,.3),new THREE.MeshBasicMaterial({color:'#ffe3a3',side:THREE.DoubleSide,transparent:true,depthWrite:false}),128);
    const bulbFade=new THREE.InstancedBufferAttribute(new Float32Array(128),1);this.bulbs.geometry.setAttribute('lampFade',bulbFade);
    (this.bulbs.material as THREE.MeshBasicMaterial).onBeforeCompile=shader=>{shader.vertexShader='attribute float lampFade;\nvarying float vLampFade;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLampFade=lampFade;');shader.fragmentShader='varying float vLampFade;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a *= vLampFade;\n#include <alphatest_fragment>');};
    const poolMaterial=new THREE.MeshBasicMaterial({color:'#ffc76f',transparent:true,opacity:.48,toneMapped:false,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    poolMaterial.onBeforeCompile=shader=>{shader.vertexShader='attribute float lampFade;\nvarying float vLampFade;\nvarying vec2 lampUv;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n lampUv=uv; vLampFade=lampFade;');shader.fragmentShader='varying float vLampFade;\nvarying vec2 lampUv;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a *= vLampFade * pow(max(0.0,1.0-length(lampUv-.5)*2.0),2.0);\n#include <alphatest_fragment>');};
    poolMaterial.customProgramCacheKey=()=> 'graffciti-lamp-pool-v1';
    this.pools=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),poolMaterial,128);this.pools.geometry.setAttribute('lampFade',new THREE.InstancedBufferAttribute(new Float32Array(128),1));this.pools.renderOrder=2;
    for(const mesh of [this.poles,this.heads,this.bulbs,this.pools]){mesh.frustumCulled=false;this.root.add(mesh);}
    for(const light of [...this.lights,this.playerLight]){light.castShadow=false;scene.add(light);}
  }
  update(x:number,z:number,anchors:{position:THREE.Vector3;bulbMaterial:THREE.MeshStandardMaterial}[],settings=getRenderSettings(),now=performance.now(),playerY=1.7,camera?:THREE.Camera){
    const cx=Math.floor(x/48+.5),cz=Math.floor(z/48+.5);
    const signature=`${cx}:${cz}:${settings.groundChunks}:${settings.detailDistance}:${settings.fogDensity}:${settings.fogStyle}:${settings.fogFar}:${settings.fogCull}:${settings.streetLights}:${settings.lampRadius}:${settings.lampActivationDistance}:${settings.lampFadeDistance}:${anchors.length}:${settings.heightLod}:${settings.shortDetailDistance}:${settings.tallDetailDistance}`;
    const changed=signature!==this.signature;
    const reach=settings.groundChunks*48;this.ground.visible=settings.groundExtension;this.ground.scale.set(reach*2,reach*2,1);this.ground.position.x=cx*48;this.ground.position.z=cz*48;
    (this.ground.material as THREE.MeshStandardMaterial).color.set(settings.groundColor);this.stats.groundReach=reach;
    const detailReach=settings.heightLod?Math.max(settings.shortDetailDistance,settings.tallDetailDistance):settings.detailDistance;
    const limit=Math.max(settings.lampActivationDistance,Math.min(detailReach,fogVisualDistance(settings,camera)));
    if(changed||now>=this.nextUpdate){
      this.signature=signature;this.nextUpdate=now+200;this.extra=[];const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion();let i=0;
      const positions=this.layout??Array.from({length:9},(_,k)=>[cx+Math.floor(k/3)-1,cz+k%3-1]).flatMap(([bx,bz])=>[[-8,0],[8,0],[0,-8],[0,8]].map(([ox,oz])=>[bx*48+ox,bz*48+oz]));
      for(const [px,pz] of positions.slice(0,128)){
        const distance=Math.hypot(px-x,pz-z),visible=distance<=limit,scale=visible?1:0;
        matrix.compose(new THREE.Vector3(px,2.7,pz),rotation,new THREE.Vector3(scale,scale,scale));this.poles.setMatrixAt(i,matrix);
        matrix.compose(new THREE.Vector3(px,5.4,pz),rotation,new THREE.Vector3(scale,scale,scale));this.heads.setMatrixAt(i,matrix);
        matrix.compose(new THREE.Vector3(px,5.3,pz),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),new THREE.Vector3(scale,scale,scale));this.bulbs.setMatrixAt(i,matrix);
        (this.bulbs.geometry.getAttribute('lampFade') as THREE.InstancedBufferAttribute).setX(i,lampActivation(distance,settings));
        if(visible)this.extra.push(new THREE.Vector3(px,5.25,pz));i++;
      }
      for(const mesh of [this.poles,this.heads,this.bulbs]){mesh.count=i;mesh.instanceMatrix.needsUpdate=true;}
      (this.bulbs.geometry.getAttribute('lampFade') as THREE.InstancedBufferAttribute).needsUpdate=true;
    }
    this.bulbs.visible=settings.streetLights;this.pools.visible=settings.streetLights&&settings.lampPools;
    const positions=[...this.extra,...anchors.map(anchor=>anchor.position)].filter(p=>Math.hypot(p.x-x,p.z-z)<=limit);
    for(const anchor of anchors)anchor.bulbMaterial.emissiveIntensity=settings.streetLights?2.8*lampActivation(Math.hypot(anchor.position.x-x,anchor.position.z-z),settings):0;
    const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
    this.pools.count=Math.min(128,positions.length);
    positions.slice(0,128).forEach((p,i)=>{matrix.compose(new THREE.Vector3(p.x,this.layout?.02:.016,p.z),rotation,new THREE.Vector3(settings.lampRadius*2,settings.lampRadius*2,1));this.pools.setMatrixAt(i,matrix);(this.pools.geometry.getAttribute('lampFade') as THREE.InstancedBufferAttribute).setX(i,lampActivation(Math.hypot(p.x-x,p.z-z),settings));});
    this.pools.instanceMatrix.needsUpdate=true;(this.pools.geometry.getAttribute('lampFade') as THREE.InstancedBufferAttribute).needsUpdate=true;
    positions.sort((a,b)=>(a.x-x)**2+(a.z-z)**2-(b.x-x)**2-(b.z-z)**2);
    // Grow only as requested and needed; reuse inactive slots when the count falls.
    // Player distance controls activation. lampDistance only controls illumination reach.
    const candidates=positions.filter(p=>lampActivation(Math.hypot(p.x-x,p.z-z),settings)>0);
    const count=settings.streetLights?Math.min(MAX_STREET_LIGHTS,settings.lampCount,candidates.length):0;
    while(this.lights.length<count){const light=new THREE.PointLight('#ffd18a',0,settings.lampDistance,2);light.castShadow=false;light.visible=false;this.scene.add(light);this.lights.push(light);}
    let real=0;
    this.lights.forEach((light,i)=>{const p=candidates[i];light.visible=i<count;light.distance=settings.lampDistance;
      light.intensity=light.visible?settings.lampIntensity*lampActivation(Math.hypot(p.x-x,p.z-z),settings):0;
      if(light.visible)light.position.copy(p);if(light.visible&&light.intensity)real++;
    });
    this.playerLight.visible=settings.playerLight;this.playerLight.intensity=settings.playerLightIntensity;this.playerLight.position.set(x,playerY+.5,z);
    this.stats.lamps=positions.length;this.stats.realLights=real+Number(settings.playerLight);
  }
  dispose(){this.root.traverse(object=>{if(!(object instanceof THREE.Mesh))return;if(object instanceof THREE.InstancedMesh)object.dispose();object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());});this.root.removeFromParent();for(const light of [...this.lights,this.playerLight])light.removeFromParent();delete this.scene.userData.cityAtmosphereStats;}
}
