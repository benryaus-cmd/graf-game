import * as THREE from 'three';
import { createCityBlockLayout, type CityBuildingDescription } from './cityBlockLayout';
import { distanceToBuilding, getBuildingRanges, buildingTierVisibility } from './buildingLod';
import { getRenderSettings } from './renderSettings';
import { fogVisualDistance } from './cityAtmosphere';
import type { MapId } from './mapPreference';
type Entry = {
    id: string;
    description: CityBuildingDescription;
};
/** Two shared draws for height-aware distant buildings, with per-building masks. */
export class BuildingHorizon {
    readonly root = new THREE.Group();
    private signature = '';
    private entries: Entry[] = [];
    private plain: THREE.InstancedMesh | null = null;
    private flat: THREE.InstancedMesh | null = null;
    private masks: THREE.InstancedBufferAttribute | null = null;
    private plainMaterial = new THREE.MeshBasicMaterial({ color: '#c1b6a4' });
    private flatMaterial = new THREE.MeshBasicMaterial({ color: '#9a9b91', side: THREE.DoubleSide });
    private width = { value: 1.2 };
    readonly stats = { plain: 0, flat: 0, queued: 0 };
    constructor(private map: MapId) {
        this.root.name = 'city-height-tiers';
        this.flatMaterial.onBeforeCompile = shader => {
            shader.uniforms.tierWidth = this.width;
            shader.vertexShader = 'attribute float cityHidden;\nuniform float tierWidth;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
    vec3 center=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;
    vec3 facing=cameraPosition-center;
    vec3 right=normalize(vec3(facing.z,0.,-facing.x)+vec3(.000001,0.,0.));
    vec3 vertex=center+right*transformed.x*length(instanceMatrix[0].xyz)*tierWidth+vec3(0.,transformed.y*length(instanceMatrix[1].xyz),0.);
    vec4 mvPosition=viewMatrix*vec4(vertex,1.);gl_Position=projectionMatrix*mvPosition;
    if(cityHidden>.5)gl_Position=vec4(0.,0.,2.,1.);
   `);
        };
        this.flatMaterial.customProgramCacheKey = () => 'graffciti-height-tiers-v1';
    }
    update(x: number, z: number, active: Set<string>, camera?: THREE.Camera) {
        const s = getRenderSettings(), cx = Math.floor(x / 48 + .5), cz = Math.floor(z / 48 + .5), signature = [cx, cz, s.heightLod, s.lodHeightThreshold, s.shortDetailDistance, s.shortProxyDistance, s.shortFlatDistance, s.tallDetailDistance, s.tallProxyDistance, s.tallFlatDistance, s.detailDistance, s.horizonDistance, s.skylineDistance, s.skylineMinHeight].join(':');
        this.root.visible = s.horizon;
        this.width.value = s.skylineWidth;
        if (!s.horizon) {
            this.stats.plain = 0;
            this.stats.flat = 0;
            return;
        }
        if (signature !== this.signature) {
            this.signature = signature;
            const max = Math.max(getBuildingRanges(0, s).flat, getBuildingRanges(100, s).flat, getBuildingRanges(100, s).proxy), radius = Math.ceil(max / 48) + 1;
            this.entries = [];
            for (let dx = -radius; dx <= radius; dx++)
                for (let dz = -radius; dz <= radius; dz++) {
                    const bx = cx + dx, bz = cz + dz;
                    createCityBlockLayout(bx, bz, this.map).buildings.forEach((b, i) => { if (distanceToBuilding(cx * 48, cz * 48, b) > Math.max(...Object.values(getBuildingRanges(b.height, s))) + 34)
                        return; this.entries.push({ id: b.id ?? `${bx}:${bz}:${i}`, description: b }); });
                }
            this.clearMeshes();
            if (this.entries.length) {
                this.plain = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.plainMaterial, this.entries.length);
                this.plain.name = 'city-height-blocks';
                this.plain.frustumCulled = false;
                const plane = new THREE.PlaneGeometry(1, 1);
                this.masks = new THREE.InstancedBufferAttribute(new Float32Array(this.entries.length), 1);
                plane.setAttribute('cityHidden', this.masks);
                this.flat = new THREE.InstancedMesh(plane, this.flatMaterial, this.entries.length);
                this.flat.name = 'city-height-silhouettes';
                this.flat.frustumCulled = false;
                const matrix = new THREE.Matrix4();
                this.entries.forEach(({ description: b }, i) => { matrix.compose(new THREE.Vector3(b.x, b.height / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(Math.max(b.width, b.depth), b.height, 1)); this.flat!.setMatrixAt(i, matrix); this.plain!.setColorAt(i, new THREE.Color(b.color ?? '#c0b6a5')); });
                this.flat.instanceMatrix.needsUpdate = true;
                this.root.add(this.plain, this.flat);
            }
        }
        const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), fogEnd = fogVisualDistance(s, camera);
        let plain = 0, flat = 0;
        this.entries.forEach(({ id, description: b }, i) => {
            const distance = distanceToBuilding(x, z, b), hasDetail = active.has(id), state = buildingTierVisibility(distance, b.height, { detail: hasDetail, proxy: true }, s, fogEnd);
            const drawPlain = !hasDetail && state.proxy, drawFlat = (b.height >= s.skylineMinHeight || s.heightLod || this.map === 'map2') && state.flat && (!hasDetail || distance <= getBuildingRanges(b.height, s).detail && distance >= Math.max(getBuildingRanges(b.height, s).detail, getBuildingRanges(b.height, s).proxy) - 2);
            matrix.compose(new THREE.Vector3(b.x, b.height / 2, b.z), rotation, drawPlain ? new THREE.Vector3(b.width, b.height, b.depth) : new THREE.Vector3(0, 0, 0));
            this.plain?.setMatrixAt(i, matrix);
            this.masks?.setX(i, drawFlat ? 0 : 1);
            plain += Number(drawPlain);
            flat += Number(drawFlat);
        });
        if (this.plain)
            this.plain.instanceMatrix.needsUpdate = true;
        if (this.masks)
            this.masks.needsUpdate = true;
        if (this.flat)
            this.flat.visible = s.skyline;
        this.stats.plain = plain;
        this.stats.flat = flat;
    }
    private clearMeshes() { for (const mesh of [this.plain, this.flat])
        if (mesh) {
            mesh.removeFromParent();
            mesh.dispose();
            mesh.geometry.dispose();
        } this.plain = null; this.flat = null; this.masks = null; }
    dispose() { this.clearMeshes(); this.plainMaterial.dispose(); this.flatMaterial.dispose(); this.root.removeFromParent(); }
}
