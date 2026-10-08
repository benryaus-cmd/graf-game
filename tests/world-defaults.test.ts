import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RENDER_SETTINGS, normaliseRenderSettings, getRenderSettings, setRenderSettings, resetRenderSettings } from '../src/game/renderSettings';

test('fresh world and reset defaults match the approved night screenshots', () => {
  const expected = {
    renderScale: 1.2, fogDensity: .06, detailDistance: 69, horizonDistance: 68,
    skylineDistance: 400, skylineMinHeight: 5, lodHeightThreshold: 12, heightLod: true,
    shortDetailDistance: 48, tallDetailDistance: 60, shortProxyDistance: 68, tallProxyDistance: 84,
    shortFlatDistance: 160, tallFlatDistance: 400, skylineWidth: 1, exposure: 1.5,
    liveStrokeDistance: 5, streamBudgetMs: 1.5, retentionSeconds: 3, prefetchDistance: 12,
    skyMode: 'game', fogStyle: 'exp', fogNear: 20, fogFar: 200,
    groundChunks: 4, groundColor: '#8b8982', imageLoadDistance: 35, imageConcurrency: 1,
    ambientScale: 5, sunScale: 3, lampCount: 12, lampActivationDistance: 60,
    lampIntensity: 150, lampDistance: 40, lampRadius: 12, lampFadeDistance: 0,
    playerLightIntensity: 10, fogColor: '#111b2c', groundExtension: true, fogCull: false,
    skyMatch: true, flatSky: false, customFog: false, streetLights: true, lampPools: true,
    playerLight: true, horizon: true, skyline: true, scenery: true,
  };
  assert.deepEqual(DEFAULT_RENDER_SETTINGS, expected);
  assert.deepEqual(normaliseRenderSettings(null), expected);
  const previous = { ...getRenderSettings() };
  try {
    setRenderSettings({ exposure: .3, renderScale: .7 });
    resetRenderSettings();
    assert.deepEqual(getRenderSettings(), expected);
  } finally { setRenderSettings(previous); }
});

test('saved device customisations override defaults without being reset', () => {
  const saved = normaliseRenderSettings({ renderScale: .7, exposure: .4, lampCount: 3, streetLights: false });
  assert.equal(saved.renderScale, .7);
  assert.equal(saved.exposure, .4);
  assert.equal(saved.lampCount, 3);
  assert.equal(saved.streetLights, false);
});
