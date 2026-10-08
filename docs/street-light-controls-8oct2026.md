# Street light controls — 8 October 2026

The renderer and settings previously limited street lights to four. Real street lights now default to twelve, with an editable count from 0 to 32 in Live Settings. `LIGHTS ON WITHIN (m)` defaults to 60 and supports 2–120 metres. Both controls apply live and persist. The nearest eligible lamps receive the requested number of real lights; the player light is separate.

Activation uses player distance independently of building detail, fog visibility and lamp illumination reach. The real-light pool grows only as needed and reuses inactive slots. No shadow casting or additional models are introduced.

Existing Map 2 preferences adopt twelve once, preserving sky, activation distance and other settings. Later count choices persist. A regression covers a selected Map 2 with a saved map snapshot but no global settings key.

Validation: `npm test`, application TypeScript, ESLint, standalone Vite build and imported host build passed. Browser checks exercised count 20, distance 12, count 4, count 0, reset to 12, and reload persistence. No page or shader errors were observed. Mobile FPS has not been measured for this update.

Delivery replaces only DeveloperPanel, cityAtmosphere, mapPreference and renderSettings. Map geometry, paint addresses, artwork, backend, importer and dependencies are unchanged.
