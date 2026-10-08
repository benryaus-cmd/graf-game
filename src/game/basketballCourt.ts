/** Shared world coordinates. Floor marks lie on the existing paved half court. */
const rimScale = 1.3;
const rimRadius = .28 * rimScale, rimTubeRadius = .035 * rimScale;
// Move the wider rim courtward so its back edge retains the original board clearance.
const rimZ = -40.08 + (rimRadius + rimTubeRadius - .28 - .035);
const backboard = { center: Object.freeze([-53, 3.35, -40.45] as const), width: 1.8, height: 1.1, depth: .08, paintZ: -40.408 };
const boardBounds = Object.freeze({
    minX: backboard.center[0] - backboard.width / 2, maxX: backboard.center[0] + backboard.width / 2,
    minY: backboard.center[1] - backboard.height / 2, maxY: backboard.center[1] + backboard.height / 2,
    minZ: backboard.center[2] - backboard.depth / 2, maxZ: backboard.center[2] + backboard.depth / 2,
});
// The centre mark is three degrees off-axis to clear the existing bench's seat.
const spots = [-60, -30, 3, 30, 60].map((angle, id) => {
    const radians = angle * Math.PI / 180;
    return Object.freeze({ id, position: Object.freeze([-53 + Math.sin(radians) * 5.5, 0, -40.08 + Math.cos(radians) * 5.5] as const) });
});
export const BASKETBALL_COURT = Object.freeze({
    id: 'map2-basketball', mapId: 'map2',
    bounds: Object.freeze({ minX: -61.5, maxX: -44.5, minZ: -41, maxZ: -31 }),
    rim: Object.freeze({ center: Object.freeze([-53, 3.05, rimZ] as const), radius: rimRadius, tubeRadius: rimTubeRadius }),
    backboard: Object.freeze({ ...backboard, bounds: boardBounds }),
    ballRadius: .12,
    spots: Object.freeze(spots),
});
