import * as THREE from 'three';

export type SkyMode = 'day' | 'sunset' | 'pastel' | 'rain' | 'night';
export type CameraMode = 'first' | 'third' | 'map';
export type AvatarEmote = 'joy' | 'cry' | 'think' | 'sleepy' | 'spin';

export interface PaintSurfaceLayer {
  contexts: Array<CanvasRenderingContext2D | null>;
  textures: THREE.Texture[];
  mesh: THREE.Mesh;
  ensureFace: (face: number) => CanvasRenderingContext2D | null;
}

export interface SurfaceUvScale {
  u: number;
  v: number;
}

export interface PaintWall {
  surfaceId?: string;
  pendingPaintImages?: Map<string, string[]>;
  mesh: THREE.Mesh;
  uvScales: SurfaceUvScale[];
  faceDimensions: Array<{ width: number; height: number }>;
  contexts: Array<CanvasRenderingContext2D | null>;
  textures: THREE.Texture[];
  layers: PaintSurfaceLayer[];
  createLayer: () => PaintSurfaceLayer;
  posters?: PosterArtwork[];
  dirty?: boolean;
}

export interface PaintWorkspaceBounds {
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
}

export interface PaintWorkspaceSelection {
  wall: PaintWall;
  face: number;
  bounds: PaintWorkspaceBounds;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  up: THREE.Vector3;
  width: number;
  height: number;
  preview: THREE.LineLoop;
}

export interface PaintWorkspaceState {
  active: boolean;
  camera: THREE.OrthographicCamera;
  selection: PaintWorkspaceSelection | null;
  savedLayers: Map<THREE.Object3D, boolean> | null;
}

export interface PosterArtwork {
  image: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  width: number;
  height: number;
}

export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

export interface WalkSurface {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface Staircase {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  startZ: number;
  endZ: number;
  baseY: number;
  topY: number;
  steps: number;
}

export interface CityBot {
  group: THREE.Group;
  body: THREE.Mesh;
  legs: THREE.Mesh[];
  index: number;
  phase: number;
  paintTimer: number;
  paintColor: string;
  targetPosition: THREE.Vector3;
  wanderTimer: number;
}

export interface WorldEngine {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  mapCamera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  skyDome: THREE.Mesh;
  skyCanvas: HTMLCanvasElement;
  skyTexture: THREE.CanvasTexture;
  cloudGroup: THREE.Group;
  cloudMesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  rainSpeeds: Float32Array;
  hemisphereLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
  bunnyGroup: THREE.Group;
  playerAvatar: THREE.Group;
  bots: CityBot[];
  botRaycaster: THREE.Raycaster;
  botsEnabled: boolean;
  playerPosition: THREE.Vector3;
  playerYaw: number;
  playerPitch: number;
  cameraMode: CameraMode;
  equippedOutfit: string;
  abilityActive: boolean;
  walls: PaintWall[];
  colliders: Collider[];
  walkSurfaces: WalkSurface[];
  staircases: Staircase[];
  updateChunks: (x: number, z: number) => void;
  setPaintVisibility: (visibility: boolean[]) => void;
  savePaint: () => void;
  clearPaintCache: () => void;
  setPaintSession: (session: 'solo' | 'multiplayer') => void;
  paintRevision: number;
  paintWorkspace?: PaintWorkspaceState;
  onPaintWorkspaceChange?: (workspace: PaintWorkspaceState | undefined) => void;
  onPaintSample?: (wall: PaintWall, hit: THREE.Intersection, settings: LiveSettings, continues: boolean) => void;
  onPaintEnd?: () => void;
  onMultiplayerFrame?: (delta: number, settings: LiveSettings) => void;
  multiplayerActive?: boolean;
  onArtworkPlaced?: (wall: PaintWall, face: number, artwork: PosterArtwork) => void;
  groundLevel: number;
  velocityY: number;
  jumpSignal: number;
}

export interface MovementInput {
  x: number;
  y: number;
}

export interface LookInput {
  x: number;
  y: number;
}

export interface LiveSettings {
  paintMode: boolean;
  eraseMode: boolean;
  color: string;
  opacity: number;
  movement: MovementInput;
  lookInput?: LookInput;
  brushSize: number;
  moveSpeed: number;
  jumpPower: number;
  lookSensitivity: number;
  fogDensity: number;
  layerIndex: number;
  layerVisibility: boolean[];
}
