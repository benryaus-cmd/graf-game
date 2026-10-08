import * as THREE from 'three';
import { loadModel, release, type Model } from './assetPreview';
import { FIXTURE_SCALE, FIXTURE_MODEL_OFFSET, FIXTURE_POSITION } from './fixtureBuildingFaces';
import { createFixtureGrain, applyFixtureGrain } from './fixtureBuildingGrain';
import type { QuarterBuilding } from './morningQuarterLayout';
import type { PaintWorkspaceState } from './worldTypes';
const BUILDING_URL = 'https://raw.githubusercontent.com/benryaus-cmd/graf-game/77b8bb73af715da9dbd691dbddae109316e394fd/public/assets/preview/building.glb';
const TREE_URL = 'https://raw.githubusercontent.com/benryaus-cmd/graf-game/9328c81ea02b53a1f9a07be490164be501e87f25/public/assets/city/tree.gltf';
/** One asset request per world. Chunk copies borrow resources until world teardown. */
export class MorningQuarterAssets {
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
                const x = i % 4 * 128, y = Math.floor(i / 4) * 128;
                ctx.fillStyle = '#eee4cc';
                ctx.fillRect(x, y, 128, 128);
                ctx.fillStyle = '#515e5a';
                ctx.fillRect(x + 6, y + 6, 116, 3);
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const words = name.split(' ');
                ctx.fillText(words.slice(0, -1).join(' '), x + 64, y + 51);
                ctx.fillText(words.at(-1)!, x + 64, y + 75);
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
            ctx.fillStyle = '#8b8982';
            ctx.fillRect(0, 0, 256, 256);
            const rect = (color: string, x: number, z: number, w: number, d: number) => { ctx.fillStyle = color; ctx.fillRect((x - w / 2 - cx * 48 + 24) * 256 / 48, (z - d / 2 - cz * 48 + 24) * 256 / 48, w * 256 / 48, d * 256 / 48); };
            rect('#c9bbb0', 0, 0, 24, 24);
            rect('#b7b9a7', 28, 54, 22, 24);
            rect('#aaa699', -52, 0, 24, 22);
            for (const [x, z, w, d] of [[0, -32, 132, 5], [-36, 4, 4.5, 85], [37, 7, 4.5, 86], [0, 36, 125, 4.5], [-50, 0, 32, 4], [42, 0, 32, 4]])
                rect('#b8b0a4', x, z, w, d);
            rect('#b1ac9a', -53, -36, 17, 8);
            rect('#e3d7c6', -53, -36, 14, .12);
            rect('#e3d7c6', -53, -36, .12, 6);
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
    label(parent: THREE.Object3D, index: number, x: number, y: number, z: number, width = 2.4) {
        const geometry = new THREE.PlaneGeometry(width, .8), uv = geometry.getAttribute('uv'), column = index % 4, row = Math.floor(index / 4);
        for (let i = 0; i < uv.count; i++)
            uv.setXY(i, (column + uv.getX(i)) / 4, 1 - (row + 1 - uv.getY(i)) / 4);
        const mesh = new THREE.Mesh(geometry, this.signs);
        mesh.position.set(x, y, z);
        mesh.userData.sharedMapMaterial = true;
        parent.add(mesh);
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
        release(m.scene); this.sources = []; this.grain.dispose(); this.signs.map?.dispose(); this.signs.dispose(); }
}
