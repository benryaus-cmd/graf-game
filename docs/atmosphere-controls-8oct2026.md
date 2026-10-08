# GraffCiti atmosphere controls — 8 October 2026

This client update adds cheap visual cover for a small render area and adjustable lighting/image demand. No server or importer change is needed. Apply after performance-logger-8oct2026.

## What the supplied phone recording shows

The city phase averaged 92.75 FPS; frame times were 10 ms median, 17 ms p95 and 23 ms p99, with a 67.1 ms maximum. The blank scene reached about 120 FPS. Render submission averaged 8.57 ms, while recorded construction work totalled 187.9 ms and logger overhead totalled about 110.7 ms across the 44.43 second recording. These timings do not measure device CPU utilisation or GPU time.

Chunk construction caused some recorded spikes, but the worst frame happened while stationary with no queued chunk in that half-second sample. It is not justified to attribute every hitch to streaming. The repeated prefetch/release pattern prompted a retention fix: desired prefetched chunks now refresh their retention timestamp.

## Controls

| Control | Use |
| --- | --- |
| Sky / time | Follow game sky, day, sunset, pastel, rain or night |
| Fog style | Exponential density or linear start/end; linear fog becomes completely solid at the end distance |
| Match sky to haze | Blend the lower sky to the exact fog colour |
| Solid haze sky | Fill the whole sky with the fog colour |
| Custom fog colour | Override the chosen time-of-day haze |
| Fog culling | Hide detailed chunks and proxies beyond the haze cutoff; corner padding adapts to perspective FOV/aspect/zoom |
| Ground extension / colour / reach | One plain two-triangle floor beneath the real floor, 1–20 chunks in each direction, recentered as you travel |
| Shared images / loads at once | Remote shared poster/flattened-art image range, 3–240 m; 1–7 concurrent requests |
| Ambient / sun-moon light | Independent brightness multipliers |
| Street lights | Switch real lamp lighting, bulbs and glow pools off/on |
| Cheap glow pools | Batched transparent radial floor patches that suggest light without illuminating other surfaces |
| Nearby real lights | Fixed pool of 0–4 shadow-free point lights; default 2 |
| Lamp power / reach / glow radius | Tune the appearance and footprint |
| Player light / power | Optional shadow-free light following player altitude; disabled by default |
| Prefetch distance | Adjustable 0–24 m travel lookahead |

Added street lamps use instanced geometry. Existing concrete lamp bodies are merged and share the nearby light pool. No shadows, bloom or volumetric fog were introduced. The fallback ground has no new paint surfaces or colliders. Real chunk collision/paint ownership remains intact. A selected painting wall stays pinned.

Image range applies to remote shared artwork, not terrain textures or restoration of your own solo paint. Already loaded artwork is hidden outside range and reused when you return; this avoids repeated downloads but does not evict its texture memory. Out-of-range in-flight image requests are cancelled. Your own artwork and the selected painting wall bypass the range limit.

Fog shading alone does not remove draw calls. The separate culling switch is what skips obscured city rendering; it does not shrink the collision-ready chunk neighbourhood. Changing fog type or real-light count can trigger a first shader warmup frame.

## Starting point for a hazy night test

Try NIGHT, LINEAR fog starting at 10 m and solid at 50 m, sky matching enabled, ground reach 8 chunks, detailed city at 48–60 m, shared images at 36–50 m and 1–2 image loads at once. Start with real lights at 0 and cheap glow pools on, then compare 1 or 2 real lights. Leave player light off initially. Ambient 1.3 and sun/moon .8 are useful starting values. Prefetch 8–12 m and retention 5–8 seconds can reduce boundary backtracking churn.

If a distant edge remains obvious, enable SOLID HAZE SKY or shorten the solid-fog distance before shortening detail range again. Compare the same route and camera movements with each lighting change. These are experimental settings, not a promised phone FPS result.

## Verification

- 300 automated tests passed, including bounded lights, altitude tracking, wide-view fog padding, sky colour through exposure changes, image demand/concurrency and existing paint/multiplayer coverage.
- TypeScript, changed-file lint, standalone production build and imported Aippy-host production build passed.
- Mobile-size browser checks covered night/day, linear fog, lamp shaders, controls/reset/landscape scrolling, performance-log context and paint pin/flatten/unload/restore.
- In one fixed browser scene, exponential fog culling reduced draw calls from 293 to 253 and triangles from 12,710 to 10,736. This is a draw-count check, not a device FPS benchmark. Browser QA used software rendering and substitute plain surface materials for unavailable remote texture requests.

Relevant implementation references: [Three fog manual](https://threejs.org/manual/en/fog.html), [Three lights manual](https://threejs.org/manual/en/lights.html). The implementation was also checked against the installed Three r184 shader order: tone mapping and colour conversion precede fog mixing.
