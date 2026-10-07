// Local guides and canvas UI must draw after artwork's server-sequence ordering.
// These orders do not change any paint/poster stacking or captured pixels.
const UI_ORDER = Number.MAX_SAFE_INTEGER - 16;
export const REFERENCE_ABOVE_ORDER = UI_ORDER;
export const WORKSPACE_FILL_ORDER = UI_ORDER + 1;
export const WORKSPACE_OUTLINE_ORDER = UI_ORDER + 2;
export const WORKSPACE_EDGE_ORDER = UI_ORDER + 3;
