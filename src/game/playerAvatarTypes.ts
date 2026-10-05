import * as THREE from 'three';
import type { AvatarDetails } from '@/game/playerAvatarDetails';

export interface AvatarParts extends AvatarDetails {
  shirt: THREE.Material[];
  pants: THREE.Material[];
  headMaterial: THREE.Material;
  hair: THREE.Mesh;
  defaultFace: THREE.Group;
  smileyFace: THREE.Group;
  headGroup: THREE.Group;
  arms: THREE.Group[];
  legs: THREE.Group[];
  questionMarks: THREE.Group;
  tears: THREE.Mesh[];
  sleepyZs: THREE.Group;
}