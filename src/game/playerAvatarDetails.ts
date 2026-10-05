import * as THREE from 'three';
import { addAvatarMesh, makeAvatarGroup } from '@/game/avatarGeometry';

export interface AvatarDetails {
  jaxDetails: THREE.Group;
  pomniDetails: THREE.Group;
  ringmasterDetails: THREE.Group;
  accessories: Record<string, THREE.Group>;
}

export function createAvatarDetails(avatar: THREE.Group): AvatarDetails {
  const dark = new THREE.MeshStandardMaterial({ color: '#252b31', roughness: 0.82 });
  const red = new THREE.MeshStandardMaterial({ color: '#d7374a', roughness: 0.8 });
  const blue = new THREE.MeshStandardMaterial({ color: '#315dcc', roughness: 0.8 });
  const purple = new THREE.MeshStandardMaterial({ color: '#a55bdd', roughness: 0.78 });
  const gold = new THREE.MeshStandardMaterial({ color: '#f4d447', roughness: 0.72 });
  const black = new THREE.MeshStandardMaterial({ color: '#1c2024', roughness: 0.75 });
  const jaxDetails = makeAvatarGroup(avatar);
  [-1, 1].forEach((side) => {
    const ear = addAvatarMesh(jaxDetails, new THREE.CapsuleGeometry(0.07, 0.35, 4, 8), purple, side * 0.16, 2.34, 0);
    ear.rotation.z = side * -0.1;
  });
  const pomniDetails = makeAvatarGroup(avatar);
  addAvatarMesh(pomniDetails, new THREE.ConeGeometry(0.19, 0.5, 8), red, -0.18, 2.23, 0);
  addAvatarMesh(pomniDetails, new THREE.ConeGeometry(0.19, 0.5, 8), blue, 0.18, 2.23, 0);
  const ringmasterDetails = makeAvatarGroup(avatar);
  addAvatarMesh(ringmasterDetails, new THREE.CylinderGeometry(0.16, 0.2, 0.11, 10), dark, 0, 2.11, 0);
  addAvatarMesh(ringmasterDetails, new THREE.CylinderGeometry(0.12, 0.12, 0.36, 10), dark, 0, 2.34, 0);
  addAvatarMesh(ringmasterDetails, new THREE.CylinderGeometry(0.014, 0.014, 1.05, 6), dark, 0.54, 0.68, 0.12);

  const accessories: Record<string, THREE.Group> = {};
  const cap = makeAvatarGroup(avatar);
  addAvatarMesh(cap, new THREE.SphereGeometry(0.29, 12, 8), red, 0, 2.03, 0);
  addAvatarMesh(cap, new THREE.BoxGeometry(0.38, 0.055, 0.28), red, 0, 1.96, 0.18);
  accessories.cap = cap;
  const headphones = makeAvatarGroup(avatar);
  [-1, 1].forEach((side) => addAvatarMesh(headphones, new THREE.SphereGeometry(0.105, 10, 8), dark, side * 0.34, 1.82, 0));
  accessories.headphones = headphones;
  const shades = makeAvatarGroup(avatar);
  [-1, 1].forEach((side) => addAvatarMesh(shades, new THREE.BoxGeometry(0.15, 0.09, 0.035), dark, side * 0.12, 1.86, 0.3));
  accessories.shades = shades;
  const backpack = makeAvatarGroup(avatar);
  addAvatarMesh(backpack, new THREE.BoxGeometry(0.38, 0.44, 0.18), new THREE.MeshStandardMaterial({ color: '#587365' }), 0, 1.05, -0.27);
  accessories.backpack = backpack;
  const scarf = makeAvatarGroup(avatar);
  addAvatarMesh(scarf, new THREE.TorusGeometry(0.2, 0.055, 6, 14), new THREE.MeshStandardMaterial({ color: '#e87365' }), 0, 1.48, 0);
  accessories.scarf = scarf;

  const smileyBall = makeAvatarGroup(avatar);
  addAvatarMesh(smileyBall, new THREE.SphereGeometry(0.17, 12, 10), gold, -0.39, 1.43, -0.02);
  [-1, 1].forEach((side) => addAvatarMesh(smileyBall, new THREE.SphereGeometry(0.018, 6, 5), black, -0.39 + side * 0.045, 1.46, 0.13));
  const ballSmile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.445, 1.405, 0.132), new THREE.Vector3(-0.39, 1.385, 0.15),
    new THREE.Vector3(-0.335, 1.405, 0.132),
  ]);
  addAvatarMesh(smileyBall, new THREE.TubeGeometry(ballSmile, 8, 0.009, 5, false), black, 0, 0, 0);
  accessories.smileyBall = smileyBall;

  const tie = makeAvatarGroup(avatar);
  addAvatarMesh(tie, new THREE.BoxGeometry(0.12, 0.09, 0.045), red, 0, 1.44, 0.2);
  const tieTip = addAvatarMesh(tie, new THREE.ConeGeometry(0.09, 0.42, 4), red, 0, 1.17, 0.2);
  tieTip.rotation.z = Math.PI;
  accessories.tie = tie;
  const wings = makeAvatarGroup(avatar);
  [-1, 1].forEach((side) => {
    const wing = addAvatarMesh(wings, new THREE.SphereGeometry(0.23, 12, 10), new THREE.MeshStandardMaterial({ color: '#e5e1d8', roughness: 0.82 }), side * 0.34, 1.38, -0.25);
    wing.scale.set(0.65, 1.35, 0.42);
    wing.rotation.z = side * -0.38;
  });
  accessories.wings = wings;
  const basketball = makeAvatarGroup(avatar);
  addAvatarMesh(basketball, new THREE.SphereGeometry(0.22, 14, 12), new THREE.MeshStandardMaterial({ color: '#e97930', roughness: 0.66 }), 0.58, 0.78, 0.18);
  const ballStripeA = addAvatarMesh(basketball, new THREE.TorusGeometry(0.15, 0.009, 5, 18), black, 0.58, 0.78, 0.18);
  ballStripeA.rotation.y = Math.PI / 2;
  const ballStripeB = addAvatarMesh(basketball, new THREE.TorusGeometry(0.15, 0.009, 5, 18), black, 0.58, 0.78, 0.18);
  ballStripeB.rotation.x = Math.PI / 2;
  accessories.basketball = basketball;
  const sprayCan = makeAvatarGroup(avatar);
  addAvatarMesh(sprayCan, new THREE.CylinderGeometry(0.075, 0.09, 0.35, 10), new THREE.MeshStandardMaterial({ color: '#d7d3c9', metalness: 0.35, roughness: 0.5 }), 0.58, 0.78, 0.17);
  addAvatarMesh(sprayCan, new THREE.CylinderGeometry(0.065, 0.065, 0.08, 10), red, 0.58, 0.99, 0.17);
  addAvatarMesh(sprayCan, new THREE.BoxGeometry(0.08, 0.04, 0.06), dark, 0.58, 1.05, 0.17);
  accessories.sprayCan = sprayCan;

  [jaxDetails, pomniDetails, ringmasterDetails, ...Object.values(accessories)].forEach((group) => { group.visible = false; });
  return { jaxDetails, pomniDetails, ringmasterDetails, accessories };
}