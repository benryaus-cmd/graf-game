# Map 2 night and streets polish

Open GAME MENU → MAP 2 · MORNING QUARTER. The existing local Map 2 now adopts night and street lights once. Bulbs and cheap ground pools activate through 60 metres with no fade by default. Later sky and lighting choices are remembered. The current device settings take precedence over an older map-switch snapshot; all other settings and saves are preserved.

Central entrances face the square; east-side doors face the lane, and south-row doors face back into town. Whole building roots turn after their existing paint addresses are assigned. Cached paint matrices, body collisions, roofs and the simplified/flat LOD footprints follow the new orientation. Existing wall slots, individual brick targets, benches and separate Map 1/Map 2 artwork remain intact. New backboard paint targets append last.

Shop labels sit above the actual asset doors or on their sign boards. Grass is now the base floor, with connected paving, building aprons, the square, tree court and yard baked into the existing floor texture. Raised tree beds match the darker green. Sixteen small shrub clusters use instancing. A single neighbourhood basketball hoop and marked shooting area dress the north-west pocket; tables remain at its sides.

There are still at most four pooled street PointLights plus the player light, without shadows. Visible lamps and pools use instancing; shrub clusters add one draw per occupied chunk. The hoop uses existing prop batches and one small rim mesh. No additional model downloads, dependencies, server changes or full import.

Validation: 321 tests, application TypeScript, lint, standalone build and Aippy host build; browser night/day and portrait/landscape views, walking, saved brick/bench painting, reload, map switching and triangular workspace framing. Five building styles load once per world. Desktop checks do not establish phone FPS; use a fresh City walk log for the device result.

The five-file incremental update requires the installed Map 2 premium pass. Preserve all unlisted files, importer, host wrapper, aliases, dependencies and saved art.
