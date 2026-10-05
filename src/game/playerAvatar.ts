import * as THREE from 'three';
import { addAvatarMesh, makeAvatarGroup } from '@/game/avatarGeometry';
import { createAvatarDetails } from '@/game/playerAvatarDetails';
import type { AvatarParts } from '@/game/playerAvatarTypes';

function addQuestionMark(parent: THREE.Group, material: THREE.Material, x: number, scale: number): void {
  const mark = makeAvatarGroup(parent);
  mark.position.x = x;
  mark.scale.setScalar(scale);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.075, 0.015, 0),
    new THREE.Vector3(-0.085, 0.09, 0),
    new THREE.Vector3(-0.04, 0.16, 0),
    new THREE.Vector3(0.035, 0.17, 0),
    new THREE.Vector3(0.075, 0.12, 0),
    new THREE.Vector3(0.045, 0.065, 0),
    new THREE.Vector3(0, 0.025, 0),
  ]);
  addAvatarMesh(mark, new THREE.TubeGeometry(curve, 16, 0.018, 6, false), material, 0, 0, 0);
  addAvatarMesh(mark, new THREE.SphereGeometry(0.022, 8, 6), material, 0, -0.045, 0);
}

function createSleepyZGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.09, 0.12);
  shape.lineTo(0.09, 0.12);
  shape.lineTo(0.09, 0.075);
  shape.lineTo(-0.015, -0.075);
  shape.lineTo(0.09, -0.075);
  shape.lineTo(0.09, -0.12);
  shape.lineTo(-0.09, -0.12);
  shape.lineTo(-0.09, -0.075);
  shape.lineTo(0.015, 0.075);
  shape.lineTo(-0.09, 0.075);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export function createPlayerAvatar(scene: THREE.Scene): THREE.Group {
  const avatar = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: '#e87851', roughness: 0.82 });
  const pants = new THREE.MeshStandardMaterial({ color: '#353a40', roughness: 0.88 });
  const skin = new THREE.MeshStandardMaterial({ color: '#d6a887', roughness: 0.84 });
  const dark = new THREE.MeshStandardMaterial({ color: '#252b31', roughness: 0.82 });
  const topMesh = addAvatarMesh(avatar, new THREE.BoxGeometry(0.64, 0.74, 0.36), shirt, 0, 1.1, 0);
  const hips = addAvatarMesh(avatar, new THREE.BoxGeometry(0.53, 0.25, 0.33), pants, 0, 0.68, 0);
  const headGroup = makeAvatarGroup(avatar);
  headGroup.position.set(0, 1.82, 0);
  const head = addAvatarMesh(headGroup, new THREE.SphereGeometry(0.34, 16, 14), skin, 0, 0, 0);
  const hair = addAvatarMesh(headGroup, new THREE.SphereGeometry(0.345, 14, 10), dark, 0, 0.2, -0.03);
  hair.scale.set(1, 0.52, 1);

  const defaultFace = makeAvatarGroup(headGroup);
  [-1, 1].forEach((side) => {
    addAvatarMesh(defaultFace, new THREE.SphereGeometry(0.045, 10, 8), dark, side * 0.12, 0.04, 0.3);
  });
  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.1, -0.1, 0.302),
    new THREE.Vector3(0, -0.13, 0.315),
    new THREE.Vector3(0.1, -0.1, 0.302),
  ]);
  addAvatarMesh(defaultFace, new THREE.TubeGeometry(smileCurve, 8, 0.015, 5, false), dark, 0, 0, 0);
  const smileyFace = makeAvatarGroup(headGroup);
  [-1, 1].forEach((side) => {
    addAvatarMesh(smileyFace, new THREE.SphereGeometry(0.045, 10, 8), dark, side * 0.12, 0.05, 0.3);
  });
  const veritySmile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.13, -0.06, 0.3),
    new THREE.Vector3(-0.07, -0.14, 0.32),
    new THREE.Vector3(0, -0.16, 0.325),
    new THREE.Vector3(0.07, -0.14, 0.32),
    new THREE.Vector3(0.13, -0.06, 0.3),
  ]);
  addAvatarMesh(smileyFace, new THREE.TubeGeometry(veritySmile, 12, 0.022, 6, false), dark, 0, 0, 0);

  const arms: THREE.Group[] = [];
  [-1, 1].forEach((side) => {
    const arm = makeAvatarGroup(avatar);
    arm.position.set(side * 0.39, 1.35, 0);
    addAvatarMesh(arm, new THREE.CapsuleGeometry(0.105, 0.43, 4, 8), shirt, 0, -0.28, 0);
    addAvatarMesh(arm, new THREE.SphereGeometry(0.095, 10, 8), skin, 0, -0.6, 0.02);
    arms.push(arm);
  });
  const legs: THREE.Group[] = [];
  [-1, 1].forEach((side) => {
    const leg = makeAvatarGroup(avatar);
    leg.position.set(side * 0.17, 0.58, 0);
    addAvatarMesh(leg, new THREE.CapsuleGeometry(0.13, 0.43, 4, 8), pants, 0, -0.27, 0);
    addAvatarMesh(leg, new THREE.BoxGeometry(0.23, 0.12, 0.34), dark, 0, -0.59, 0.055);
    legs.push(leg);
  });

  const questionMaterial = new THREE.MeshBasicMaterial({ color: '#ffe978', side: THREE.DoubleSide });
  const questionMarks = makeAvatarGroup(avatar);
  questionMarks.position.set(0, 2.32, 0.24);
  addQuestionMark(questionMarks, questionMaterial, -0.13, 0.9);
  addQuestionMark(questionMarks, questionMaterial, 0.13, 0.68);
  questionMarks.visible = false;

  const tearMaterial = new THREE.MeshBasicMaterial({ color: '#54cfff' });
  const tears = [-1, 1].map((side) => {
    const tear = addAvatarMesh(
      headGroup,
      new THREE.SphereGeometry(0.045, 10, 8),
      tearMaterial,
      side * 0.14,
      -0.08,
      0.32,
    );
    tear.scale.set(0.72, 1.55, 0.7);
    tear.visible = false;
    return tear;
  });

  const sleepyZs = makeAvatarGroup(avatar);
  sleepyZs.position.set(0.1, 2.34, 0.3);
  const zGeometry = createSleepyZGeometry();
  const zMaterial = new THREE.MeshBasicMaterial({ color: '#b8d8ff', side: THREE.DoubleSide });
  const firstZ = addAvatarMesh(sleepyZs, zGeometry, zMaterial, -0.08, 0, 0);
  firstZ.rotation.z = -0.16;
  const secondZ = addAvatarMesh(sleepyZs, zGeometry, zMaterial, 0.12, 0.18, 0);
  secondZ.scale.setScalar(0.72);
  secondZ.rotation.z = 0.12;
  sleepyZs.visible = false;

  avatar.userData.parts = {
    ...createAvatarDetails(avatar),
    shirt: [topMesh.material],
    pants: [hips.material],
    headMaterial: head.material,
    hair,
    defaultFace,
    smileyFace,
    headGroup,
    arms,
    legs,
    questionMarks,
    tears,
    sleepyZs,
  } satisfies AvatarParts;
  scene.add(avatar);
  return avatar;
}