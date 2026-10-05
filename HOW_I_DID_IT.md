# HOW_I_DID_IT

## GitHub Importer Setup

A reusable importer was added to this project as **setup only**. Nothing was imported or replaced yet.

- Importer: `scripts/import-github.mjs` (Node 22 native fetch + `node:fs/promises`)
- Command: `pnpm run import:github`
- Upstream: `benryaus-cmd/graf-game`, branch `main`

### What it does

1. Fetches the **latest** `main` commit every time it is explicitly run — no revision numbers or markers to edit.
2. Resolves one commit, reads its Git Trees file list, and downloads every file from that **same commit**.
3. Imports all files under `src/` and `public/` into their identical existing project paths, including new files and binary assets.
4. Downloads everything into a staging directory **before** replacing anything. If any download fails, the existing game is left unchanged.
5. Backs up replaced files and restores them if applying the update fails.
6. Never touches: the importer itself, `package.json`, `vite.config.ts`, Aippy build configuration/plugins, `index.html`, `README.md`, `eslint.config.js`, `.env`, or `src/config/assets.*` (auto-generated).
7. Reports dependency differences between GitHub's `package.json` and the local one, so required changes can be merged manually without replacing Aippy's configuration.
8. Preserves saved paint, progression and settings — these live in browser localStorage, which the script never touches.
9. Records the imported commit SHA and file list in `import-record.json` **only after a successful import**.
10. Runs entirely in Node during development/build work — no browser-side GitHub fetching. No duplicate game, upstream folder, iframe, or additional React root is created.

### Usage

When I say **"Import latest GitHub"**:

1. Run `pnpm run import:github`.
2. Handle any required dependency changes reported by the diff (merge manually into `package.json`, keep Aippy's configuration).
3. Run the existing build command.

The import must finish **before** Vite generates the project-file manifest or compiles the game.
## Existing-server multiplayer integration

The game now has a thin browser client for the owner's already deployed service, with protocol-1 and protocol-2 compatibility. No backend, container, WebSocket service or VM configuration was created or changed.

- Endpoint configuration: `src/multiplayer/config.ts`, using `VITE_MULTIPLAYER_URL` with the production WSS fallback. Existing `.env` is preserved by the importer.
- UI: `MultiplayerControls.tsx`. Entering the world remains solo. JOIN MULTIPLAYER explicitly connects; CANCEL/SOLO leaves, and RECONNECT explicitly rejoins after a disconnect.
- Profile: App reads `useUserInfo()` from `@aippy/runtime/user`. Nickname, then @username, then PLAYER supplies the default name; avatar has a fallback. Loading is respected. No token, account database, profile writes or manual username lookup. Aippy uid is neither displayed nor sent as multiplayer identity.
- Lifecycle: `WorldScene` owns `WorldMultiplayerSession`; controls invoke its frame hook after local movement. Local controls/paint continue when offline.
- Protocol: `connection.ts` waits for server hello, uses the assigned playerId, joins public, and reports connected only after its matching snapshot. Room selection is an argument for later extension. Messages from obsolete sockets are ignored.
- Players: `playerSync.ts` sends changed transforms/action state at roughly 10 Hz, with a low-frequency idle heartbeat. `remotePlayers.ts` uses existing game avatars, interpolates position/rotation, adds display-name labels, and disposes departed avatars.
- Painting: `worldPainting.ts` calls its network hook after `stampPaintHit`. `paintSync.ts` records immediate local paint, batches up to 96 points about every 100 ms, splits long gestures at 16,000 samples, and emits stroke_end on release/cancel/tool-off. Colour/head-size changes preserve continuous paths across segments.
- Point format: real world x/y/z; pressure carries the current opacity for this painting engine. Brush size uses existing slider units; replay converts to the same radius with size/50 and the existing minimum radius. The live server clamps brushSize below 1, so world-radius fractions must not be sent as brushSize.
- IDs: deterministic chunk coordinates plus geometry signature form a versioned ss1 wall ID, independent of load order/Three UUIDs. `/fN/lN` identifies the face and layer. Layout changes need an explicit world-version migration rather than changing persisted addresses silently.
- Replay: `surfaces.ts` reconstructs tiled UVs using triangle barycentrics. `paintReplay.ts` invokes the existing stamp renderer, stages snapshots offscreen, and limits work to 256 samples/roughly 3 ms per frame. New local paint is also added to an active staging job before commit. Loading old artwork does not clear the visible canvas early.
- Echo handling: locally rendered stroke IDs suppress incoming live echoes. On a new snapshot, persisted strokes and retained local tails/drafts are composed once; a reconnect can receive a new connection playerId without double-painting old local IDs.
- Saves: `cityChunks` saves solo paint before changing sessions, preserves geometry/controller/camera, and keeps multiplayer paint out of solo PNG/poster storage. It restores solo paint on leaving. Delayed solo image decodes have session guards; unfinished saved images and new local overlays are retained together, including an in-memory fallback if browser storage fails. Fully erased cached layers are retained as blank so they do not resurrect on return.
- Resilience: capped transport buffers/message rate; failed sends cannot throw back into brush input. A disconnect during a held stroke preserves its connecting segment in offline replay. No aggressive automatic retry. Offline shared-session paint stays local, and reconnection reloads accepted server state while retaining local draft overlays. Offline drafts are not automatically published. Draft overlays last for the current running game; they are not a new durable offline-upload service.

This first integration shares spray/eraser strokes and player movement. Existing posters, generated bot art, avatar cosmetics, progression and other game settings remain game/local features; this client does not yet synchronise them through the expanded server capabilities. Aippy profile images appear locally; only the display name is included in the supplied join protocol. Remote characters use current game models, not downloaded replacements. Claim protection, credits, chat and premium painting tools remain later goals.

### Verification

- `npm test`: automated connection, replay, ID, interpolation, session/save-isolation, profile-default and input-order checks. Uses the existing esbuild dependency plus Node's test runner; no added runtime dependencies.
- `npm run build`: production Vite build checked.
- `node scripts/test-multiplayer.mjs --live`: explicit opt-in smoke check against the existing server. It joins public with temporary test display names and writes a tiny, faint floor stroke; it is not run by npm test.
- Live checks confirmed hello/join, two simultaneous clients, remote state, matching stroke messages, saved stroke IDs/points/brush size on a third late join, and player_left. The server's saved player/stroke objects use id; the client normalises those fields.
- Full TypeScript check still reports the same six pre-existing errors as the unchanged baseline: two in PosterStudio.tsx, three BlobPart errors in dev/zip.ts, and generateBotArtwork.ts's unsupported quality option. There are no added multiplayer TypeScript errors. These unrelated existing features were not rewritten for networking.
- No WebGL-capable local browser was available for visual/phone verification of this new build. The live protocol and renderer-call checks are not a claim of measured mobile FPS or a completed end-to-end visual playtest.

### Import and play

Run the existing `pnpm run import:github`, then the normal build. No new package dependency or server deployment is needed. Open the game in Aippy, enter the world, then choose JOIN MULTIPLAYER. Open another client to see shared strokes and player movement. SOLO returns to local paint saves.

### Protocol 2 compatibility fix

The upgraded live server now reports protocol 2 in hello. The client accepts verified versions 1 and 2, continues using the existing join/player/stroke messages, and rejects unknown versions with the received version in the notice. The expanded protocol-2 snapshot retains the existing strokes and players fields. Additional server capabilities are not automatically implemented by this handshake fix. The one-file Aippy update is updates/multiplayer-protocol-2.json.

Verification of this fix: 22 automated tests, the Vite production build, changed-file lint and a live protocol-2 check passed. The live check covered two players, movement, shared paint, persistence on a later join and departure. No server infrastructure was changed.

### Completed protocol 2 client extension

The supplied existing server is still the only backend. No containers, services, infrastructure, account system or dependencies were added. The game retains its current controller, world and paint renderer.

- JOIN MULTIPLAYER, SOLO and RECONNECT remain visible. Aippy nickname/handle/avatar are read once with useUserInfo; no UID or token is sent as account verification. Public chat includes bounded history, plaintext rendering, server timestamps and a Resync button.
- Paint/eraser begins carry operation, opacity, face and layer. Protocol 2 uses pressure=1 for this current non-pressure input engine and preserves opacity separately; old protocol 1 uses pressure=opacity with metadata opacity=1. Same surface/UV/brush renderer is reused.
- Remote movement is interpolated; existing outfits, colour slots, held accessories, emotes and flight state are shared. Transient emotes use player_action.data with action IDs.
- Real server packets exclude the stroke originator. Global sequences therefore need monotonic ordering, not contiguous gap checks. Own completed strokes/artworks request one full snapshot after the brush is idle for 1.5 seconds and no reconstruction is underway. Same-connection snapshots retain active points/send cursor. Recomposition requests coalesce instead of restarting a long replay on every stroke end. Whole-stroke final sequence ordering makes settled replay deterministic; the server does not provide per-point historical sequence data.
- Existing poster placement still appears immediately. Data URLs convert to PNG/JPEG/WebP Blob; binary POST goes to the existing /artwork-upload endpoint with a 5 MB limit. SHA-256 content caching shares one in-flight/completed upload across reuses. WebSocket artwork_place contains only the returned HTTPS assetRef and placement metadata (rotation is the existing local quaternion). Snapshot artwork becomes the same existing poster overlay; accepted sequence controls overlap order regardless of load completion. Late uploads never publish across disconnect/rejoin identities. Failed/offline posters stay local.
- Inventory/world-item/trade adapters are gated. No account-backed operation sends while verification is unavailable. Solo currency/closet remain local, purchases/rewards are paused in multiplayer, and visual solo looks can still be worn. Bot mural painting is solo-only.

Verification: 38 automated client/geometry/canvas tests passed, changed-source lint passed and the Vite production build passed. Live trusted WSS peers verified protocol-2 join, presence, enriched visual metadata, player_action, eraser metadata, artwork_place/artwork_placed, persisted late joins, full resync and departure. A genuine backend blocker remains: player_state strips state.position for both numeric arrays and x/y/z objects; rotation, movement and cosmetics are forwarded. The client cannot spawn/interpolate remote players from those incomplete packets. The existing server must preserve state.position [x,y,z] in broadcasts and saved player state; no fake spawn coordinates or replacement server were introduced. A real 67-byte PNG binary upload returned a persistent assetRef; its image decoded successfully. Testing added a tiny floor eraser sample and a 5 cm floor poster, plus one empty stroke during sender-echo investigation. No public chat messages were posted. The Node native-WebSocket smoke test timed out in this workspace; the live wire check used Python’s WebSocket client instead. Browser/WebGL visual and mobile performance testing remain unverified.

The captured live wire fixture is included in tests/fixtures/protocol2.json; regression coverage rejects the missing-position packet rather than claiming movement is verified.

Explicit app TypeScript checking reports the same six pre-existing errors in PosterStudio, dev/zip and generateBotArtwork; no new multiplayer errors. Build/lint/client tests pass.

Aippy refresh uses updates/multiplayer-v2-features.json: download every listed source into its exact target, preserve all other files/saves/settings/shell/README, then run the normal build. The full-game manifest also includes the new modules for any future fresh import.
