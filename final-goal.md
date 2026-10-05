# Final goal: SIDESTREET — a premium graffiti world

Updated: 6 October 2026 (Australia/Sydney).

Repository: https://github.com/benryaus-cmd/graf-game  
Live reference: https://aippy.ai/@PinkYyyy/street-art-canvas-aV7b

This is the working destination for future development. It describes intended behaviour, not completed features. Later instructions from the owner take precedence. Keep the GitHub-to-Aippy importer working as the game evolves.

**Owner's latest implementation instruction:** The multiplayer backend is already built, deployed and tested. Integrate the existing game with it. Preserve the current world and functioning painting system for this integration. Do not create another backend, VM service, Docker container, WebSocket server or multiplayer architecture. The broader overhaul below remains the long-term destination, not permission to replace the game during this initial integration.

## Direction: keep the world and spraying foundation; rebuild the experience

Keep the existing Three.js world, useful geometry/chunks and basic wall-painting foundation. Rebuild the controls, HUD, painting workflow and supporting systems as needed. The owner has authorised a substantial overhaul; retaining existing menus, bots, primitive avatars or poster features is not a goal. Preserve existing saved artwork during migration where practical, without letting old saves overwrite the shared world.

The game should feel like a serious graffiti sandbox: expressive handmade art, clean controls, convincing characters, a city worth exploring and an optional persistent social world. Premium quality means control feel and painting quality first, followed by coherent presentation and dependable persistence. It does not mean adding every possible feature at once.

**Solo by default. Join the shared server deliberately. My movement, looking and brush respond immediately, including on bad internet.** Remote players and their strokes may arrive late; my own input must never wait for a network round trip.

Remove the AI image/poster generator. Players make their own art, tags, throw-ups and signatures. Replace the prompt-and-generate workflow with a handmade art library and drawing tools.

## What the current review establishes

The owner confirms spraying works, and supplied a portrait screenshot showing red/green paint on a concrete wall. The immediate problem is having to open the paint menu to enable spray, close it to paint, and reopen it to disable spray. The screenshot also shows visibly coarse/jagged paint edges and a crowded header. Those are the priorities, not a claim that paint deposition is broken.

A separate live-browser session rendered the world, opened the Paint Station, selected green and toggled spray. Its unsuccessful targeting clicks were inconclusive and are superseded by the owner's positive painting evidence. The first browser had WebGL disabled; that was an environment limitation. The GitHub-matched project snapshot built successfully with npm run build. None of this proves good touch-control feel, measured frame rate or multiplayer readiness.

Source inspection provides useful starting points:

- GameHud combines several decorative/status rows, large actions, a movement joystick, jump and a paint dock.
- worldControls uses canvas dragging for looking or painting depending on paint mode. These inputs compete.
- worldPainting raycasts paintable walls with a 160-world-unit cutoff. Foreground non-paintable occlusion and a fixed selected surface need explicit handling.
- Paint layers use fixed-resolution canvases per face with linear texture filtering. Strokes connect samples, but this alone does not establish sufficient detail or good stabilisation.
- Paint and credits are saved in browser localStorage. App awards a coin for spraying at an 800 ms throttle; that cannot remain the shared economy.
- PosterStudio contains the AI prompt/generation workflow that should be removed.
- Existing world chunks and paint layers are useful foundations, but mutable wall indices must become stable surface IDs.

The screenshot cannot establish whether texture density, sampling, projection or several factors caused the rough edges. Measure those separately during implementation.

[Alternative live session report](https://agent.tinyfish.ai/runs/3afe04a0-d9d0-4c37-9ff6-e6429ec844c2).

## Clean controls and a compact HUD

Use an independent **left movement thumb control** and **right look thumb control**. Support both simultaneously, including while paint is enabled. Keep jump reachable. Preserve keyboard/mouse support.

Put the colour selector and active tool/head in a compact top strip. Keep size and undo close at hand; open advanced palette, head tuning, layers and the art library only when needed. Reduce branding and decorative text. Put secondary settings in one small menu. Smaller readable text must not mean tiny touch targets.

Provide a persistent, directly reachable **Paint / Explore toggle** outside the expanded paint menu. One tap enables painting/selection; one tap returns to exploration. Opening the palette only changes tools or colour. Closing it must not be the mechanism for starting or stopping spray.

Enabling paint does not deposit paint automatically. Initially tap a surface to select an area; once selected, press/drag on it to paint. Show a small active-tool indicator and brush preview. Let artists stop painting or release the selected area without hunting through a modal. Avoid several overlapping switches whose combined state is unclear.

Every pointer has one owner: movement, look, brush or UI. Right-look input never deposits paint; UI taps never fall through to the world. Pointer release, cancellation, lost focus and menu entry stop held actions. Typing in chat disables gameplay keyboard handling.

Put **Portrait / Landscape** at the top right. Change the drawing/view orientation without reload, lost paint or multiplayer disconnect. Use native orientation control when available and an in-app rotated/reflowed view fallback otherwise. Transform pointer coordinates and control positions correctly. Preserve artwork aspect ratio, selected surface, draft and camera state; never stretch the painting to fill the screen.

## Choose a real surface and preview a painting box

Flow: **Paint → tap surface → see attached box → adjust/confirm → paint**. Selection taps do not paint.

Attach the preview rectangle to a stable surface/face in world coordinates. It must stay on that surface as the camera moves. Show availability, dimensions and any price before confirmation. Start with a useful bounded area; allow resizing/repositioning up to a hard maximum. Extra area costs credits. Standard size, maximum size, reach and prices are tuning values, not fixed promises here.

Respect actual geometry, nearby reach and the nearest foreground obstruction, including non-paintable solid objects. A doorway is a hole, not a continuous canvas. A selected wall must never turn into a target on a distant building through the doorway. Do not fall back to another wall when the chosen surface is missed. Break the stroke across invalid hits rather than connecting across empty space.

Ordinary tools, erasers and reusable art are clipped to the chosen region and surface. Boxes cannot bridge holes or invalid geometry. Preview invalid placement clearly. The special drizzle exception is defined below.

In the shared world, confirmation requests a server claim. Show a pending box immediately and preserve provisional local draft strokes while it is being checked. Pending paint cannot overwrite confirmed shared art. If refused, keep the draft and offer another valid area. In solo, the same selection flow works locally.

## Smooth, sharp, expressive paint

Treat input smoothing and visible pixel size as separate problems. Lowering texture resolution would make pixels larger; the goal is cleaner edges and appropriate detail at normal painting distance.

Resample strokes at consistent spacing in surface coordinates, interpolate gaps, and offer adjustable stabilisation. Keep its default light enough for responsive handwriting and intentional corners. Support coalesced pointer samples and stylus pressure where available; mouse/touch must still feel good. Use frame-rate-independent paint accumulation so slow frames do not change coverage.

Allocate texture detail according to physical artwork size and intended viewing distance. Avoid stretching one modest square texture across an enormous face. Evaluate bounded artwork patches or tiles, antialiased brush masks, correct UV scale and physical brush widths. Raise active-area detail within a measured GPU/memory budget; do not make every distant wall an enormous texture. Preserve sharper source art when resizing a reusable tag.

Update dirty paint surfaces at most as needed per frame; avoid repeated full-texture upload, PNG encoding or saving in the brush input handler. Load/composite snapshots without blocking strokes. Compare the same mark at close, normal and distant viewing ranges on a representative phone.

### Tools and heads

| Tool/head | Intended behaviour |
| --- | --- |
| Fine/skinny cap | Controlled outlines, lettering and highlights; narrow adjustable soft edge. |
| Standard cap | Balanced general drawing and fills. |
| Fat cap | Broad fills and gradients with soft overspray. |
| Flat/chisel head | Directional strokes, handstyles and broad edges. |
| Marker | Clean opaque tags, including pressure/chisel behaviour where appropriate. |
| Paint roller | Broad strips for backgrounds and block lettering, with a distinct texture/edge. |
| Drip head | Paint builds up and runs down with gravity along the surface; dwell and flow matter. |
| Drizzle head | Loose trails/splashes that can extend beyond the painting box. |
| Eraser | Editable removal of authorised contributions; never free removal of protected art. |

Expose useful size, opacity/flow and softness controls without making the artist configure a simulation. Head changes should be visibly different. Use deterministic brush versions/seeds and replayable actions so remote clients reproduce spray scatter and drips. Do not require a server message for each simulated droplet.

**Drizzle ignores box limits**, but stays on the same reachable, unobstructed physical surface. It cannot cross doorways, jump to the background or paint protected neighbouring art for free. Spill remains attributed but does not automatically expand the protected claim. Show the spill margin in canvas mode. Protected overlap needs the same expensive paid override as any other tool.

## Wall painting and live canvas mode

After selecting an area, paint on the 3D wall or choose **Enter canvas mode**. Canvas mode hides the world and shows the same live artwork front-on in an otherwise clean workspace. Existing art stays visible; “blank screen” means removing world clutter, not clearing the wall.

Provide pan/zoom, portrait rotation, the compact tools and an obvious return button. Both views edit the same surface coordinates and layer stack. There is no duplicate painting, export or delayed Apply step. Other players see updates on the wall while the artist draws in canvas mode. Switching view/orientation preserves marks, selection, layers, protection and pending updates.

Give the piece a manageable layer stack: create/name, hide, reorder, opacity, lock and merge. Keep undo/redo for the artist's own editable work. A layer hidden in the editor must not ambiguously count as shared visible paint; shared composition changes are explicit operations. Undo cannot delete somebody else's later strokes or refund a reusable-art purchase through repeated placement. Layers cannot bypass claims, hard size limits or paid overrides.

## Handmade tags, throw-ups and a personal art library

Graffiti tools should support quick signatures, outline-and-fill throw-ups and developed pieces with backgrounds, shading and highlights. These are different creative uses of the same drawing tools, not generated images or locked templates.

Add a **Make throw-up / tag** workspace with a transparent background, layers, undo/redo and the same brush tools. Save the player's handmade design to their library, name it, preview it and optionally designate their personal logo/signature. No AI prompt or image-generation button.

Place saved designs into a piece with drag, resize and rotate handles. Preview the exact placement, clipping and price; confirm deliberately. Keep transparency and clean scaling. Limit source dimensions, data size, physical placement size and total covered area. Avoid saving a whole wall as an unlimited reusable “logo”.

| Action in the shared world | Credit rule |
| --- | --- |
| Draw/edit/save a design to your own library | Free baseline creation; no generation charge. |
| Reuse a throw-up/tag as a standalone mark or in another piece | Costs credits; show the quote before placement. |
| Place your own designated logo/signature inside a piece you authored | Free within the signature size/coverage limits. |
| Put that logo in someone else's piece | Normal reuse cost and required surface permission apply. |
| Expand the region or cover another artist's protected paint | Relevant expansion/override charges still apply. A free signature never grants these permissions. |

The server verifies asset ownership, piece authorship, designation and size/coverage limits. A client “this is my logo” flag is insufficient. Bound the total free signature coverage per piece so repeated free copies cannot fill a mural. Exact limits and reuse prices need tuning.

Preview any combined reuse/expansion/override price together. Use unique operation IDs so retries cannot charge twice or place duplicates. Keep the original editable design when placing it. Solo uses local library/drafts; any later account sync is explicit and must not import a fabricated online balance.

## Four-hour protection and deliberate paid tag-over

An accepted online area is protected from ordinary painting/erasing by other players for **four hours**, measured by the server. Recommended start is claim confirmation. Editing/reconnecting does not silently renew it. Show author and remaining time when inspecting the piece.

After expiry, art remains; it becomes eligible to be painted over. Expiry does not delete the original portfolio/history. Accept claims/expansions atomically so competing requests cannot both receive the same protected area.

Allow an **expensive, deliberate tag-over** during protection. This is rivalry by choice. Show the affected artwork, bounded area and substantial price before purchase. Charge significantly more than ordinary reuse or expansion; tune actual rates later.

The server validates funds and grants only the quoted region, with deduplicated charging. Recommended rule: that region becomes the new contribution with its own four-hour timer, while unaffected original regions retain their old timer. Preserve original versions and attribution. Explain the final rule before charging. Erasers, drizzles, imported art, layers or any retained bots cannot bypass it.

## Solo first; one clearly joinable persistent server

Boot into a local solo world immediately. Make **Join server** easy to find, with concise connection status, occupancy and available slots when known. Do not require multiplayer, sign-in or a working VM merely to paint alone.

The join action is an authoritative server admission request, not a client-side slot estimate. Reserve capacity atomically; handle simultaneous joins, reconnect grace and stale connections. If full, show “Server full” and leave solo available. Do not show fabricated occupancy or silently create a second empty world to hide a full server.

The shared world persists when everyone leaves. The service remains running; last-player departure must not reset art, claims, identities or credits. Leaving multiplayer returns to solo while preserving local work. Joining loads the shared world's state; it does not automatically publish every local wall texture.

Keep solo saves and shared state separate. Offer an explicit future publish/import flow for chosen handmade designs or draft pieces, with normal claim/size/credit checks. Solo rewards and browser-edited counters cannot become server credits. A disconnected online session may retain a local draft; it cannot finalise purchases or assume an expired claim still permits shared writes.

## Visible people, conversation and convincing characters

Use Aippy's existing account profile through useUserInfo from @aippy/runtime/user. Default the display name to nickName, then @username, then PLAYER; show avatar with a normal visual fallback. Respect isLoading and do not ask players to invent a name. No custom accounts, login flow, user/profile database, token fetching for display or invented profile-write APIs. The server-issued connection playerId is the multiplayer authority; Aippy profile fields are display information, not proof of identity to this server. Do not display uid.

Nearby online players appear as animated 3D humans with names, facing direction and idle/movement/painting state. Add compact presence and easy friend meetups. Bots are not a substitute for real multiplayer; remove confusing bot features from the default experience.

Provide nearby text chat, a compact chat button and clear speaker identification. Selecting a player can open conversation/actions. Support mute/block/report, bounded message sizes and server rate limits. Handle the mobile keyboard without hiding the composer or causing accidental paint. Optional voice can follow later.

Use coherent rigged GLB/glTF characters with several distinct appearances and a streetwear direction. Fix scale, feet/ground contact, materials, hand/can attachment and animation blending. Avoid twisted limbs, floating parts and sliding. Share textures/meshes where useful, but each animated instance needs its own skeleton.

Asset shortlist, not imported assets:

| Source | Direction and caveat |
| --- | --- |
| [Quaternius humanoid bundle on GitHub](https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender), [creator's base-character pack](https://quaternius.itch.io/universal-base-characters) | Preferred human proportions. Creator documents six CC0 rigged base models; inspect actual files/variants in the mirror and adapt outfits. Do not assume every creator-pack option is included. |
| [KayKit Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | Creator's CC0 rigged/animated low-poly alternative; fantasy outfits need adaptation. |
| [Quaternius animation library](https://quaternius.itch.io/universal-animation-library) | Candidate locomotion/emotes; verify chosen clips, licence and rig compatibility. |

Mirror only chosen licensed files into the project for reliable Aippy imports. Keep asset-specific source/licence records and mobile budgets. Never assume one code licence covers all models inside a repository.

## DigitalOcean backend and smooth multiplayer

Use the existing secure endpoint: wss://24.144.88.205/multiplayer. Health: https://24.144.88.205/health. The owner reports the service is separate from Studio, already deployed and persistent, with publicly trusted TLS. No infrastructure or database changes are part of this work.

The deployed protocol is version 2. Wait for hello with its server-generated playerId, then send join with protocol 2, roomId public and the default Aippy nickname/username. world_snapshot includes revisions, sequences, strokes, artwork, players, chat history and world items. Keep the room selection modular without adding private-room UI yet. The current integration retains the existing world/controller/paint renderer, adds public chat, shares existing cosmetics/emotes, and uploads posters as binary to the existing /artwork-upload endpoint. References are shared through artwork_place; base64 images never go through WebSocket.

Current scope includes connection/public join, player count, visible/interpolated players, shared paint/eraser metadata, persisted reconstruction, reconnect/resync, public chat, persistent posters and shared visual appearance/actions. Inventory/economy/trading authority remains disabled because the server runs AIPPY_AUTH_MODE=disabled. Do not bypass verified_account_required with username, uid, localStorage identity or a custom auth service. Do not invent capacity/free-slot numbers, account verification, claims or credit APIs. Solo remains the default and solo currency/saves are separate from shared data.

Configure the URL once through VITE_MULTIPLAYER_URL with a production fallback in src/multiplayer/config.ts. Do not scatter endpoint literals in game modules. Stay below 64 KB/messages, 128 points/batch, 20,000 points/stroke, 10,000 persisted strokes/room and approximately 120 messages/second. The thin client uses 96-point batches around 100 ms, splits long gestures at 16,000 points and sends changed player state around 100 ms. Saved stroke objects use id; normalise it to client strokeId. Send the game's brush slider units, since the server clamps brushSize to at least 1; divide by 50 only when reproducing the existing local world-radius renderer.

- Movement/look and paint render locally first, including with 500 ms round-trip latency. Do not smooth the local player's input through the server.
- Send movement snapshots; interpolate remote avatars with bounded extrapolation.
- Batch paint actions, not individual pixels. Roughly 50–150 ms paint batches and 50 ms position updates are starting points for measurement.
- Each paint action identifies stable artwork/claim/surface/face/layer IDs, brush/version/settings, surface-coordinate samples and a unique operation ID.
- The server checks permissions and limits, deduplicates, assigns accepted ordering and distributes it. Local provisional strokes sit over confirmed state; acknowledgements must not paint them twice.
- Subscribe to nearby chunks for art and players. Stream initial snapshots and subsequent operations without freezing the active brush.
- Persist ordered history plus periodic snapshots. Reconnects and late joins rebuild the same accepted composition.
- Keep queues bounded. If a claim expired or a pending action is rejected, preserve the local draft and explain the conflict; never silently overwrite protected shared work.

Reconnect explicitly and rejoin for a fresh snapshot without creating reconnect loops. Preserve offline paint locally and never silently upload it under a new connection identity. Keep solo PNG/poster saves separate from the shared stroke world. Local echo IDs and offscreen incremental replay must preserve current brush work without double deposition. The client cannot promise restart/backup behaviour beyond the existing backend's implementation; do not modify the VM to address this during game integration.

## Credits and discovery

Give each piece a stable ID, author, bounds, versions and engagement. Inspect without spraying: author, views, likes, comments, protection and optional history. Earn credits from meaningful views/likes, not holding spray, refreshing or self-liking.

Count eligible distinct engagement server-side, deduplicate rewards and use one active like per viewer/piece. Do not reward repeated unlike/re-like loops. Keep awards/spending in an idempotent ledger. Comments persist but are not a requested credit source.

A bounded basic painting area and ordinary handmade painting should be accessible to a newcomer. Tune starting allowance or introductory briefs so expansions/reuse are attainable. Recommend modest daily creative briefs later; repeated activity alone must not mint unlimited credits. Protect progression from trivial view-farming.

## Server movement validation fix

The protocol-2 wire check found that player_state drops state.position, whether sent as an array or an x/y/z object. The existing server must retain and broadcast the documented numeric [x,y,z] array (also in snapshot player state). Other player metadata is forwarded. On 6 October the owner confirmed the validation callback was corrected and is restarting the existing service. The client continues using the documented array. Do not fabricate movement coordinates or deploy a replacement backend.

## Inventory, collecting and trading

The owner explicitly wants collectible tags around the map, special paints, consumable items, unique collectibles to show off or trade, stackable quantities, dropping items and picking up other players’ drops. These are part of the destination. Ownership, purchases, currency, consumption, pickups/drops and atomic trades must be validated by the existing server against a genuinely verified Aippy account. Trade offers need ownership/quantity revalidation, locks, cancellation and timeout so items cannot be duplicated or spent twice. No fake local multiplayer economy.

The protocol is present, but these interactions are unavailable until verified Aippy identity is connected. Current client structures retain world item snapshots/events and gate inventory/trade sends; current solo closet and coins remain solo data. Club/faction membership and restricted clubhouses may follow later; do not build them in this integration.

## Research and what is worth reusing

Reviewed primary developer/creator sources on 5 October 2026. These are references and candidates, not proof that their implementation is already integrated or compatible with Aippy.

| Reference | Useful takeaway / reuse decision |
| --- | --- |
| [Graffitifun: tags, throw-ups and pieces](https://graffitifun.com/tagging-vs-throw-ups-vs-pieces-explained/) | Signature tags, quick outline/fill lettering and detailed pieces suggest marker/fine-cap, fill/outline and shading workflows. Give players expressive tools rather than generated imagery. |
| [Kingspray, developer-provided description](https://store.steampowered.com/app/471660/Kingspray_Graffiti_VR/) | Distinct caps, spray character, drips and different paint surfaces are a useful quality reference. It is a VR game; adapt relevant feel to touch/mouse, not VR controls. Reference only; no assumed reusable code/art. |
| [VandalVault developer's browser-game post](https://rameone.itch.io/vandalvault/devlog/1451640/vandalvault-is-live-spray-paint-the-internet) | Documents Three.js multiplayer wall painting, drips, galleries, profiles, challenges and live chat. A relevant browser-game reference, not independent proof of performance or a licence to copy source/assets. Do not import its police/can-limit loop by default. |
| [perfect-freehand](https://github.com/steveruizok/perfect-freehand) | MIT TypeScript library generating pressure-sensitive stroke outlines. Prototype for marker/handstyle smoothing; it is not a complete aerosol/drip engine. Can render to the existing Canvas/Three.js path without changing build framework. |
| [Klecks / Kleki source](https://github.com/bitbof/klecks) | MIT browser painting app with layers, pressure/stabilisation, touch gestures and editing transforms; standalone and embedded modes. Evaluate selected techniques/modules or a small prototype for canvas mode. Do not drop an entire second application into the game without checking live-wall integration, bundle cost and mobile memory. Keep required notices; branding is separate. |
| [Konva](https://github.com/konvajs/konva) | MIT canvas scene graph with interaction/transforms. Candidate for transparent tag placement, resize/rotate handles and library editing. Keep core spray and the live wall texture independent; use only if it simplifies the editor within budget. |

Prefer a small drawing core that owns surface-coordinate strokes/layers, shared by the 3D wall and 2D canvas view. Prototype the hard parts before adding dependencies. Vite is a build tool, not a paint engine; compatible TypeScript/Canvas tools are useful regardless of how their demos are built.

## Additional premium direction

After controls, paint quality and persistent multiplayer work, pursue:

- Artist portfolios, favourites, neighbourhood mural routes and a restrained discovery feed.
- Invite-only collaborative pieces with explicit co-painter permissions; free-signature ownership rules remain explicit.
- Before/after history and rivalries with attribution, rather than deleting the original artist's record.
- Saved palettes, colour picking, optional guides, non-generative stencils and useful brush previews.
- Recognisable districts, readable concrete/brick/metal, restrained lighting and convincing paint colour.
- Nozzle hiss, can shake, roller sound and optional haptics; subtle feedback that never masks the drawing.
- Wave/point/admire emotes, friend meetups and optional curated community events.
- Draft autosave, clear asset/WebGL errors, safe-area layouts and measured quality settings.

Do not add forced police chases, consumable-can scarcity, compulsory multiplayer or heavy effects ahead of the artist experience.

## Delivery order and evidence of completion

1. Rebuild the HUD and input ownership: direct Paint/Explore, top tools, left move/right look, jump and portrait. Verify simultaneous touch use, stop/cancel behaviour and menu hit testing.
2. Fix targeting and paint quality: box preview, reach/occlusion, normal clipping, drizzle exception, stroke sampling and detail. Compare repeatable lettering/fills at multiple distances on a phone.
3. Add the shared drawing core, live canvas mode, heads/roller, layers and handmade library. Verify switching modes/orientation preserves the same art; resized signatures stay clean.
4. Integrate the existing persistent service with deliberate solo-to-server joining, shared spray and the current character models. Check two real clients, late joins, disconnect/rejoin and no solo-save contamination. Upgrade models and chat later using supported protocol features; do not deploy a replacement service.
5. Connect server claims, four-hour expiry, engagement credits, reuse/signature rules, paid expansions and protected tag-over. Check competing claims, insufficient funds, retry deduplication and protected drizzle overlap.
6. Exercise late joins, reconnects, chunk changes, snapshots and 500 ms simulated latency. Local input must remain immediate; accepted shared paint must eventually converge without losing drafts.

Aim for 60 FPS local drawing on chosen supported phones and measure it. Do not promise every device or VM capacity without evidence. Update HOW_I_DID_IT.md as actual systems are delivered. This brief is the destination; gameplay changes and server deployment are subsequent implementation work.


## 6 October production pass and revised owner direction

Multiplayer display identity is intentionally client-trusted for now. Keep Aippy `username` and `nickName` separately, plus the resolved `displayName`, across join and player records. Keep the server-generated connection playerId. Do not fetch tokens or invent a login/profile service during this pass. Owner/admin authority is a separate existing-server patch; a matching unverified username must not grant privileges.

Daily cleanup is now part of the destination: a piece gets a 24-hour evaluation window and survives into another window only with at least 20 eligible distinct likes earned in that window. It must earn another 20 in every following window. Previous-window likes do not carry over. This expires artwork, not the VM, player inventory or the whole server. Schedule/count/removal must persist on the existing server. The server now groups strokes under stable piece IDs; poster association is not yet specified. Independent client deletion is not an implementation of this rule. See docs/server-client-handoff.md.

This client pass adds a directly accessible Paint/Explore switch, compact top colour control, independent right-look input, portrait viewport rotation with corresponding pointer mapping, coalesced painting samples, close-range/obstruction targeting, and a handmade transparent tag workspace with undo/redo and a bounded browser-local design library. The AI poster creation interface is replaced by manual drawing. Saved tags use the existing persistent binary upload/placement path when multiplayer is connected.

Performance work bounds remote image downloads, indexes artwork by loaded surfaces and budgets paint reconstruction across frames. These are targeted protections; they do not prove a phone frame-rate or unrestricted world capacity. The client now selects a bounded wall rectangle before painting and offers a front-on isolated view of the same live wall. This rectangle is explicitly unprotected: it is not a server claim. Handmade tag drawing has fine, marker, spray, roller and drip heads. World spray still uses its existing brush. Piece creation/completion, nearby piece inspection, likes/window display and server removal are integrated with protocol v2. Four-hour claims, paid expansions/overpainting, wall drizzle exceptions/layers, engagement credits, trading, collectibles and upgraded licensed character models remain unfinished. No AA/AAA production claim is made solely from a successful build.
