import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createPaintWall } from './architectureWalls';
import { createChunkGround, type CityMaterials } from './cityStructures';
import type { CityChunkContent } from './cityChunkContent';
import { quarterLayout, quarterChunk, QUARTER_TREES, QUARTER_LAMPS, type QuarterBuilding } from './morningQuarterLayout';
import { MorningQuarterAssets } from './morningQuarterAssets';
import { assignSurfaceIds } from '../multiplayer/surfaces';
import { applyFixtureGrain } from './fixtureBuildingGrain';
import { getRenderSettings } from './renderSettings';
import { FIXTURE_FACES, FIXTURE_POSITION } from './fixtureBuildingFaces';
import { QUARTER_ASSETS } from './quarterBuildingAssets';
import type { PaintWall } from './worldTypes';
export interface DetailBuilding {
    description: QuarterBuilding;
    root: THREE.Group;
}
export function* prepareQuarterChunk(cx: number, cz: number, materials: CityMaterials, assets: MorningQuarterAssets): Generator<CityChunkContent, CityChunkContent, void> {
    const group = new THREE.Group();
    group.name = `morning-quarter-${cx}:${cz}`;
    const content: CityChunkContent = { group, walls: [], colliders: [], walkSurfaces: [], staircases: [] };
    content.walls.push(createChunkGround(group, cx * 48, cz * 48, assets.groundMaterial(cx, cz)));
    const buildings: DetailBuilding[] = [];
    group.userData.detailBuildings = buildings;
    const batches = new Map<string, THREE.BufferGeometry[]>();
    const cancels: (() => void)[] = [];
    const windows: THREE.MeshStandardMaterial[] = [];
    const extras: PaintWall[] = [];
    const extraBuilders: (() => Generator<PaintWall, void, void>)[] = [];
    const box = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => { const g = new THREE.BoxGeometry(w, h, d); g.clearGroups(); g.translate(x, y, z); if (!batches.has(color))
        batches.set(color, []); batches.get(color)!.push(g); };
    const prop = (color: string, x: number, y: number, z: number, w: number, h: number, d: number) => { if (quarterChunk(x, z) === `${cx}:${cz}`)
        box(color, x, y, z, w, h, d); };
    const collider = (x: number, z: number, w: number, d: number, h: number) => content.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: h });
    // Parts use shared grain, and are owned by this chunk except for borrowed imported visuals.
    group.userData.disposeFixture = () => { for (const cancel of cancels)
        cancel(); };
    yield content;
    for (const b of quarterLayout(cx, cz).buildings) {
        const root = new THREE.Group();
        root.name = b.id;
        group.add(root);
        buildings.push({ description: b, root });
        const wallMaterial = new THREE.MeshStandardMaterial({ color: b.color, roughness: 1 });
        applyFixtureGrain(wallMaterial, assets.grain, { value: 1 }, true);
        content.walkSurfaces.push({ minX: b.x - b.width / 2, maxX: b.x + b.width / 2, minZ: b.z - b.depth / 2, maxZ: b.z + b.depth / 2, height: b.height });
        if (b.imported) {
            // Keep the ten V1 facade addresses, then append every small brick and trim face.
            // Canvases are allocated only when a surface is painted.
            const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw ?? 0);
            const fallback = new THREE.Mesh(new THREE.BoxGeometry(3.1, b.height, 6.7), wallMaterial);
            fallback.position.set(b.x, b.height / 2, b.z);
            fallback.quaternion.copy(yaw);
            root.add(fallback);
            const transform = new THREE.Matrix4().compose(new THREE.Vector3(b.x,0,b.z),yaw,new THREE.Vector3(1,1,1));
            const slab = (f: readonly number[]) => {
                const wall=assets.paint.plane(root,[f[0],f[1],f[2]-FIXTURE_POSITION.z,...f.slice(3)],transform,`quarter-slab-${b.id}`);
                // Equivalent quaternion signs still hash differently: keep the original V1 representation.
                wall.mesh.quaternion.copy(yaw).multiply(new THREE.Quaternion(f[5],f[6],f[7],f[8]).normalize());
                wall.faceDimensions[0]={width:f[3],height:f[4]};
                return wall;
            };
            // Preserve all ten V1 addresses; append small bricks after every legacy wall slot.
            for (const f of FIXTURE_FACES.filter(f => f[3]*f[4]>=4)) content.walls.push(slab(f));
            extraBuilders.push(function*(){for(const f of FIXTURE_FACES.filter(f=>f[3]*f[4]<4))yield slab(f);});
            collider(b.x, b.z, b.yaw ? 6.3 : 2.7, b.yaw ? 2.7 : 6.3, b.height - .8);
            cancels.push(assets.attachBuilding(root, b, fallback));
        }
        else {
            const shell = createPaintWall(root, b.x, b.z, b.width, b.height, b.depth, wallMaterial);
            content.walls.push(shell.wall);
            content.colliders.push(b.asset ? { ...shell.collider, minX:shell.collider.minX+.8,maxX:shell.collider.maxX-.8,minZ:shell.collider.minZ+1.3,maxZ:shell.collider.maxZ-1.3 } : shell.collider);
            const fallbackParts = new THREE.Group(); root.add(fallbackParts);
            const base = shell.wall.mesh.userData.baseVisual as THREE.Mesh;
            fallbackParts.attach(base); // target remains at its V1 position; fallback visual is in world coordinates.
            if(b.asset){
                const description=QUARTER_ASSETS[b.asset];
                const transform=new THREE.Matrix4().compose(new THREE.Vector3(b.x,0,b.z),new THREE.Quaternion(),new THREE.Vector3(b.width/description.size[0],b.height/description.size[1],b.depth/description.size[2]));
                extraBuilders.push(function*(){for(const f of description.faces)yield assets.paint.plane(root,f,transform,`quarter-premium-slab-${b.id}`);});
                cancels.push(assets.attachPremium(root,b,fallbackParts,shell.wall.mesh));
            }
            const parts: THREE.BufferGeometry[] = [];
            const detail = (x: number, y: number, z: number, w: number, h: number, d: number) => { const g = new THREE.BoxGeometry(w, h, d); g.clearGroups(); g.translate(x, y, z); parts.push(g); };
            detail(b.x, b.height + .12, b.z, b.width + .4, .24, b.depth + .4);
            const front = b.z + b.depth / 2;
            detail(b.x, 1.3, front + .04, 1.7, 2.6, .1);
            const panes: THREE.BufferGeometry[] = [];
            for (let y = 4.3; y < b.height - 1; y += 3)
                for (let x = b.x - b.width / 2 + 2; x < b.x + b.width / 2 - 1; x += 3.2) {
                    const g = new THREE.BoxGeometry(1.2, 1.4, .12);
                    g.clearGroups();
                    g.translate(x, y, front + .07);
                    panes.push(g);
                }
            if (panes.length) {
                const geom = mergeGeometries(panes, false)!;
                panes.forEach(g => g.dispose());
                const material = new THREE.MeshStandardMaterial({ color: '#8d9c98', roughness: .7, emissive: '#ffc879', emissiveIntensity: 0 });
                windows.push(material);
                fallbackParts.add(new THREE.Mesh(geom, material));
            }
            const geom = mergeGeometries(parts, false)!;
            parts.forEach(g => g.dispose());
            fallbackParts.add(new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: '#59666b', roughness: .85 })));
            if (b.id.startsWith('shop-')) {
                assets.label(root, Number(b.id.slice(-1)), b.x, 2.65, front + .14, 3.6);
                extras.push(assets.paint.plane(root,[b.x,2.65,front+.142,3.6,.8,0,0,0,1],new THREE.Matrix4(),`quarter-shop-sign-${b.id}`));
                const awning = new THREE.Mesh(new THREE.BoxGeometry(b.width - 1, .22, 2), new THREE.MeshStandardMaterial({ color: ['#827e6c', '#ac807d', '#829091'][Number(b.id.slice(-1)) % 3], roughness: 1 }));
                awning.position.set(b.x, 3.2, front + .9);
                fallbackParts.add(awning);
            }
        }
        yield content;
    }
    // Low planter edges and benches give social spaces useful human-scale boundaries.
    for (const [x, z] of [[-8, -11], [8, 11], [-11, 5], [11, -5], [25, 48], [25, 61], [-55, -34], [-48, 11]] as [
        number,
        number
    ][]) {
        prop('#87674e', x, .58, z, 3.4, .16, .7);
        prop('#b99773', x, .95, z + .3, 3.4, .6, .12);
        for (const ox of [-1.25, 1.25])
            prop('#4b5650', x + ox, .27, z, .2, .55, .55);
        if (quarterChunk(x, z) === `${cx}:${cz}`) {
            content.colliders.push({minX:x-1.7,maxX:x+1.7,minZ:z-.35,maxZ:z+.35,minY:.5,maxY:.66});
            content.colliders.push({minX:x-1.7,maxX:x+1.7,minZ:z+.24,maxZ:z+.36,minY:.65,maxY:1.25});
            content.walkSurfaces.push({minX:x-1.7,maxX:x+1.7,minZ:z-.35,maxZ:z+.35,height:.66});
            const bench = new THREE.Group(); bench.name=`quarter-bench-${x}:${z}`; group.add(bench);
            for(const [part,y,pz,w,h,d] of [['seat',.58,z,3.4,.16,.7],['back',.95,z+.3,3.4,.6,.12]] as const){
                const paint=createPaintWall(bench,x,pz,w,h,d,materials.wallMaterial,y-h/2);
                (paint.wall.mesh.userData.baseVisual as THREE.Mesh).visible=false;
                paint.wall.mesh.name=`quarter-bench-${part}-${x}:${z}`;paint.wall.mesh.userData.paintWorkspaceContext=group;
                extras.push(paint.wall);
            }
        }
    }
    const trees = QUARTER_TREES.filter(([x, z]) => quarterChunk(x, z) === `${cx}:${cz}`);
    const scenery = new THREE.Group();
    scenery.name = 'quarter-tree-detail';
    group.add(scenery);
    if (trees.length) {
        const fallback = new THREE.Group();
        scenery.add(fallback);
        const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.7, 0), new THREE.MeshStandardMaterial({ color: '#8eaa80', roughness: 1 }), trees.length), trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.15, .23, 2.5, 5), new THREE.MeshStandardMaterial({ color: '#826e58', roughness: 1 }), trees.length), matrix = new THREE.Matrix4();
        trees.forEach(([x, z], i) => { matrix.makeTranslation(x, 3.4, z); foliage.setMatrixAt(i, matrix); matrix.makeTranslation(x, 1.25, z); trunk.setMatrixAt(i, matrix); collider(x, z, .55, .55, 2.5); box('#c8c0af', x, .2, z, 3.7, .4, 3.7); box('#919a79', x, .42, z, 3.2, .05, 3.2); });
        fallback.add(foliage, trunk);
        cancels.push(assets.attachTrees(scenery, trees, fallback));
        cancels.push(() => { foliage.dispose(); trunk.dispose(); });
    }
    group.userData.updateScenery = (sky: string) => { const s = getRenderSettings(); assets.updateLights(sky); scenery.visible = s.scenery; for (const m of windows)
        m.emissiveIntensity = s.streetLights && (s.skyMode === 'night' || s.skyMode === 'game' && sky === 'night') ? 1.6 : 0; };
    // Outer service walls bound the playable district while the city backdrop continues visually.
    for (const side of ['west', 'east', 'north', 'south']) {
        if (side === 'west' && cx !== -1 || side === 'east' && cx !== 1 || side === 'north' && cz !== -1 || side === 'south' && cz !== 1)
            continue;
        const vertical = side === 'west' || side === 'east', x = vertical ? (side === 'west' ? -71 : 71) : cx * 48, z = vertical ? cz * 48 : (side === 'north' ? -71 : 71);
        const wall = createPaintWall(group, x, z, vertical ? .5 : 48, 3, vertical ? 48 : .5, materials.wallMaterial);
        content.walls.push(wall.wall);
        content.colliders.push(wall.collider);
    }
    // Yard wall and loading canopy are useful paint surfaces, not decoration only.
    if (cx === -1 && cz === 0) {
        for (const [x, z, w, h, d] of [[-66, 0, .45, 3.8, 23], [-54, -11, 24, 3.8, .45]] as number[][]) {
            const wall = createPaintWall(group, x, z, w, h, d, materials.wallMaterial);
            content.walls.push(wall.wall);
            content.colliders.push(wall.collider);
        }
        assets.label(group, 8, -54, 2.65, -10.75, 5);
        box('#8e8274', -59, 3.9, -7, 12, .22, 5);
        for (const x of [-64, -54]) {
            box('#716f65', x, 1.9, -5, .18, 3.8, .18);
            collider(x, -5, .25, .25, 3.8);
        }
    }
    if (cx === 0 && cz === 1) {
        box('#777e73', 27, 1.5, 43, .14, 3, .14);
        assets.label(group, 9, 27, 2.6, 43.1, 2.8);
        collider(27, 43, .2, .2, 3);
    }
    // Small court, painted lines, tables and bollards; understated instead of cluttered.
    for (const [x, z] of [[-59, -35], [-47, -35], [31, 54]] as [
        number,
        number
    ][]) {
        prop('#a6947a', x, .9, z, 1.5, .16, 1.5);
        prop('#645f53', x, .4, z, .3, .8, .3);
        if (quarterChunk(x, z) === `${cx}:${cz}`)
            collider(x, z, 1.5, 1.5, 1);
    }
    for (const [x, z] of [[-12, -30], [12, -30], [-37, 32], [38, 32], [-31, 0], [31, 0]] as [
        number,
        number
    ][])
        prop('#817d70', x, .55, z, .25, 1.1, .25);
    for (const [x, z] of QUARTER_LAMPS)
        if (quarterChunk(x, z) === `${cx}:${cz}`)
            collider(x, z, .32, .32, 5.4);
    for (const [color, geometries] of batches) {
        const merged = mergeGeometries(geometries, false)!;
        geometries.forEach(g => g.dispose());
        group.add(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color, roughness: 1 })));
    }
    // Small targets are incremental and invisible until painted; shared planes never add a draw call.
    content.walls.push(...extras);
    for(const build of extraBuilders){let count=0;for(const wall of build()){content.walls.push(wall);if(++count%32===0)yield content;}}
    assignSurfaceIds(cx, cz, content.walls, 'map2-v1');
    return content;
}
