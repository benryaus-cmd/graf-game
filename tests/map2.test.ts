import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseRenderSettings } from '../src/game/renderSettings';
import { paintChunkKey, readMapSky, selectMap, saveMapSky } from '../src/game/mapPreference';
import { buildingTierVisibility, distanceToBuilding } from '../src/game/buildingLod';
test('original paint addresses stay compatible while Map 2 art is isolated', () => {
    assert.equal(paintChunkKey('original', '0:0'), '0:0');
    assert.equal(paintChunkKey('map2', '0:0'), 'map2-v1:0:0');
});
test('short and tall handovers overlap by two metres, with a flat fallback when detail is missing', () => {
    const s = normaliseRenderSettings({ heightLod: true, shortDetailDistance: 40, shortProxyDistance: 55, shortFlatDistance: 150, tallDetailDistance: 50, tallProxyDistance: 75, tallFlatDistance: 300 });
    assert.equal(buildingTierVisibility(53, 6, { detail: true, proxy: true }, s).flat, true);
    assert.equal(buildingTierVisibility(52.9, 6, { detail: true, proxy: true }, s).flat, false);
    assert.equal(buildingTierVisibility(73, 20, { detail: true, proxy: true }, s).flat, true);
    assert.equal(buildingTierVisibility(160, 6, { detail: true, proxy: true }, s).flat, false);
    assert.equal(buildingTierVisibility(160, 20, { detail: true, proxy: true }, s).flat, true);
    assert.equal(buildingTierVisibility(5, 6, { detail: false, proxy: false }, s).flat, true);
    assert.equal(distanceToBuilding(14, 0, { x: 0, z: 0, width: 8, depth: 10 }), 10);
});
test('height ranges remain ordered when users enter reversed cutoffs', () => {
    const s = normaliseRenderSettings({ heightLod: true, lodHeightThreshold: 12, shortDetailDistance: 40, shortProxyDistance: 20, shortFlatDistance: 10, tallDetailDistance: 50, tallProxyDistance: 70, tallFlatDistance: 300 });
    assert.equal(s.shortProxyDistance, 40);
    assert.equal(s.shortFlatDistance, 40);
    assert.equal(s.tallFlatDistance, 300);
    assert.equal(s.heightLod, true);
});
import * as THREE from 'three';
import { createCityChunkStream } from '../src/game/cityChunks';
import { setRenderSettings, getRenderSettings, DEFAULT_RENDER_SETTINGS } from '../src/game/renderSettings';
import { QUARTER_LAMPS, QUARTER_BUILDINGS, isInsideBuilding, quarterLayout, quarterFootprint } from '../src/game/morningQuarterLayout';
import { BuildingHorizon } from '../src/game/buildingHorizon';
import { CityAtmosphere, lampActivation } from '../src/game/cityAtmosphere';
import { MorningQuarterAssets } from '../src/game/morningQuarterAssets';
import type { Model } from '../src/game/assetPreview';
import { prepareQuarterChunk } from '../src/game/morningQuarterContent';
import { FIXTURE_FACES } from '../src/game/fixtureBuildingFaces';
import { pointToHit } from '../src/multiplayer/surfaces';
import { QuarterPaintSurfaces } from '../src/game/quarterPaintSurface';
import { selectPaintWorkspaceFace, enterPaintWorkspace, exitPaintWorkspace } from '../src/game/paintWorkspace';
import type { WorldEngine } from '../src/game/worldTypes';
import { disposeChunk } from '../src/game/cityChunkResources';
import { syncPaintVisibility } from '../src/game/cityChunkPaint';
import { isPaintTargetReachable } from '../src/game/paintTargeting';
test('unpainted detail slabs allocate no textures and retain shared geometry across chunk disposal', () => {
    const surfaces=new QuarterPaintSurfaces(), a=new THREE.Group(),b=new THREE.Group();
    const face=[0,1,0,.2,.3,0,0,0,1];
    const one=surfaces.plane(a,face,new THREE.Matrix4(),'one'),two=surfaces.plane(b,face,new THREE.Matrix4(),'two');
    let disposed=0;one.mesh.geometry.addEventListener('dispose',()=>disposed++);
    assert.equal(one.mesh.geometry,two.mesh.geometry);assert.equal(one.textures.length,0);
    const poster=new THREE.Mesh(new THREE.PlaneGeometry(.1,.1),new THREE.MeshBasicMaterial());
    two.mesh.add(poster);assert.equal(two.mesh.visible,true,'a poster on an unpainted slab must render');
    assert.ok(one.layers[0].ensureFace(0));
    disposeChunk({group:a,walls:[one],colliders:[],walkSurfaces:[],staircases:[]},new Set());
    assert.equal(disposed,0);
    assert.ok(two.layers[0].ensureFace(0));
    surfaces.dispose();assert.equal(disposed,1);
});
test('masked premium trim supports rectangular workspace framing while strokes stay on its triangles', () => {
    const surfaces=new QuarterPaintSurfaces(),parent=new THREE.Group(),scene=new THREE.Scene().add(parent);
    // A triangular gable: its bounding rectangle has corners outside the actual mesh.
    const face=[0,1,0,2,2,0,0,0,1,-1,-1,1,-1,0,1];
    const wall=surfaces.plane(parent,face,new THREE.Matrix4().makeScale(2,3,1),'gable');
    const world={scene,renderer:{domElement:{clientWidth:800,clientHeight:600}}} as unknown as WorldEngine;
    try {
        const state=selectPaintWorkspaceFace(world,wall,0,{minU:0,minV:0,maxU:1,maxV:1});
        assert.equal(state.selection!.width,4);assert.equal(state.selection!.height,6);
        enterPaintWorkspace(world);assert.ok(wall.layers[0].ensureFace(0));
        assert.ok(wall.layers[0].mesh.layers.isEnabled(31));
        exitPaintWorkspace(world);assert.equal(wall.layers[0].mesh.layers.isEnabled(31),false);
        scene.updateMatrixWorld(true);
        const ray=new THREE.Raycaster(new THREE.Vector3(1.8,5.8,1),new THREE.Vector3(0,0,-1));
        assert.equal(ray.intersectObject(wall.mesh,false).length,0,'empty gable corners must not accept paint');
        ray.set(new THREE.Vector3(0,2,1),new THREE.Vector3(0,0,-1));
        assert.ok(ray.intersectObject(wall.mesh,false).length);
    } finally {surfaces.dispose();}
});
test('lazy premium paint restoration preserves a hidden layer', () => {
    const surfaces=new QuarterPaintSurfaces();
    const wall=surfaces.plane(new THREE.Group(),[0,0,0,1,1,0,0,0,1],new THREE.Matrix4(),'hidden-layer');
    try {
        syncPaintVisibility(wall,[false]);
        assert.ok(wall.layers[0].ensureFace(0));
        assert.equal(wall.layers[0].mesh.visible,false,'late saved image decoding must not reveal a hidden layer');
    } finally {surfaces.dispose();}
});
const quarterContent = () => {
    const materials = { wallMaterial: new THREE.MeshStandardMaterial(), groundMaterial: new THREE.MeshStandardMaterial(), railMaterial: new THREE.MeshStandardMaterial(), glassMaterial: new THREE.MeshStandardMaterial() };
    const assets = new MorningQuarterAssets(() => new Promise(() => {}));
    const iterator = prepareQuarterChunk(0, 0, materials, assets);
    let result = iterator.next(); while (!result.done) result = iterator.next();
    result.value.group.updateMatrixWorld(true);
    return { content: result.value, assets };
};
test('Map 2 favorite building exposes every actual vertical slab including small bricks', () => {
    const {content, assets} = quarterContent();
    try {
        const hero = content.walls.filter(w => w.mesh.parent?.name === 'square-hero' && w.mesh.userData.fixtureSlab);
        assert.equal(hero.length, FIXTURE_FACES.length);
        const brick = hero.find(w => w.faceDimensions[0].width < .4 && w.faceDimensions[0].height < .4)!;
        assert.ok(brick, 'small trim remains an individual paint target');
        const p = brick.mesh.localToWorld(new THREE.Vector3());
        assert.ok(pointToHit(brick, 0, {x:p.x,y:p.y,z:p.z,pressure:1}));
        assert.equal(brick.contexts[0], null);
        assert.ok(brick.layers[0].ensureFace(0));
    } finally {assets.dispose();}
});
test('Map 2 benches expose the seat top, sides and back to normal paint layers', () => {
    const {content, assets} = quarterContent();
    try {
        const seat = content.walls.find(w => w.mesh.name === 'quarter-bench-seat--8:-11');
        const back = content.walls.find(w => w.mesh.name === 'quarter-bench-back--8:-11');
        assert.ok(seat); assert.ok(back);
        assert.equal(seat.faceDimensions.length,6);
        for (const face of [0,1,2,4,5]) assert.ok(seat.layers[0].ensureFace(face));
        assert.ok(back.layers[0].ensureFace(4));
        const top=new THREE.Vector3(-8,.66,-11),origin=new THREE.Vector3(-8,2,-11);
        assert.equal(isPaintTargetReachable(new THREE.Ray(origin,new THREE.Vector3(0,-1,0)),top,1.34,origin,content.colliders),true,'seat top must not sit inside an oversized collision box');
    } finally {assets.dispose();}
});
test('premium buildings request valid glTF URLs once per style and preserve fallback on failure', async () => {
    const urls:string[]=[];
    const assets=new MorningQuarterAssets(async url=>{urls.push(url);throw Error('offline');});
    const b=QUARTER_BUILDINGS.find(b=>b.asset)!;
    const fallback=new THREE.Group(),parent=new THREE.Group().add(fallback);
    assets.attachPremium(parent,b,fallback);assets.attachPremium(new THREE.Group(),b,new THREE.Group());
    await new Promise(r=>setImmediate(r));
    assert.equal(urls.length,1);
    assert.ok(urls[0].endsWith(`/${b.asset}.gltf`), urls[0]);
    assert.equal(fallback.visible,true);assets.dispose();
});
test('Map 2 adopts night once, enables 60 metre lamps, then remembers a later sky choice', () => {
    const original=globalThis.localStorage;
    const values=new Map<string,string>([['graffciti.map-sky.v1:map2','pastel'],['graffciti.map-render.v1:map2',JSON.stringify({renderScale:.7,fogDensity:.06,streetLights:false})]]);
    globalThis.localStorage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}} as Storage;
    try {
        assert.equal(readMapSky('map2'),'night');selectMap('map2');
        const s=getRenderSettings();assert.equal(s.streetLights,true);assert.equal(s.lampActivationDistance,60);assert.equal(s.lampFadeDistance,0);assert.equal(s.renderScale,.7);
        saveMapSky('map2','pastel');assert.equal(readMapSky('map2'),'pastel');
    } finally {selectMap('original');globalThis.localStorage=original;setRenderSettings({...DEFAULT_RENDER_SETTINGS});}
});
test('night migration preserves the active Map 2 settings over an older map-switch snapshot',()=>{
    const original=globalThis.localStorage,values=new Map<string,string>();
    globalThis.localStorage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}} as Storage;
    try {
        selectMap('map2');
        setRenderSettings({renderScale:.8,fogDensity:.035});
        values.set('graffciti.map-render.v1:map2',JSON.stringify({renderScale:.5,fogDensity:.08}));
        values.delete('graffciti.map2-night.v1');
        assert.equal(readMapSky('map2'),'night');
        assert.equal(getRenderSettings().renderScale,.8);assert.equal(getRenderSettings().fogDensity,.035);
    }finally{selectMap('original');globalThis.localStorage=original;setRenderSettings({...DEFAULT_RENDER_SETTINGS});}
});
test('fixed district lamps stay fully lit through 60m even with a shorter building detail range',()=>{
    const scene=new THREE.Scene(),lights=new CityAtmosphere(scene,[[59,0],[60,0],[61,0]]);
    try {
        const settings=normaliseRenderSettings({streetLights:true,lampPools:true,lampActivationDistance:60,lampFadeDistance:0,detailDistance:40,heightLod:false,fogCull:false});
        lights.update(0,0,[],settings,1000);
        const bulbs=lights.root.children.find(o=>o instanceof THREE.InstancedMesh&&o.geometry.getAttribute('lampFade')&&o.geometry.parameters?.width===.6) as THREE.InstancedMesh;
        const fade=bulbs.geometry.getAttribute('lampFade');assert.deepEqual([fade.getX(0),fade.getX(1),fade.getX(2)],[1,1,0]);assert.equal(lights.stats.lamps,2);assert.equal(lights.lights.length,4);
    } finally {lights.dispose();}
});
test('central building entrances face into the social square',()=>{
    const {content,assets}=quarterContent();
    try {
        for(const [name,wantX]of [['square-west',1],['square-east',-1]] as const){
            const root=content.group.getObjectByName(name)!;
            const forward=new THREE.Vector3(0,0,1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
            // Original east asset has a +90° placement inside its root.
            if(name==='square-east')forward.set(1,0,0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
            assert.ok(forward.x*wantX>.99,name+' entrance points away from the square');
        }
    } finally {assets.dispose();}
});
test('turned buildings keep paint targets, body collisions and LOD footprints aligned',()=>{
    const {content,assets}=quarterContent();
    try {
        for(const name of ['square-west','square-east','alley-nw','alley-sw']) {
            const root=content.group.getObjectByName(name)!;
            const wall=content.walls.find(w=>w.mesh.parent===root&&w.mesh.userData.fixtureSlab)!;
            const expected=root.matrixWorld.clone().multiply(wall.mesh.matrix);
            assert.ok(wall.mesh.matrixWorld.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-8),'static paint matrix must follow its parent');
            const point=wall.mesh.localToWorld(new THREE.Vector3());
            assert.ok(pointToHit(wall,0,{x:point.x,y:point.y,z:point.z,pressure:1}));
            const b=QUARTER_BUILDINGS.find(b=>b.id===name)!;
            const size=quarterFootprint(b), proxy=quarterLayout(0,0).buildings.find(b=>b.id===name)!;
            assert.equal(proxy.width,size.width);assert.equal(proxy.depth,size.depth);
            const roof=content.walkSurfaces.find(s=>s.height===b.height&&Math.abs((s.minX+s.maxX)/2-b.x)<1e-6&&Math.abs((s.minZ+s.maxZ)/2-b.z)<1e-6)!;
            assert.ok(roof);assert.ok(Math.abs(roof.maxX-roof.minX-size.width)<1e-6);assert.ok(Math.abs(roof.maxZ-roof.minZ-size.depth)<1e-6);
            const body=content.colliders.find(c=>Math.abs((c.minX+c.maxX)/2-b.x)<1e-6&&Math.abs((c.minZ+c.maxZ)/2-b.z)<1e-6)!;
            assert.ok(body);
            if(name==='square-west') assert.ok(Math.abs(body.maxX-body.minX-6.3)<1e-6,'long side must turn east/west with the doorway');
            if(name==='alley-nw') assert.ok(Math.abs(body.maxX-body.minX-14.4)<1e-6,'premium inset body must turn with its facade');
        }
    }finally{assets.dispose();}
});
test('permanent lamps cover accessible district ground and retain a bounded real-light pool', () => {
    assert.ok(QUARTER_LAMPS.length >= 50);
    assert.ok(QUARTER_LAMPS.every(([x, z]) => !isInsideBuilding(x, z, .8)));
    for (let x = -68; x <= 68; x += 4)
        for (let z = -68; z <= 68; z += 4) {
            if (isInsideBuilding(x, z, 1))
                continue;
            assert.ok(Math.min(...QUARTER_LAMPS.map(([px, pz]) => Math.hypot(px - x, pz - z))) <= 21, `unlit area ${x},${z}`);
        }
    const scene = new THREE.Scene(), atmosphere = new CityAtmosphere(scene, QUARTER_LAMPS);
    try {
        const s = normaliseRenderSettings({ streetLights: true, lampCount: 4, lampActivationDistance: 48, lampFadeDistance: 8, lampDistance: 40, playerLight: true });
        assert.equal(lampActivation(39, s), 1);
        assert.equal(lampActivation(44, s), .5);
        assert.equal(lampActivation(48, s), 0);
        for (const [x, z] of [[0, 5], [-54, 0], [28, 54], [-53, -36]]) {
            atmosphere.update(x, z, [], s, performance.now() + 1000);
            assert.equal(atmosphere.stats.realLights, 5);
        }
        assert.equal(atmosphere.lights.length, 4);
        assert.ok(atmosphere.lights.every(l => !l.castShadow));
    }
    finally {
        atmosphere.dispose();
    }
});
test('height-mode flat replacements include short original houses below legacy landmark height', () => {
    setRenderSettings({ ...DEFAULT_RENDER_SETTINGS, heightLod: true, fogCull: false, skylineMinHeight: 24 });
    const horizon = new BuildingHorizon('original');
    try {
        horizon.update(0, 0, new Set());
        const flat = horizon.root.getObjectByName('city-height-silhouettes') as THREE.InstancedMesh;
        const mask = flat.geometry.getAttribute('cityHidden'), matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
        let houses = 0;
        for (let i = 0; i < flat.count; i++) {
            flat.getMatrixAt(i, matrix);
            scale.setFromMatrixScale(matrix);
            if (scale.y < 12 && mask.getX(i) === 0)
                houses++;
        }
        assert.ok(houses > 0);
    }
    finally {
        horizon.dispose();
        setRenderSettings({ ...DEFAULT_RENDER_SETTINGS });
    }
});
test('late shared models join an active paint workspace and are released once at world disposal', async () => {
    let resolve!: (model: Model) => void, requests = 0, disposals = 0;
    const source = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    source.add(mesh);
    mesh.geometry.addEventListener('dispose', () => disposals++);
    const assets = new MorningQuarterAssets(() => { requests++; return new Promise(r => { resolve = r; }); });
    const parent = new THREE.Group(), fallback = new THREE.Group(), savedLayers = new Map();
    parent.add(fallback);
    parent.userData.paintWorkspaceState = { active: true, savedLayers };
    const b = QUARTER_BUILDINGS.find(b => b.imported)!;
    const cancel = assets.attachBuilding(parent, b, fallback);
    assets.attachBuilding(new THREE.Group(), b, new THREE.Group());
    resolve({ scene: source, animations: [] });
    await new Promise(r => setImmediate(r));
    assert.equal(requests, 1);
    assert.equal(fallback.visible, false);
    assert.equal(savedLayers.size, 1);
    assert.ok([...savedLayers.keys()].every(m => m.layers.isEnabled(31)));
    cancel();
    assert.equal(disposals, 0);
    assets.dispose();
    assert.equal(disposals, 1);
    assets.dispose();
    assert.equal(disposals, 1);
});
test('Map 2 content stays in nine chunks and has separate paint IDs', () => {
    const scene = new THREE.Scene();
    const materials = { wallMaterial: new THREE.MeshStandardMaterial(), groundMaterial: new THREE.MeshStandardMaterial(), railMaterial: new THREE.MeshStandardMaterial(), glassMaterial: new THREE.MeshStandardMaterial() };
    const stream = createCityChunkStream(scene, materials, 'map2');
    try {
        stream.updateAt(0, 0);
        assert.ok(stream.walls.length > 20);
        assert.ok(stream.walls.every(w => w.surfaceId?.startsWith('ss1:map2-v1:')));
        stream.updateAt(150, 0);
        for (let i = 0; i < 100; i++)
            stream.updateAt(150, 0);
        assert.ok(scene.userData.cityStreamStats.active <= 9);
    }
    finally {
        scene.userData.disposeCity();
        setRenderSettings({ ...DEFAULT_RENDER_SETTINGS });
    }
});

import {readFileSync} from 'node:fs';
test('all original Map 2 V1 wall slots keep their surface addresses before appended premium paint',()=>{const expected=JSON.parse(readFileSync('tests/fixtures/quarter-v1-addresses.json','utf8')) as Record<string,string[]>;const assets=new MorningQuarterAssets(()=>new Promise(()=>{}));const materials={wallMaterial:new THREE.MeshStandardMaterial(),groundMaterial:new THREE.MeshStandardMaterial(),railMaterial:new THREE.MeshStandardMaterial(),glassMaterial:new THREE.MeshStandardMaterial()};try{for(const[key,addresses]of Object.entries(expected)){const[x,z]=key.split(':').map(Number),gen=prepareQuarterChunk(x,z,materials,assets);let step=gen.next();while(!step.done)step=gen.next();assert.deepEqual(step.value.walls.slice(0,addresses.length).map(w=>w.surfaceId),addresses,key);}}finally{assets.dispose();}});
