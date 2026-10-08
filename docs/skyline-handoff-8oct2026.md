# Skyline handover — 8 October 2026

One runtime file: `src/game/cityHorizon.ts`. Apply after atmosphere-controls-8oct2026.

Flat silhouettes now start two metres before the available 3D representation ends. Plain range 68 m gives a 66 m start; if loaded detail continues to 69 m, that chunk hands over at 67 m. Selected pinned painting chunks retain their detail masking. Existing skyline toggle, minimum landmark height, width and maximum range remain effective.

The handover and shader far cutoff use the same player-to-chunk-edge distance as the 3D tiers. Proxy planning covers intra-chunk movement with half-chunk-diagonal padding; actual visible range remains unchanged. Missing or queued plain proxies leave their flat fallback available. This fixes the absent-building interval, rather than only moving the old shader threshold.

Verification: 302 tests passed; TypeScript and changed-file lint passed; standalone and imported-host production builds passed. Browser GPU readback confirmed the selected silhouette is hidden at 65.9 m and drawn at 66, 67, 68, 68.1, 70 and 90 m for a 68 m plain cutoff. Existing mobile control/lighting checks and paint pin/flatten/unload/restore checks also passed. No new textures, real lights, network requests or server changes.
