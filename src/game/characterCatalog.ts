export interface CharacterAnimationNames {
  idle: string;
  walk: string;
  run?: string;
  jump?: string;
  wave?: string;
}

export interface CharacterModel {
  id: CharacterModelId;
  label: string;
  url?: string;
  thumbnail?: string;
  animations?: CharacterAnimationNames;
}

export type CharacterModelId = 'original' | 'hoodie'
  | 'casual-female' | 'casual-male' | 'casual2-female' | 'casual2-male'
  | 'casual3-female' | 'casual3-male' | 'suit-female' | 'suit-male'
  | 'worker-female' | 'worker-male';

const QUATERNIUS_ANIMATIONS: CharacterAnimationNames = {
  idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump', wave: 'Victory',
};
const ASSET_BASE = 'https://raw.githubusercontent.com/benryaus-cmd/graf-game/9084a610a05b10e20ad75834bea5b19811bddf67/public/assets/characters/';

export const CHARACTER_MODELS: readonly CharacterModel[] = [
  { id: 'original', label: 'Original' },
  { id: 'hoodie', label: 'Hoodie', url: 'https://raw.githubusercontent.com/benryaus-cmd/graf-game/77b8bb73af715da9dbd691dbddae109316e394fd/public/assets/preview/male-hoodie.glb' },
  ...([
    ['casual-female', 'Casual · Female'], ['casual-male', 'Casual · Male'],
    ['casual2-female', 'Casual 2 · Female'], ['casual2-male', 'Casual 2 · Male'],
    ['casual3-female', 'Casual 3 · Female'], ['casual3-male', 'Casual 3 · Male'],
    ['suit-female', 'Suit · Female'], ['suit-male', 'Suit · Male'],
    ['worker-female', 'Worker · Female'], ['worker-male', 'Worker · Male'],
  ] as const).map(([id, label]) => ({ id, label, url: `${ASSET_BASE}${id}.glb`, thumbnail: `${ASSET_BASE}${id}.webp`, animations: id.startsWith('casual2-') || id.startsWith('casual3-')
    ? { idle: 'CharacterArmature|Idle', walk: 'CharacterArmature|Walk', run: 'CharacterArmature|Run', jump: 'CharacterArmature|Jump', wave: 'CharacterArmature|Victory' }
    : QUATERNIUS_ANIMATIONS })),
];

export function isCharacterModelId(value: unknown): value is CharacterModelId {
  return typeof value === 'string' && CHARACTER_MODELS.some((model) => model.id === value);
}

export function normalizeCharacterModelId(value: unknown): CharacterModelId {
  return isCharacterModelId(value) ? value : 'original';
}

export function getCharacterModel(id: unknown): CharacterModel {
  const normalized = normalizeCharacterModelId(id);
  return CHARACTER_MODELS.find((model) => model.id === normalized)!;
}
