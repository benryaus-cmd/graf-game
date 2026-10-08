import type { CityBuildingDescription } from './cityBlockLayout';
import { FIXTURE_DEPTH, FIXTURE_HEIGHT } from './fixtureBuildingFaces';
import type { QuarterAssetKind } from './quarterBuildingAssets';
export interface QuarterBuilding extends CityBuildingDescription {
    id: string;
    color: string;
    imported?: boolean;
    yaw?: number;
    asset?: QuarterAssetKind;
}
const colors = ['#d2c5b5', '#b9c1b0', '#ceb4ac', '#b4bec3', '#cbbd98'];
const styles:QuarterAssetKind[]=['1Story_Sign','2Story_Balcony','2Story_Wide','2Story_GableRoof','3Story_Small'];
const shell = (id: string, x: number, z: number, width: number, depth: number, height: number, index: number): QuarterBuilding => ({ id, x, z, width, depth, height, color: colors[index % colors.length], tower: height >= 12, stairs: false, asset: styles[index%styles.length] });
export const QUARTER_BUILDINGS: readonly QuarterBuilding[] = [
    ...[-56, -40, -24, -8, 8, 24, 40, 56].map((x, i) => shell(`shop-${i}`, x, -55, 14, 20, [8, 10, 7, 10, 22, 9, 11, 8][i], i)),
    shell('yard-workshop', -53, -24, 24, 14, 7, 2), shell('yard-back', -53, 29, 24, 28, 10, 1),
    shell('alley-nw', -24, -17, 10, 17, 8, 0), shell('alley-sw', -24, 18, 10, 18, 7, 3),
    shell('alley-ne', 24, -17, 10, 17, 9, 2), shell('alley-se', 24, 18, 10, 18, 8, 1),
    shell('east-corner', 54, -18, 20, 23, 18, 3), shell('east-workshop', 57, 14, 16, 26, 8, 0),
    shell('south-west', -52, 60, 26, 14, 8, 4), shell('south-row-a', -12, 56, 12, 20, 9, 1),
    shell('south-row-b', 5, 56, 12, 20, 10, 2), shell('south-east', 58, 56, 22, 16, 11, 0),
    { ...shell('square-hero', 0, -18, 4, FIXTURE_DEPTH, FIXTURE_HEIGHT, 0), asset:undefined, imported: true, yaw: 0 },
    { ...shell('square-west', -15, -4, 4, FIXTURE_DEPTH, FIXTURE_HEIGHT, 0), asset:undefined, imported: true, yaw: 0 },
    { ...shell('square-east', 16, 0, FIXTURE_DEPTH, 4, FIXTURE_HEIGHT, 0), asset:undefined, imported: true, yaw: Math.PI / 2 },
    { ...shell('court-corner', 18, 38, 4, FIXTURE_DEPTH, FIXTURE_HEIGHT, 0), asset:undefined, imported: true, yaw: 0 },
];
export const QUARTER_TREES: readonly [
    number,
    number
][] = [[-9, -9], [9, 9], [22, 45], [35, 45], [22, 61], [35, 61]];
export const QUARTER_SPAWN = { x: 0, z: 5, yaw: 0 };
export const quarterChunk = (x: number, z: number) => `${Math.floor(x / 48 + .5)}:${Math.floor(z / 48 + .5)}`;
export const isQuarterChunk = (cx: number, cz: number) => Math.abs(cx) <= 1 && Math.abs(cz) <= 1;
export const isInsideBuilding = (x: number, z: number, padding = 0) => QUARTER_BUILDINGS.some(b => Math.abs(x - b.x) < b.width / 2 + padding && Math.abs(z - b.z) < b.depth / 2 + padding);
// Permanent poles: regularly spaced route lights plus square/court/yard lights.
const lampCandidates: [
    number,
    number
][] = [
    ...[-68, -42, -16, 16, 42, 68].flatMap(x => [[x, -68], [x, 68]] as [
        number,
        number
    ][]),
    ...[-48, -24, 0, 24, 48].flatMap(z => [[-68, z], [68, z]] as [
        number,
        number
    ][]),
    ...[-62, -48, -32, -16, 0, 16, 32, 48, 62].map(x => [x, -36] as [
        number,
        number
    ]),
    ...[-28, -14, 0, 14, 28, 42, 55].flatMap(z => [[-36, z], [37, z]] as [
        number,
        number
    ][]),
    ...[-60, -48, -24, 0, 24, 48, 62].map(x => [x, 37] as [
        number,
        number
    ]),
    ...[-60, -44, -28, -12, 12, 28, 44, 60].map(x => [x, 3] as [
        number,
        number
    ]),
    [0, 12], [-11, -11], [11, -11], [-11, 11], [11, 11], [-60, -9], [-60, 10], [-44, -9], [-44, 10],
    [20, 47], [37, 47], [20, 60], [37, 60], [-30, 51], [-28, 65], [13, 68], [44, 63], [-67, 48], [65, 40], [65, -40], [0, -40], [-61, -40], [-49, -40], [-61, 50], [47, 48], [48, 64],
];
export const QUARTER_LAMPS: readonly [
    number,
    number
][] = lampCandidates.filter(([x, z]) => !isInsideBuilding(x, z, .8));
export function quarterLayout(cx: number, cz: number) { return { buildings: QUARTER_BUILDINGS.filter(b => quarterChunk(b.x, b.z) === `${cx}:${cz}`), random: () => .5 }; }
