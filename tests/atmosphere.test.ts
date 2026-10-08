import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { normaliseRenderSettings, DEFAULT_RENDER_SETTINGS, setRenderSettings } from '../src/game/renderSettings';
import { addConcreteStreetLamp } from '../src/game/cityStreetLamps';
import { CityAtmosphere, fogVisualDistance } from '../src/game/cityAtmosphere';
import { applySkyLighting } from '../src/game/skyEffects';

test('atmosphere controls migrate old settings and validate fog, image and light budgets',()=>{
 const defaults=normaliseRenderSettings({renderScale:.7});
 assert.equal(defaults.groundChunks,6);assert.equal(defaults.imageLoadDistance,60);
 assert.equal(defaults.streetLights,true);assert.equal(defaults.playerLight,false);
 const input=normaliseRenderSettings({fogStyle:'linear',fogNear:80,fogFar:20,imageConcurrency:99,lampCount:9,skyMode:'invalid',fogColor:'bad'});
 assert.ok(input.fogFar>input.fogNear);assert.equal(input.imageConcurrency,7);assert.equal(input.lampCount,4);
 assert.equal(input.skyMode,'game');assert.equal(input.fogColor,DEFAULT_RENDER_SETTINGS.fogColor);
});

test('ground extends beyond resident chunks and follows travel without replacing resources',()=>{
 const scene=new THREE.Scene(),atmosphere=new CityAtmosphere(scene),settings={...DEFAULT_RENDER_SETTINGS,groundChunks:8};
 try{
  atmosphere.update(0,0,[],settings,0);assert.equal(atmosphere.ground.scale.x,768);assert.equal(atmosphere.ground.scale.y,768);
  const geometry=atmosphere.ground.geometry;
  atmosphere.update(240,144,[],settings,1000);assert.equal(atmosphere.ground.position.x,240);assert.equal(atmosphere.ground.position.z,144);assert.equal(atmosphere.ground.geometry,geometry);
  assert.equal(atmosphere.ground.position.y,-.055);assert.equal(atmosphere.ground.userData.mapGroundPaintSurface,undefined);
 }finally{atmosphere.dispose();assert.equal(scene.children.length,0);}
});

test('lamp experiments keep the light pool bounded and support glow-only and player-light modes',()=>{
 const scene=new THREE.Scene(),atmosphere=new CityAtmosphere(scene);
 try{
  const settings={...DEFAULT_RENDER_SETTINGS,lampCount:2,playerLight:false};atmosphere.update(0,0,[],settings,0);
  assert.equal(atmosphere.lights.filter(light=>light.visible).length,2);assert.equal(atmosphere.playerLight.visible,false);assert.ok(atmosphere.stats.lamps>=4);
  const ids=atmosphere.lights.map(light=>light.uuid);atmosphere.update(96,0,[],settings,1000);assert.deepEqual(atmosphere.lights.map(light=>light.uuid),ids);
  atmosphere.update(96,0,[],{...settings,lampCount:0,playerLight:true},1200,32);assert.equal(atmosphere.playerLight.position.y,32.5);assert.equal(atmosphere.lights.filter(light=>light.visible).length,0);assert.equal(atmosphere.playerLight.visible,true);
  assert.ok([...atmosphere.lights,atmosphere.playerLight].every(light=>!light.castShadow));
 }finally{atmosphere.dispose();}
});

test('fog culling retains corner padding and can be disabled without changing requested detail range',()=>{
 const linear={...DEFAULT_RENDER_SETTINGS,fogStyle:'linear' as const,fogFar:40};assert.equal(fogVisualDistance(linear),72);
 assert.ok(fogVisualDistance({...linear,fogStyle:'exp',fogDensity:.1})<50);
 const wide=new THREE.PerspectiveCamera(76,844/390,.1,1000);
 assert.ok(fogVisualDistance(linear,wide)>40*Math.sqrt(1+Math.tan(38*Math.PI/180)**2*(1+wide.aspect**2))-.001);
 assert.equal(fogVisualDistance(linear,new THREE.OrthographicCamera()),Infinity);
 assert.equal(fogVisualDistance({...linear,fogCull:false}),Infinity);
 assert.equal(fogVisualDistance({...linear,fogStyle:'exp',fogDensity:0}),Infinity);
});

test('solid haze sky preserves the literal fog colour through exposure changes',()=>{
 const context={fillStyle:'',fillRect:()=>{}};
 const world:any={scene:new THREE.Scene(),skyCanvas:{width:16,height:8,getContext:()=>context},skyTexture:{},skyDome:new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial({toneMapped:false})),hemisphereLight:new THREE.HemisphereLight(),sunLight:new THREE.DirectionalLight(),cloudMesh:new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),cloudGroup:new THREE.Group(),rain:new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial())};
 try{
  setRenderSettings({...DEFAULT_RENDER_SETTINGS,flatSky:true,skyMode:'night',exposure:2,customFog:true,fogColor:'#111b2c'});applySkyLighting(world,'day');
  assert.equal(context.fillStyle,'#111b2c');assert.equal(world.scene.fog.color.getHexString(),'111b2c');
  assert.equal(world.skyDome.material.toneMapped,false);
 }finally{setRenderSettings({...DEFAULT_RENDER_SETTINGS});}
});

test('street lamps supply merged geometry and a light anchor instead of an unbounded point light',()=>{
 const group=new THREE.Group(),colliders:any[]=[];addConcreteStreetLamp(group,3,7,colliders);
 const lights:THREE.Light[]=[],meshes:THREE.Mesh[]=[];
 group.traverse(object=>{if(object instanceof THREE.Light)lights.push(object);if(object instanceof THREE.Mesh)meshes.push(object);});
 assert.equal(lights.length,0);assert.equal(meshes.length,2);
 assert.deepEqual(group.userData.lampAnchors[0].position.toArray(),[3.82,5.35,7]);
 assert.equal(colliders.length,1);
});
