import * as THREE from 'three';
import { createArchitecture, WALL_TEXTURE_URL } from '@/game/architecture';
import { createSkyDome } from '@/game/sky';
import { createBunnyCompanion } from '@/game/companion';
import { createPlayerAvatar } from '@/game/playerAvatar';
import { createCityBots } from '@/game/cityBots';
import type { WorldEngine } from '@/game/worldTypes';

export function createWorld(container: HTMLElement, fogDensity: number): WorldEngine {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#b2bab5', fogDensity);
  const camera = new THREE.PerspectiveCamera(
    76,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.1,
    1200,
  );
  camera.rotation.order = 'YXZ';
  const mapCamera = new THREE.OrthographicCamera(-28, 28, 28, -28, 0.1, 1200);
  mapCamera.up.set(0, 0, -1);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'low-power',
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.className = 'world-canvas';
  renderer.domElement.setAttribute('aria-label', 'Spray painting city world');
  container.appendChild(renderer.domElement);

  const wallTexture = new THREE.TextureLoader().load(
    WALL_TEXTURE_URL,
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    },
    undefined,
    (error) => console.warn('[Aippy] Concrete texture could not be loaded.', error),
  );
  wallTexture.colorSpace = THREE.SRGBColorSpace;

  const atmosphere = createSkyDome();
  scene.add(atmosphere.mesh, atmosphere.cloudGroup, atmosphere.rain);
  const architecture = createArchitecture(scene, wallTexture);
  const bunnyGroup = createBunnyCompanion(scene);
  const playerAvatar = createPlayerAvatar(scene);
  const bots = createCityBots(scene);
  const botRaycaster = new THREE.Raycaster();
  const hemisphereLight = new THREE.HemisphereLight('#e8f4ff', '#6b6257', 2.5);
  const sunLight = new THREE.DirectionalLight('#fff1d2', 2.5);
  sunLight.position.set(-16, 34, 18);
  scene.add(hemisphereLight, sunLight);
  renderer.setSize(container.clientWidth, container.clientHeight);

  return {
    scene,
    camera,
    mapCamera,
    renderer,
    skyDome: atmosphere.mesh,
    skyCanvas: atmosphere.canvas,
    skyTexture: atmosphere.texture,
    cloudGroup: atmosphere.cloudGroup,
    cloudMesh: atmosphere.cloudMesh,
    rain: atmosphere.rain,
    rainSpeeds: atmosphere.rainSpeeds,
    hemisphereLight,
    sunLight,
    bunnyGroup,
    playerAvatar,
    bots,
    botRaycaster,
    botsEnabled: false,
    playerPosition: new THREE.Vector3(0, 1.72, 0),
    playerYaw: 0,
    playerPitch: 0,
    cameraMode: 'first',
    equippedOutfit: 'street',
    abilityActive: false,
    walls: architecture.walls,
    colliders: architecture.colliders,
    walkSurfaces: architecture.walkSurfaces,
    staircases: architecture.staircases,
    updateChunks: architecture.updateAt,
    setPaintVisibility: architecture.setLayerVisibility,
    savePaint: architecture.savePaint,
    clearPaintCache: architecture.clearPaintCache,
    setPaintSession: architecture.setPaintSession,
    paintRevision: 0,
    groundLevel: 0,
    velocityY: 0,
    jumpSignal: 0,
  };
}
