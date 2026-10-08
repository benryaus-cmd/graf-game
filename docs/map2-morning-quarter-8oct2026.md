# Map 2: Morning Quarter

Open GAME MENU, choose MAP 2 · MORNING QUARTER. The same menu returns to MAP 1 · ORIGINAL. Map 2 is local solo; painted walls, floor, posters and piece names use a separate map2-v1 namespace. Both maps remember their own atmosphere settings and sky choice.

The finite district is 144×144 m: a square, eight shop fronts, paint yard/loading canopy, connected lanes, tree court and game pocket. Four shared copies of the existing pinned Quaternius building and six shared trees accompany concrete-grain shells. One floor per chunk has baked paving, keeping paint and posters visible. Small shop signs, benches and planters give gathering spaces identity.

80 permanent lamp positions cover the walking space. Bulbs, poles and glow pools are instanced; the same four nearby point lights are reused, with no lamp shadows. The player light is separate. Nightfall in CHANGE SKY enables street lighting and warm window emission. STREET LIGHTS and CHEAP GLOW POOLS remain independently adjustable.

In LIVE GAME SETTINGS, HEIGHT RANGES enables the two classes: below HEIGHT SPLIT and at/above HEIGHT SPLIT. SHORT and TALL each have DETAIL, SIMPLE 3D and FLAT 2D maximum ranges. Initial split12m; short48/68/160m and tall60/84/400m. Values normalize to detail≤simple≤flat. Flat silhouettes start2m before the available3D cutoff, and early proxy fallback covers missing resident detail. Painting pins the selected detail context. The backdrop derives from the same footprints as its nearby buildings.

LAMP ACTIVATION is player-to-lamp distance; LAMP FADE is the last band of that distance. LAMP REACH is the physical light radius. Defaults activation48m/fade8m. SHARED IMAGES controls downloads and display distance; IMAGE LOADS AT ONCE controls concurrency. MORNING PRESET applies the approved cotton-candy tuning.

Validation:309 tests pass; type check, lint, production and Aippy single-file host builds pass. Browser-tested map paint reload, one canvas, no multiplayer join, settings entry, night auto lighting, morning preset, mobile portrait/landscape, and no shader errors. Existing Map1 runtime source baseline matched remote main. Source asset licenses and original importer/server are preserved. Browser rendering is not an Android FPS measurement.
