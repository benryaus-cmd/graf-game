import * as THREE from 'three';
import { loadModel, release, type Model } from './assetPreview';
import { FIXTURE_SCALE, FIXTURE_MODEL_OFFSET, FIXTURE_POSITION } from './fixtureBuildingFaces';
import { createFixtureGrain, applyFixtureGrain } from './fixtureBuildingGrain';
import { QUARTER_PAVING, type QuarterBuilding } from './morningQuarterLayout';
import type { PaintWorkspaceState } from './worldTypes';
import { QuarterPaintSurfaces } from './quarterPaintSurface';
import { QUARTER_ASSETS, type QuarterAssetKind } from './quarterBuildingAssets';
import { getRenderSettings } from './renderSettings';
const BUILDING_URL = 'https://raw.githubusercontent.com/benryaus-cmd/graf-game/77b8bb73af715da9dbd691dbddae109316e394fd/public/assets/preview/building.glb';
const TREE_URL = 'https://raw.githubusercontent.com/benryaus-cmd/graf-game/9328c81ea02b53a1f9a07be490164be501e87f25/public/assets/city/tree.gltf';
/** One asset request per world. Chunk copies borrow resources until world teardown. */
export class MorningQuarterAssets {
    readonly paint = new QuarterPaintSurfaces();
    private premium = new Map<QuarterAssetKind, Promise<Model>>();
    private premiumMaterials = new Map<string,THREE.MeshStandardMaterial>();
    private night = {value:0};
    updateLights(sky:string){const s=getRenderSettings();this.night.value=s.streetLights&&(s.skyMode==='night'||s.skyMode==='game'&&sky==='night')?1:0;}
    readonly grain = createFixtureGrain();
    readonly signs = this.createSigns();
    constructor(private load: typeof loadModel = loadModel) { }
    private request = new AbortController();
    private closed = false;
    private building: Promise<Model> | null = null;
    private tree: Promise<Model> | null = null;
    private sources: Model[] = [];
    private detach = new Set<() => void>();
    private createSigns() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx && typeof ctx.fillText === 'function') {
            ['EARLY BIRD', 'CORNER STORE', 'COLOUR CLUB', 'THE RECORD ROOM', 'QUARTER HOUSE', 'THE POTTERY', 'MORNING CAFE', 'PRINT SHOP', 'PAINT YARD', 'TREE COURT', 'MORNING QUARTER'].forEach((name, i) => {
                const x = i % 2 * 256, y = Math.floor(i / 2) * 64;
                ctx.fillStyle = '#eee4cc';
                ctx.fillRect(x, y, 256, 64);
                ctx.fillStyle = '#515e5a';
                ctx.fillRect(x + 8, y + 5, 240, 2);
                ctx.font = 'bold 22px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(name, x + 128, y + 35, 236);
            });
        }
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshBasicMaterial({ map, toneMapped: false });
    }
    groundMaterial(cx: number, cz: number) {
        // Bake paving into the existing floor: paint and posters stay above every path.
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#365f38';
            ctx.fillRect(0, 0, 256, 256);
            const rect = (color: string, x: number, z: number, w: number, d: number) => { ctx.fillStyle = color; ctx.fillRect((x - w / 2 - cx * 48 + 24) * 256 / 48, (z - d / 2 - cz * 48 + 24) * 256 / 48, w * 256 / 48, d * 256 / 48); };
            // Paths and aprons are baked into the same paintable floor, without extra meshes.
            for (const [x, z, w, d] of QUARTER_PAVING) rect('#b8b0a4', x, z, w, d);
            rect('#c9bbb0', 0, 0, 24, 24);
            rect('#c7c1b1', 28, 54, 22, 24);
            rect('#aaa699', -52, 0, 24, 22);
            // Draw seams only inside paving. They never turn a lawn into a walkway.
            ctx.strokeStyle = 'rgba(74,67,62,.16)'; ctx.lineWidth = .6;
            ctx.save(); ctx.beginPath();
            for (const [x,z,w,d] of QUARTER_PAVING) ctx.rect((x-w/2-cx*48+24)*256/48,(z-d/2-cz*48+24)*256/48,w*256/48,d*256/48);
            ctx.clip();
            for (let i = 0; i <= 256; i += 16) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(256,i); ctx.stroke(); }
            ctx.restore();
            rect('#78878a', -53, -36, 17, 10);
            const px = (x:number) => (x-cx*48+24)*256/48, pz = (z:number) => (z-cz*48+24)*256/48;
            ctx.strokeStyle='#eee5cd'; ctx.lineWidth=.9;
            ctx.strokeRect(px(-61),pz(-40.5),16*256/48,9*256/48);
            ctx.strokeRect(px(-55),pz(-40.5),4*256/48,4.5*256/48);
            ctx.beginPath(); ctx.arc(px(-53),pz(-40),5.5*256/48,0,Math.PI); ctx.stroke();
            ctx.fillStyle = 'rgba(45,42,36,.045)';
            let seed = (cx + 3) * 73 + (cz + 3) * 123;
            for (let i = 0; i < 1200; i++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                ctx.fillRect(seed % 256, (seed >>> 8) % 256, 1, 1);
            }
        }
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        map.repeat.set(1 / 8, 1 / 8);
        return new THREE.MeshStandardMaterial({ map, color: '#ffffff', roughness: 1, side: THREE.DoubleSide });
    }
    label(parent: THREE.Object3D, index: number, x: number, y: number, z: number, width = 2.4, height = .8) {
        const geometry = new THREE.PlaneGeometry(width, height), uv = geometry.getAttribute('uv'), column = index % 2, row = Math.floor(index / 2);
        for (let i = 0; i < uv.count; i++)
            uv.setXY(i, (column + uv.getX(i)) / 2, 1 - (row + 1 - uv.getY(i)) / 8);
        const mesh = new THREE.Mesh(geometry, this.signs);
        mesh.position.set(x, y, z);
        mesh.userData.sharedMapMaterial = true;
        mesh.name = 'quarter-sign';
        parent.add(mesh);
        return mesh;
    }
    shopSignMount(b: QuarterBuilding) {
        const kind = b.asset!;
        // Coordinates are in each centred asset, above its actual ground-floor door.
        const mount: Record<QuarterAssetKind, [number, number]> = { '1Story_Sign':[1.25,1.04], '2Story_Balcony':[1.02,.84], '2Story_Wide':[1.08,.72], '2Story_GableRoof':[1.10,1.04], '3Story_Small':[1.06,.90] };
        const [y,z]=mount[kind], size=QUARTER_ASSETS[kind].size;
        return { x:b.x, y:y*b.height/size[1], z:b.z+z*b.depth/size[2], width:kind==='1Story_Sign'?5.2:3.6, height:.65 };
    }
    private source(kind: 'building' | 'tree') {
        if (this[kind])
            return this[kind]!;
        this[kind] = this.load(kind === 'building' ? BUILDING_URL : TREE_URL, this.request.signal).then(model => {
            if (this.closed) {
                release(model.scene);
                throw Error('Map closed');
            }
            this.sources.push(model);
            if (kind === 'building')
                model.scene.traverse(o => { if (o instanceof THREE.Mesh)
                    for (const m of Array.isArray(o.material) ? o.material : [o.material])
                        if (m instanceof THREE.MeshStandardMaterial)
                            applyFixtureGrain(m, this.grain, { value: 1 }); });
            return model;
        });
        return this[kind]!;
    }
    attachPremium(parent: THREE.Group, b: QuarterBuilding, fallback: THREE.Object3D, legacy?: THREE.Mesh) {
        const kind = b.asset!;
        let live = true, visual: THREE.Object3D | null = null;
        const oldRaycast = legacy?.raycast;
        const cancel = () => {live=false;visual?.removeFromParent();if(legacy && oldRaycast)legacy.raycast=oldRaycast;this.detach.delete(cancel);};
        this.detach.add(cancel);
        let source = this.premium.get(kind);
        if (!source) {
            source = this.load(`https://raw.githubusercontent.com/benryaus-cmd/graf-game/826fc2b1caa41c48cd338a665a5693444c4c9b81/public/assets/quarter/${kind}.gltf`, this.request.signal).then(model=>{
                if(this.closed){release(model.scene);throw Error('Map closed');}
                this.sources.push(model);
                model.scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial)applyFixtureGrain(m,this.grain,{value:1});});
                return model;
            });
            this.premium.set(kind,source);
        }
        void source.then(model=>{
            if(!live||this.closed)return;
            const description=QUARTER_ASSETS[kind],pivot=new THREE.Group();pivot.position.set(b.x,0,b.z);
            pivot.scale.set(b.width/description.size[0],b.height/description.size[1],b.depth/description.size[2]);
            visual=model.scene.clone(true);visual.position.fromArray(description.offset);visual.name=`quarter-import-${kind}`;pivot.add(visual);visual=pivot;
            visual.traverse(o=>{if(o instanceof THREE.Mesh){
                const tintMaterial=(original:THREE.Material)=>{
                    if(!(original instanceof THREE.MeshStandardMaterial))return original;
                    const key=`${original.uuid}:${b.color}`;let material=this.premiumMaterials.get(key);
                    if(!material){material=original.clone();applyFixtureGrain(material,this.grain,{value:1});const grainShader=material.onBeforeCompile;
                        const tint=new THREE.Color(b.color);tint.multiplyScalar(1/(.2126*tint.r+.7152*tint.g+.0722*tint.b));
                        material.onBeforeCompile=(shader,renderer)=>{grainShader(shader,renderer);shader.uniforms.fixtureConcreteTint.value.copy(tint);shader.uniforms.quarterNight=this.night;
                            shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
#ifdef USE_MAP
float quarterWindow = step(sampledDiffuseColor.r * 1.18, sampledDiffuseColor.b) * step(sampledDiffuseColor.r * 1.08, sampledDiffuseColor.g);
totalEmissiveRadiance += vec3(1.0, .56, .22) * quarterWindow * quarterNight;
#endif`).replace('#include <common>','#include <common>\nuniform float quarterNight;');};
                        material.customProgramCacheKey=()=> 'quarter-grain-window-v1';this.premiumMaterials.set(key,material);
                    }return material;
                };
                o.material=Array.isArray(o.material)?o.material.map(tintMaterial):tintMaterial(o.material);
                o.userData.sharedMapAsset=true;const workspace=parent.userData.paintWorkspaceState as PaintWorkspaceState|undefined;if(workspace?.active&&workspace.savedLayers){workspace.savedLayers.set(o,o.layers.isEnabled(31));o.layers.enable(31);}}});
            parent.add(visual);fallback.visible=false;if(legacy)legacy.raycast=()=>{};
        }).catch(()=>{});
        return cancel;
    }
    attachBuilding(parent: THREE.Group, b: QuarterBuilding, fallback: THREE.Object3D) {
        let live = true, visual: THREE.Group | null = null;
        const cancel = () => { live = false; visual?.removeFromParent(); this.detach.delete(cancel); };
        this.detach.add(cancel);
        void this.source('building').then(model => {
            if (!live || this.closed)
                return;
            visual = model.scene.clone(true);
            visual.name = 'quarter-quaternius-building';
            visual.scale.setScalar(FIXTURE_SCALE);
            visual.position.set(FIXTURE_MODEL_OFFSET[0], FIXTURE_MODEL_OFFSET[1], FIXTURE_MODEL_OFFSET[2] - FIXTURE_POSITION.z);
            const pivot = new THREE.Group();
            pivot.position.set(b.x, 0, b.z);
            pivot.rotation.y = b.yaw ?? 0;
            pivot.add(visual);
            visual = pivot;
            visual.traverse(o => { if (o instanceof THREE.Mesh) {
                o.userData.sharedMapAsset = true;
                const workspace = parent.userData.paintWorkspaceState as PaintWorkspaceState | undefined;
                if (workspace?.active && workspace.savedLayers) {
                    workspace.savedLayers.set(o, o.layers.isEnabled(31));
                    o.layers.enable(31);
                }
            } });
            parent.add(visual);
            fallback.visible = false;
        }).catch(() => { });
        return cancel;
    }
    attachTrees(parent: THREE.Group, positions: readonly [
        number,
        number
    ][], fallback: THREE.Object3D) {
        let live = true, visual: THREE.Group | null = null;
        const cancel = () => { live = false; if (visual) {
            visual.traverse(o => { if (o instanceof THREE.InstancedMesh)
                o.dispose(); });
            visual.removeFromParent();
        } this.detach.delete(cancel); };
        this.detach.add(cancel);
        void this.source('tree').then(model => {
            if (!live || this.closed)
                return;
            const bounds = new THREE.Box3().setFromObject(model.scene), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
            if (!(size.y > 0))
                return;
            visual = new THREE.Group();
            visual.name = 'quarter-quaternius-trees';
            model.scene.updateMatrixWorld(true);
            model.scene.traverse(o => {
                if (!(o instanceof THREE.Mesh))
                    return;
                const mesh = new THREE.InstancedMesh(o.geometry, o.material, positions.length), scale = 4.8 / size.y;
                positions.forEach(([x, z], i) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * .7), new THREE.Vector3(scale, scale, scale)); m.multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z)).multiply(o.matrixWorld); mesh.setMatrixAt(i, m); });
                mesh.computeBoundingSphere();
                mesh.userData.sharedMapAsset = true;
                visual!.add(mesh);
            });
            parent.add(visual);
            fallback.visible = false;
        }).catch(() => { });
        return cancel;
    }
    dispose() { if (this.closed)
        return; this.closed = true; this.request.abort(); for (const cancel of [...this.detach])
        cancel(); for (const m of this.sources)
        release(m.scene); this.sources = []; for(const m of this.premiumMaterials.values())m.dispose();this.premiumMaterials.clear(); this.paint.dispose(); this.grain.dispose(); this.signs.map?.dispose(); this.signs.dispose(); }
}
