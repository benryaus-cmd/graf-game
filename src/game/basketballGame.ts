import * as THREE from 'three';
import { BASKETBALL_COURT } from './basketballCourt';
import { createBall, launchFromFlick, stepBall } from './basketballPhysics';
import type { HorseState } from './basketballSession';
import type { BasketballBall, BasketballGesture, ShotLaunch, ShotResult } from './basketballPhysics';
import { encodeReleaseOffset, type ReleaseOffset } from './basketballRelease';
import { EYE_HEIGHT } from './playerPhysics';
import type { WorldEngine } from './worldTypes';

export const BASKETBALL_BALL_POOL_SIZE = 24;
const LIFE_SECONDS = 3;
const FADE_SECONDS = .6;

export interface BasketballView {
  nearby: boolean;
  active: boolean;
  spotId: number | null;
  attempts: number;
  makes: number;
  streak: number;
  recentResult: ShotResult | null;
}
export interface HeldBallTarget { x: number; y: number; radius: number }

type BasketballWorld = Pick<WorldEngine, 'scene' | 'playerPosition' | 'playerYaw' | 'playerPitch' | 'cameraMode'> & {
  activityLocked?: boolean;
  cancelWorldInput?: () => void;
  camera?: THREE.PerspectiveCamera;
  playerAvatar?: THREE.Object3D;
  skyDome?: THREE.Object3D;
  velocityY?: number;
};
type BallSlot = { group: THREE.Group; shot: ActiveShot | null };
type ActiveShot = { ball: BasketballBall; localAttempt: number; launchedAtMs: number; slot: BallSlot | null; authoritative: boolean };
type ExploringState = { position: THREE.Vector3; yaw: number; pitch: number; cameraMode: WorldEngine['cameraMode']; velocityY: number | undefined; locked: boolean | undefined };

/** Owns only its pooled presentation; the city's rim and paintable board remain borrowed. */
export class BasketballGame {
  onShot?: (launch: ShotLaunch) => void;
  onResult?: (result: ShotResult) => void;
  private readonly root = new THREE.Group();
  private readonly ballGeometry = new THREE.SphereGeometry(BASKETBALL_COURT.ballRadius, 12, 8);
  private readonly seamGeometry: THREE.BufferGeometry;
  private readonly ballMaterial: THREE.ShaderMaterial;
  private readonly seamMaterial: THREE.ShaderMaterial;
  private readonly net: THREE.LineSegments;
  private readonly marks: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly burst: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly held: THREE.Group;
  private readonly heldRotation = new THREE.Euler(0, 0, 0, 'YXZ');
  private heldScreenPosition: { x: number; y: number } | null = null;
  private readonly projectedHeld = new THREE.Vector3();
  private readonly pool: BallSlot[] = [];
  private readonly shots = new Set<ActiveShot>();
  private readonly seen = new Map<string, number>();
  private readonly outcomes = new Map<number, ShotResult['outcome']>();
  private completedThrough = 0;
  private completedStreak = 0;
  private latestResolvedAttempt = 0;
  private view: BasketballView = { nearby: false, active: false, spotId: null, attempts: 0, makes: 0, streak: 0, recentResult: null };
  private shared = false;
  private soloScore: Pick<BasketballView, 'attempts' | 'makes' | 'streak'> | null = null;
  private readonly sharedResults = new Set<string>();
  private previous: ExploringState | null = null;
  private feedbackAtMs = -Infinity;
  private feedbackSwish = false;
  private resultAtMs = -Infinity;
  private disposed = false;
  private lastPublished = '';

  constructor(
    private readonly world: BasketballWorld,
    private readonly onView: (view: BasketballView) => void,
    private readonly clock: () => number = () => performance.now(),
  ) {
    this.root.name = 'basketball-presentation';
    this.ballMaterial = this.makeBallMaterial('#ef7f24', true);
    this.seamMaterial = this.makeBallMaterial('#30251a', false);
    const seamPoints: number[] = [];
    const radius = BASKETBALL_COURT.ballRadius + .0015;
    for (let axis = 0; axis < 3; axis++) for (let i = 0; i < 32; i++) {
      for (const angle of [i / 32 * Math.PI * 2, (i + 1) / 32 * Math.PI * 2]) {
        const a = Math.cos(angle) * radius, b = Math.sin(angle) * radius;
        seamPoints.push(...(axis === 0 ? [0, a, b] : axis === 1 ? [a, 0, b] : [a, b, 0]));
      }
    }
    this.seamGeometry = new THREE.BufferGeometry();
    this.seamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(seamPoints, 3));
    this.held = this.makeBall('basketball-held');
    this.held.visible = false;
    this.root.add(this.held);
    for (let i = 0; i < BASKETBALL_BALL_POOL_SIZE; i++) {
      const group = this.makeBall(`basketball-flight-${i}`);
      group.visible = false;
      this.root.add(group);
      this.pool.push({ group, shot: null });
    }
    const netPoints: number[] = [];
    const netTopRadius = BASKETBALL_COURT.rim.radius - BASKETBALL_COURT.rim.tubeRadius * .7;
    const netMidRadius = netTopRadius * (.21 / .255), netBottomRadius = netTopRadius * (.16 / .255);
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const next = (i + 1) / 12 * Math.PI * 2;
      netPoints.push(Math.cos(angle) * netTopRadius, 0, Math.sin(angle) * netTopRadius, Math.cos(next) * netBottomRadius, -.38, Math.sin(next) * netBottomRadius);
      netPoints.push(Math.cos(angle) * netMidRadius, -.19, Math.sin(angle) * netMidRadius, Math.cos(next) * netMidRadius, -.19, Math.sin(next) * netMidRadius);
    }
    const netGeometry = new THREE.BufferGeometry();
    netGeometry.setAttribute('position', new THREE.Float32BufferAttribute(netPoints, 3));
    this.net = new THREE.LineSegments(netGeometry, new THREE.LineBasicMaterial({ color: '#eee8d7', transparent: true, opacity: .72 }));
    this.net.name = 'basketball-net';
    this.net.position.fromArray(BASKETBALL_COURT.rim.center);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(BASKETBALL_COURT.rim.radius + BASKETBALL_COURT.rim.tubeRadius, .012, 4, 24), new THREE.MeshBasicMaterial({ color: '#ffd58a', transparent: true, opacity: 0, depthWrite: false }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.copy(this.net.position);
    this.ring.visible = false;
    const points = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (let i = 0; i < 8; i++) positions.push(Math.cos(i / 8 * Math.PI * 2) * BASKETBALL_COURT.rim.radius, (i % 2) * .09, Math.sin(i / 8 * Math.PI * 2) * BASKETBALL_COURT.rim.radius);
    points.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.burst = new THREE.Points(points, new THREE.PointsMaterial({ color: '#ffd58a', size: .045, transparent: true, opacity: 0, depthWrite: false }));
    this.burst.position.copy(this.net.position);
    this.burst.visible = false;
    const markPoints: number[] = [];
    for (const spot of BASKETBALL_COURT.spots) for (let i = 0; i < 24; i++) {
      for (const angle of [i / 24 * Math.PI * 2, (i + 1) / 24 * Math.PI * 2]) {
        markPoints.push(spot.position[0] + Math.cos(angle) * .34, spot.position[1] + .018, spot.position[2] + Math.sin(angle) * .34);
      }
    }
    const markGeometry = new THREE.BufferGeometry();
    markGeometry.setAttribute('position', new THREE.Float32BufferAttribute(markPoints, 3));
    this.marks = new THREE.LineSegments(markGeometry, new THREE.LineBasicMaterial({ color: '#eadfbc', transparent: true, opacity: .48, depthWrite: false }));
    this.marks.name = 'basketball-shooting-marks';
    this.root.add(this.net, this.ring, this.burst, this.marks);
    world.scene.add(this.root);
    this.publish();
  }

  getSnapshot(): BasketballView { return { ...this.view }; }

  /** Logical viewport coordinates; radius is a fraction of its shorter edge. */
  getHeldBallTarget(): HeldBallTarget | null {
    const camera = this.world.camera;
    if (!this.view.active || this.disposed || !camera) return null;
    this.positionHeld();
    camera.updateMatrixWorld(true);
    this.held.updateMatrixWorld(true);
    const centre = this.projectedHeld.copy(this.held.position).project(camera);
    const x = (centre.x + 1) / 2, y = (1 - centre.y) / 2;
    const width = camera.aspect, shortEdge = Math.min(width, 1);
    const body = this.held.children[0] as THREE.Mesh<THREE.BufferGeometry>;
    const positions = body.geometry.getAttribute('position');
    let radius = 0;
    for (let i = 0; i < positions.count; i++) {
      const vertex = this.projectedHeld.fromBufferAttribute(positions, i).applyMatrix4(body.matrixWorld).project(camera);
      radius = Math.max(radius, Math.hypot(((vertex.x + 1) / 2 - x) * width, (1 - vertex.y) / 2 - y) / shortEdge);
    }
    return { x, y, radius };
  }

  setHeldBallScreenPosition(point: { x: number; y: number } | null): void {
    if (this.disposed || !this.view.active) return;
    if (point && ![point.x, point.y].every(Number.isFinite)) return;
    this.heldScreenPosition = point ? { x: point.x, y: point.y } : null;
    this.positionHeld();
  }

  enter(spotId = 2): boolean {
    if (this.disposed) return false;
    const spot = BASKETBALL_COURT.spots.find(candidate => candidate.id === spotId);
    if (!spot) return false;
    if (!this.view.active) {
      this.previous = { position: this.world.playerPosition.clone(), yaw: this.world.playerYaw, pitch: this.world.playerPitch, cameraMode: this.world.cameraMode, velocityY: this.world.velocityY, locked: this.world.activityLocked };
    }
    this.world.cancelWorldInput?.();
    this.world.activityLocked = true;
    this.world.playerPosition.set(spot.position[0], spot.position[1] + EYE_HEIGHT, spot.position[2]);
    const [rimX, rimY, rimZ] = BASKETBALL_COURT.rim.center;
    this.world.playerYaw = Math.atan2(spot.position[0] - rimX, spot.position[2] - rimZ);
    this.world.playerPitch = Math.atan2(rimY - this.world.playerPosition.y, Math.hypot(rimX - spot.position[0], rimZ - spot.position[2]));
    this.world.cameraMode = 'first';
    if (this.world.velocityY !== undefined) this.world.velocityY = 0;
    this.view.active = true;
    this.view.spotId = spotId;
    this.heldScreenPosition = null;
    this.held.visible = true;
    this.updateCamera();
    this.positionHeld();
    this.publish();
    return true;
  }

  /** The mark is supplied only by an authoritative court seat. */
  enterShared(spotId: number): boolean {
    if (this.disposed || !BASKETBALL_COURT.spots.some(spot => spot.id === spotId)) return false;
    if (!this.shared) {
      if (this.view.active) this.leave();
      this.soloScore = { attempts: this.view.attempts, makes: this.view.makes, streak: this.view.streak };
      this.view.attempts = this.view.makes = this.view.streak = 0;
      this.sharedResults.clear();
      this.shared = true;
    }
    return this.enter(spotId);
  }

  getSharedShotInput(gesture: BasketballGesture): { gesture: BasketballGesture; releaseOffset: ReleaseOffset } | null {
    if (!this.shared || this.disposed || !this.view.active || this.view.spotId === null) return null;
    this.positionHeld();
    const releaseOffset = encodeReleaseOffset(this.view.spotId, this.held.position.toArray());
    return releaseOffset ? { gesture: { ...gesture }, releaseOffset } : null;
  }

  /** Move only from authoritative seat/turn state; retain scores and balls already in flight. */
  positionSharedPlayer(seat: { playerId: string; spotId: number }, horse: HorseState | null): boolean {
    const takingTurn = horse && (horse.phase === 'set' || horse.phase === 'match')
      && (horse.inviterId === seat.playerId || horse.inviteeId === seat.playerId) && horse.occupantId === seat.playerId;
    const spotId = takingTurn ? horse.spotId : seat.spotId;
    return this.shared && this.view.active && this.view.spotId === spotId || this.enterShared(spotId);
  }

  /** Shared predictions animate immediately, without attempts, results, or coin callbacks. */
  predictSharedShot(launch: ShotLaunch): boolean {
    if (!this.shared || !this.view.active || this.disposed || !this.validLaunch(launch) || this.seen.has(launch.shotId)) return false;
    this.addShot(launch, 0, false, true);
    return true;
  }

  receiveSharedShot(launch: ShotLaunch, elapsedSeconds = 0, reconcile = false): boolean {
    if (this.disposed || !this.validLaunch(launch) || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= LIFE_SECONDS) return false;
    const predicted = [...this.shots].find(shot => shot.ball.launch.shotId === launch.shotId);
    if (reconcile && predicted?.authoritative) {
      predicted.ball = createBall(launch, elapsedSeconds);
      predicted.launchedAtMs = this.clock() - elapsedSeconds * 1000;
      if (predicted.slot) predicted.slot.group.position.fromArray(predicted.ball.position);
      return true;
    }
    if (this.seen.has(launch.shotId)) return false;
    this.addShot(launch, elapsedSeconds, false, true);
    return true;
  }

  rejectSharedShot(shotId?: string): void {
    for (const shot of this.shots) {
      if (!shot.authoritative || (shotId && shot.ball.launch.shotId !== shotId)) continue;
      if (shot.slot) { shot.slot.group.visible = false; shot.slot.shot = null; }
      this.shots.delete(shot);
      this.seen.delete(shot.ball.launch.shotId);
    }
    if (shotId) this.seen.delete(shotId);
  }

  syncSharedCounters(seat: { attempts: number; makes: number }, pendingShotId: string | null = null): void {
    if (!this.shared || pendingShotId) return;
    if (![seat.attempts, seat.makes].every(value => Number.isSafeInteger(value) && value >= 0) || seat.makes > seat.attempts) return;
    this.view.attempts = seat.attempts;
    this.view.makes = seat.makes;
    this.publish();
  }

  presentSharedResult(result: ShotResult, own: boolean): boolean {
    if (this.disposed || !own || !this.shared || !this.view.active || this.sharedResults.has(result.shotId)) return false;
    if (result.courtId !== BASKETBALL_COURT.id || !['make', 'miss'].includes(result.outcome)) return false;
    this.sharedResults.add(result.shotId);
    if (this.sharedResults.size > 1024) this.sharedResults.delete(this.sharedResults.values().next().value!);
    this.view.recentResult = result;
    this.resultAtMs = this.clock();
    this.view.streak = result.outcome === 'make' ? this.view.streak + 1 : 0;
    if (result.outcome === 'make') this.presentResult(result, 0, this.resultAtMs);
    this.publish();
    return true;
  }

  leave(): void {
    if (!this.view.active) return;
    this.world.cancelWorldInput?.();
    this.shots.clear();
    this.outcomes.clear();
    this.completedThrough = this.latestResolvedAttempt = this.view.attempts;
    this.completedStreak = this.view.streak;
    for (const slot of this.pool) {
      slot.shot = null;
      slot.group.visible = false;
      slot.group.userData.basketballOpacity = 1;
    }
    this.feedbackAtMs = -Infinity;
    this.resultAtMs = -Infinity;
    this.net.scale.y = 1;
    this.ring.visible = this.burst.visible = false;
    this.ring.material.opacity = this.burst.material.opacity = 0;
    this.ring.scale.setScalar(1);
    this.burst.scale.setScalar(1);
    this.burst.position.fromArray(BASKETBALL_COURT.rim.center);
    this.view.recentResult = null;
    if (this.previous) {
      this.world.playerPosition.copy(this.previous.position);
      this.world.playerYaw = this.previous.yaw;
      this.world.playerPitch = this.previous.pitch;
      this.world.cameraMode = this.previous.cameraMode;
      this.world.velocityY = this.previous.velocityY;
      this.world.activityLocked = this.previous.locked ?? false;
    } else this.world.activityLocked = false;
    this.previous = null;
    this.view.active = false;
    if (this.shared) {
      if (this.soloScore) Object.assign(this.view, this.soloScore);
      this.soloScore = null;
      this.shared = false;
      this.sharedResults.clear();
      this.completedThrough = this.latestResolvedAttempt = this.view.attempts;
      this.completedStreak = this.view.streak;
    }
    this.view.spotId = null;
    this.heldScreenPosition = null;
    this.held.visible = false;
    this.publish();
  }

  shoot(gesture: BasketballGesture): ShotLaunch | null {
    if (this.shared || this.disposed || !this.view.active || this.view.spotId === null) return null;
    this.positionHeld();
    const launch = launchFromFlick(this.view.spotId, gesture, this.held.position.toArray());
    if (!launch) return null;
    this.addShot(launch, 0, true);
    this.view.attempts++;
    this.publish();
    this.onShot?.(launch);
    return launch;
  }

  receiveShot(launch: ShotLaunch, elapsedSeconds = 0): boolean {
    if (this.disposed || !this.validLaunch(launch) || !Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= LIFE_SECONDS || this.seen.has(launch.shotId)) return false;
    this.addShot(launch, elapsedSeconds, false);
    return true;
  }

  update(nowMs: number): void {
    if (this.disposed || !Number.isFinite(nowMs)) return;
    for (const shot of this.shots) {
      const targetAge = Math.max(0, (nowMs - shot.launchedAtMs) / 1000);
      const result = stepBall(shot.ball, Math.max(0, targetAge - shot.ball.ageSeconds));
      if (result && !shot.authoritative) this.presentResult(result, shot.localAttempt, nowMs);
      if (shot.slot) {
        const group = shot.slot.group;
        group.position.fromArray(shot.ball.position);
        group.rotation.set(shot.ball.ageSeconds * 2.5, shot.ball.ageSeconds * 1.7, 0);
        group.userData.basketballOpacity = Math.min(1, Math.max(0, (LIFE_SECONDS - targetAge) / FADE_SECONDS));
      }
      if (shot.ball.expired || targetAge >= LIFE_SECONDS) {
        if (shot.slot) { shot.slot.group.visible = false; shot.slot.shot = null; }
        this.shots.delete(shot);
      }
    }
    // Old ids cannot respawn within their lifetime; retain a bounded recent echo history.
    if (this.seen.size > 1024) for (const [id, at] of this.seen) {
      if (nowMs - at >= LIFE_SECONDS * 1000 && this.seen.size > 1024) this.seen.delete(id);
    }
    const feedbackAge = Math.max(0, (nowMs - this.feedbackAtMs) / 1000);
    const feedback = feedbackAge < .45 ? 1 - feedbackAge / .45 : 0;
    this.net.scale.y = feedback > 0 ? 1 + Math.sin(feedbackAge * 25) * (this.feedbackSwish ? .2 : .12) * feedback : 1;
    this.ring.visible = this.burst.visible = feedback > 0;
    this.ring.material.opacity = feedback * .55;
    this.ring.scale.setScalar(1 + (1 - feedback) * .2);
    this.burst.material.opacity = feedback * .65;
    this.burst.scale.setScalar(1 + (1 - feedback) * 1.1);
    this.burst.position.y = BASKETBALL_COURT.rim.center[1] + (1 - feedback) * .15;
    if (this.view.recentResult && nowMs - this.resultAtMs >= 1800) this.view.recentResult = null;
    if (this.view.active) { this.updateCamera(); this.positionHeld(); }
    this.publish();
  }

  dispose(): void {
    if (this.disposed) return;
    this.leave();
    this.disposed = true;
    this.world.scene.remove(this.root);
    this.root.clear();
    this.shots.clear();
    this.outcomes.clear();
    this.seen.clear();
    this.ballGeometry.dispose(); this.seamGeometry.dispose();
    this.ballMaterial.dispose(); this.seamMaterial.dispose();
    this.net.geometry.dispose(); (this.net.material as THREE.LineBasicMaterial).dispose();
    this.marks.geometry.dispose(); this.marks.material.dispose();
    this.ring.geometry.dispose(); this.ring.material.dispose();
    this.burst.geometry.dispose(); this.burst.material.dispose();
  }

  private addShot(launch: ShotLaunch, elapsedSeconds: number, local: boolean, authoritative = false): void {
    const nowMs = this.clock();
    this.seen.set(launch.shotId, nowMs);
    const ball = createBall(launch, elapsedSeconds);
    let slot = this.pool.find(candidate => !candidate.shot);
    if (!slot) {
      slot = this.pool.reduce((oldest, candidate) => candidate.shot!.launchedAtMs < oldest.shot!.launchedAtMs ? candidate : oldest);
      slot.shot!.slot = null; // Simulation continues even when its visual is recycled.
    }
    const shot: ActiveShot = { ball, localAttempt: local ? this.view.attempts + 1 : 0, launchedAtMs: nowMs - elapsedSeconds * 1000, slot, authoritative };
    slot.shot = shot;
    slot.group.visible = true;
    slot.group.position.fromArray(ball.position);
    slot.group.userData.basketballOpacity = Math.min(1, (LIFE_SECONDS - elapsedSeconds) / FADE_SECONDS);
    this.shots.add(shot);
  }

  private presentResult(result: ShotResult, localAttempt: number, nowMs: number): void {
    if (result.outcome === 'make') {
      this.feedbackAtMs = nowMs;
      this.feedbackSwish = result.swish;
      this.ring.material.color.set(result.swish ? '#e5ffbf' : '#ffd58a');
      this.burst.material.color.copy(this.ring.material.color);
    }
    if (!localAttempt) return;
    if (localAttempt >= this.latestResolvedAttempt) {
      this.latestResolvedAttempt = localAttempt;
      this.view.recentResult = result;
      this.resultAtMs = nowMs;
    }
    if (result.outcome === 'make') this.view.makes++;
    this.outcomes.set(localAttempt, result.outcome);
    // Fold completed attempts into a scalar; only outcomes awaiting an earlier shot remain.
    while (this.outcomes.has(this.completedThrough + 1)) {
      this.completedThrough++;
      this.completedStreak = this.outcomes.get(this.completedThrough) === 'make' ? this.completedStreak + 1 : 0;
      this.outcomes.delete(this.completedThrough);
    }
    let attempt = this.latestResolvedAttempt, tailStreak = 0;
    while (attempt > this.completedThrough && this.outcomes.get(attempt) === 'make') { tailStreak++; attempt--; }
    this.view.streak = tailStreak + (attempt === this.completedThrough ? this.completedStreak : 0);
    this.onResult?.(result);
  }

  private validLaunch(launch: ShotLaunch): boolean {
    return !!launch && launch.courtId === BASKETBALL_COURT.id && launch.version === 1 && typeof launch.shotId === 'string' && launch.shotId.length > 0 && launch.shotId.length <= 128 && BASKETBALL_COURT.spots.some(spot => spot.id === launch.spotId) && [launch.origin, launch.velocity].every(vector => Array.isArray(vector) && vector.length === 3 && vector.every(value => Number.isFinite(value) && Math.abs(value) <= 1000));
  }

  private positionHeld(): void {
    const camera = this.world.camera;
    const depth = .85;
    const halfHeight = depth * Math.tan(THREE.MathUtils.degToRad((camera?.fov ?? 76) / 2));
    if (camera) this.held.quaternion.copy(camera.quaternion);
    else this.held.quaternion.setFromEuler(this.heldRotation.set(this.world.playerPitch, this.world.playerYaw, 0));
    const x = this.heldScreenPosition ? this.heldScreenPosition.x * 2 - 1 : -.25;
    const y = this.heldScreenPosition ? 1 - this.heldScreenPosition.y * 2 : -.48;
    this.held.position.set(halfHeight * (camera?.aspect ?? 16 / 9) * x, halfHeight * y, -depth)
      .applyQuaternion(this.held.quaternion).add(this.world.playerPosition);
  }

  private updateCamera(): void {
    const camera = this.world.camera;
    if (camera) { camera.position.copy(this.world.playerPosition); camera.rotation.order = 'YXZ'; camera.rotation.set(this.world.playerPitch, this.world.playerYaw, 0); }
    if (this.world.playerAvatar) this.world.playerAvatar.visible = false;
    if (camera && this.world.skyDome) this.world.skyDome.position.copy(camera.position);
  }

  private publish(): void {
    const { minX, maxX, minZ, maxZ } = BASKETBALL_COURT.bounds;
    const position = this.world.playerPosition;
    this.view.nearby = position.x >= minX - 3 && position.x <= maxX + 3 && position.z >= minZ - 3 && position.z <= maxZ + 3;
    const key = JSON.stringify(this.view);
    if (key !== this.lastPublished) { this.lastPublished = key; this.onView(this.getSnapshot()); }
  }

  private makeBallMaterial(color: string, shaded: boolean): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
      vertexShader: `varying float shade; void main(){ shade=${shaded ? '.7 + .3 * max(dot(normalize(normalMatrix * normal), normalize(vec3(-.4, .8, .6))), 0.0)' : '1.0'}; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying float shade; void main(){ gl_FragColor=vec4(color*shade,opacity);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      transparent: true,
    });
  }

  private makeBall(name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    group.userData.basketballOpacity = 1;
    const body = new THREE.Mesh(this.ballGeometry, this.ballMaterial);
    const seams = new THREE.LineSegments(this.seamGeometry, this.seamMaterial);
    for (const object of [body, seams]) object.onBeforeRender = () => {
      object.material.uniforms.opacity.value = group.userData.basketballOpacity;
      object.material.uniformsNeedUpdate = true;
    };
    group.add(body, seams);
    return group;
  }
}
