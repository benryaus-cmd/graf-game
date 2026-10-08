import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseRenderSettings } from '../src/game/renderSettings';
import { paintChunkKey } from '../src/game/mapPreference';
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
import { setRenderSettings, DEFAULT_RENDER_SETTINGS } from '../src/game/renderSettings';
import { QUARTER_LAMPS, QUARTER_BUILDINGS, isInsideBuilding } from '../src/game/morningQuarterLayout';
import { BuildingHorizon } from '../src/game/buildingHorizon';
import { CityAtmosphere, lampActivation } from '../src/game/cityAtmosphere';
import { MorningQuarterAssets } from '../src/game/morningQuarterAssets';
import type { Model } from '../src/game/assetPreview';
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
