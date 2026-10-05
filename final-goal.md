# Final goal: a shared street-art world

Updated: 5 October 2026.

Repository: https://github.com/benryaus-cmd/graf-game

Live reference: https://aippy.ai/@PinkYyyy/street-art-canvas-aV7b

This is the working product direction for future changes. Build towards it incrementally in the existing game. A goal listed here is not a claim that it already works. Later instructions from the owner take precedence.

## Intended experience

A clean, mobile-first open world where people explore together, see and talk to each other, claim a piece of a real surface, paint it smoothly, and discover other people's graffiti. Artwork has an author, views, likes and comments. Genuine engagement earns the artist credits, which can buy a larger painting area or an expensive tag over another artist's protected work. Aim for the finish and feel of a premium graffiti game: deliberate controls, convincing characters, expressive paint and a coherent social world.

The central rule is: **my movement, looking and painting respond immediately on my device.** Slow internet may delay other players and their paint, but must not make my own controls or brush wait for the server.

Preserve the existing Three.js world, paint tools, layers, posters, avatars and saved work where compatible with this direction. Clean up and extend the current game rather than replacing its identity.

## Evidence and limits of this review

The initial cloud-browser attempt opened the live SIDESTREET welcome screen, but clicking ENTER THE WORLD produced a black game area. That browser reported WebGL disabled and Three.js failed to create its renderer. This was an environment limitation, not evidence that the game fails on the owner's device. A subsequent session in a different browser service successfully rendered the world; its findings are recorded below.

At the owner's request, the project snapshot verified against GitHub commit `3bc73839c0a5ccd081e17474462466c77113c20c` was also built locally. Dependency installation and `npm run build` succeeded (1,195 modules transformed). The preview server started successfully on `127.0.0.1:8080` after binding it explicitly to localhost. The original cloud browser rejected the preview address with `ERR_BLOCKED_BY_CLIENT`; this local route did not enable gameplay. The separate live-site session below provides partial interaction evidence, while full control feel remains unverified. No gameplay code was changed for this review.

### Follow-up live session in a different browser

At the owner's request, a separate browser service tested the exact live Aippy URL on 5 October 2026. Its completed session reported:

- ENTER THE WORLD successfully opened the 3D urban scene, with concrete walls, an archway, walkways/railings and the existing bunny character. WebGL worked in this browser.
- The Paint Station opened and closed. Selecting green (`#46D38B`) updated the colour display; activating SPRAY changed its active state, which remained active after closing the panel.
- The expanded paint panel obscured a substantial part of the world. The visible HUD includes brand/district/gesture text, weather/music, view/bots/avatar actions, left MOVE, right JUMP and the paint-station trigger.
- There was no surface-box selection step before activating spray.
- Several reported canvas clicks near concrete walls did not produce visible paint marks. No useful error or explanation appeared. This is an inconclusive input/targeting result, not a confirmed claim that painting is generally broken: the report does not establish valid ray hits, pointer drags or an authenticated paint path.
- The Aippy sign-in toast did not prevent world entry or paint-menu interaction. Do not assume it caused the unsuccessful paint clicks without evidence.

The service reported before/after screenshots, but did not return image attachments in its result. [Session report/recording](https://agent.tinyfish.ai/runs/3afe04a0-d9d0-4c37-9ff6-e6429ec844c2).

World rendering and paint-menu interaction now have live evidence. Successful paint deposition, simultaneous movement/look/spray, jumping, doorway spill and measured frame rate still need positive gameplay checks. In particular, the session's comparison of keyboard and joystick controls does not test the source-level drag-to-look versus spray conflict.

### Source inspection

The following findings come from GitHub source inspection:

- `GameHud.tsx` combines a brand header, music/weather controls, district text, gesture hint, view/bot/avatar actions, jump, a movement joystick and a paint dock. The owner reports the resulting UI is messy.
- There is a dedicated movement joystick, but looking is a canvas drag. `worldControls.ts` makes that same drag paint when spray mode is active, so looking and spraying compete for the same input.
- `worldPainting.ts` chooses the first hit from paintable wall meshes and allows hits up to 160 world units away. This is not unlimited distance, but it permits distant background painting and does not establish a selected, bounded painting area.
- Paint and progression are currently saved to browser localStorage. `App.tsx` awards coins for spraying, with an 800 ms throttle. Shared ownership and engagement-based credits need a different authority model.
- The world already uses chunks and per-wall paint layers. These are useful foundations for nearby multiplayer subscriptions and stable surface identifiers.

## Controls and cleaner HUD

Use a dedicated left movement thumb control and a dedicated right look thumb control, matching the owner's request for movement toggle left and look toggle right. Both must work independently and simultaneously. Spraying must not disable the right look control.

Move the paint selector to the top. Give it a compact colour swatch/tool strip, with expanded palette, brush tuning, layers and poster tools available on demand. Keep the normal play screen mostly world, not panels.

Reduce the size and prominence of brand and decorative text. Consolidate secondary actions such as weather, bots, avatar, settings and view selection into a compact, consistent menu. Use smaller readable text without shrinking the actual touch targets. Movement, looking and painting must remain accessible without repeatedly opening menus.

Separate Explore, Select area and Paint states visibly. UI touches must not spray the world underneath. Each control owns its pointer; releasing or cancelling it stops that input. Keep jump reachable without overlapping the two thumb controls. Preserve keyboard/mouse support.

Put a visible Portrait/Landscape button at the top right. It changes the playable/drawing orientation without reloading, resetting paint or disconnecting multiplayer. Support portrait graffiti naturally. Use native orientation changes where available and an in-app layout/view rotation fallback where the browser refuses a device lock. Rotate/reflow controls and transform pointer coordinates correctly; do not merely rotate the image while leaving hit testing wrong. Preserve the selected surface, camera state and draft when switching back.

## Two live painting views and expressive spray heads

After selecting an area, the artist can either paint straight on the 3D wall or press **Enter canvas mode**. Canvas mode hides the world and presents the same surface artwork against a clean, otherwise blank workspace. Show existing paint rather than clearing it. Provide pan/zoom, the compact paint controls and a clear return to the world. Every edit updates the underlying wall live; there is no separate copy, export step or delayed Apply button. Mode switches preserve strokes, layers, protection, orientation and multiplayer updates.

Canvas mode is a comfortable front-on editing view of the same surface coordinates. It can display a margin beyond the claim so drizzle spill remains visible and editable. Keep its aspect ratio faithful to the wall region; portrait mode must not stretch the artwork. Other players can watch the wall being painted while its artist is in canvas mode.

Offer genuinely different spray heads: a fine cap for lines, a fat cap for fills, a flat/chisel head, a drip head and a drizzle head. Make head shape, spread, softness, opacity and brush size meaningful. Drips run down the surface and drizzle creates loose trails/splashes. Use deterministic seeds and replayable paint actions so all clients reconstruct the same marks, including animated drips, without streaming pixels every frame.

**Drizzle explicitly ignores the painting box limits.** It may draw beyond the rectangle on the same reachable, unobstructed surface. This is an exception to ordinary brush clipping, not an exception to the doorway, distance or surface-target rules. Spill is attributed to its artist, but does not silently enlarge their protected claim. Where it would cross another artist's protected area, use the paid tag-over permission described below instead of a free protection bypass. Unprotected neighbouring surface remains usable. Show that boundary before a credit-spending action, and make drizzle visible in both wall and canvas views.

## Select a surface before painting

The flow is **choose spray -> tap a surface -> preview a box -> adjust/confirm -> paint inside it**. Tapping to select must not deposit paint.

The preview is a rectangle attached to the actual chosen surface, not a screen-space rectangle projected onto everything behind it. Store its stable chunk/surface/face identity and bounds in surface coordinates. It stays attached when the camera moves. Show whether it is available, protected or invalid before confirmation.

Use a bounded standard area and a hard maximum size. Fit the box to usable surface geometry; a large wall must not automatically become one unlimited canvas. Allow resizing/repositioning within valid space before confirming. Enlargement costs credits, with the extra cost and resulting dimensions shown before purchase. Exact standard size, maximum dimensions, reach and credit rates remain configurable tuning values; they are not approved numerical promises in this document.

Ordinary painting is clipped to the confirmed region and its chosen face; drizzle is the explicit exception described above. Stop a stroke when its target becomes invalid; do not jump to another wall or connect across empty space. Erasers, posters and bots obey the same surface/protection rules and cannot provide a free bypass.

Fix the doorway/background problem explicitly:

- Selection and painting must respect nearby reach and foreground occlusion, including non-paintable solid geometry.
- A doorway opening is not a continuous paintable wall. A box cannot bridge its hole and spray the building behind it.
- Once a surface is selected, raycast against that target and validate the hit rather than falling back to whatever background wall is intersected next.
- Invalid, distant, hidden or out-of-box hits produce no paint.

## Four-hour ownership protection

Confirmation requests a claim from the server. An accepted area belongs to its artist and is protected from ordinary painting or erasing by other people for **four hours**. A deliberate, expensive paid tag-over is the explicit exception. Use server time; recommended timer start is successful claim confirmation. Editing or reconnecting must not silently renew it.

Show the artist and remaining protection time when inspecting the graffiti. Reject ordinary overlapping claims against another person's protected region. Claim acceptance, expansion, paid overrides and their credit deductions are consistent server transactions; concurrent requests cannot both own the same area.

After expiry, the artwork remains visible, but the area becomes eligible to be painted over. Expiry is not automatic deletion. Preserve attribution/history so later contributions are not credited to the wrong artist. The owner can continue editing while their claim is valid, including after reconnecting.

### Expensive tag-over

Allow a player to deliberately tag over another artist's graffiti even during the four-hour window, by spending a substantial number of credits. This is an intentional rivalry mechanic, not a bug or a cheap griefing shortcut. It must be clearly more expensive than normal painting/area enlargement, with the affected artwork, area and exact price shown before confirmation. Rate and pricing formula remain economy-tuning decisions.

The server quotes and atomically charges for a bounded override region. Permission cannot extend to the whole wall, all nearby art or subsequent unrelated tags. Record the author, target, paid region and transaction; reject insufficient funds and deduplicate retries. Recommended rule: the paid region becomes the new artist's claimed contribution with its own four-hour timer, while unaffected portions of the original claim retain their original timer. Keep earlier artwork versions and attribution so a tag-over is visible rivalry rather than loss of the original creator's portfolio. Ordinary erasing must not imitate this mechanic for free. The UI must explain the final chosen rule before charging.

## Social discovery and credits

Give each graffiti piece a stable artwork ID tied to its author and region. Tapping an artwork opens a small inspection panel with author, view/like counts, comments and protection status. Inspecting must not accidentally select or spray it.

Earn credits from legitimate views and likes on your graffiti. Comments are supported; comment-based rewards are not part of the requested economy. Do not use endless spraying as the final credit source.

Count meaningful views rather than every frame, camera pass or refresh. Exclude self-rewards, deduplicate repeat events, and enforce one active like per viewer per artwork. Store credit awards and spending in a server ledger with idempotent operations. Clients cannot manufacture balances or reward events. Define reward rates and any starting allowance during economy tuning so a new artist can make their first piece without an impossible credit barrier.

Comments, authorship and engagement persist across sessions. Include basic reporting/moderation for shared artwork and comments. Server-side identity must survive reconnects; never trust a player ID supplied without validation.

## Visible players, conversation and character quality

People in the same nearby world must see one another as actual animated 3D characters, with a name, facing direction and recognisable painting/idle/movement state. Show nearby player presence without an always-expanded scoreboard. Distinguish human players from bots. Joining or inviting a friend into the same world should be straightforward; do not place friends into separate invisible sessions.

Provide nearby text chat and a compact chat button. Players can select a nearby person to start a conversation; speech bubbles and a small scrollable conversation panel can make who is talking clear. The mobile keyboard must not cover the composer, and typing must stop gameplay key handling and accidental spraying. Include mute/block/report and modest server rate limits. Voice chat is an optional later enhancement, not a required dependency for being able to talk.

Replace the visibly crude/broken character construction with properly rigged 3D models taken from an existing GitHub asset repository. Provide a few genuinely different appearances, proportions and outfits rather than merely recolouring one broken mesh. Use a consistent street-art aesthetic, natural proportions, correct materials, sensible scale and stable feet/ground contact. Blend idle, walk/run, jump, spray and social gestures without twisted limbs or sliding. Attach the spray can to the correct hand; remote animation follows replicated action state.

Use GLB/glTF assets with documented source and asset-specific reuse terms. Mirror only the chosen models, textures and animations into this game for the existing importer; no runtime dependency on GitHub. Share resources, use independent skeletons for player instances, and budget detail for mobile.

Researched candidates, not assets already installed:

| Candidate | What is verified | Use/limitation |
| --- | --- | --- |
| [Quaternius character/animation bundle on GitHub](https://github.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender) | Repository includes Universal Base Characters and animation-library folders, and documents a GLB merge workflow. The [creator's pack](https://quaternius.itch.io/universal-base-characters) describes six rigged base models under CC0. | Preferred direction for human proportions and multiple streetwear looks. Inspect the actual included variants and adapt outfits before choosing; not every creator-pack variant is assumed present in this mirror. |
| [KayKit Adventurers](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | Creator repository documents four rigged/animated low-poly characters, glTF files and CC0 licensing. | Coherent alternative if a stylised look is chosen; fantasy clothing needs street-art adaptation. |

The [Quaternius animation source](https://quaternius.itch.io/universal-animation-library) documents humanoid locomotion/emotes and CC0 licensing. Confirm model/clip compatibility and keep source/licence records when importing. Do not assume a repository's code licence covers every model inside it.

## Multiplayer hosted on the owner's DigitalOcean VM

Keep the Aippy browser game as the client. Add a lightweight game service on the owner's existing DigitalOcean Ubuntu VM, alongside the studio services. Start with WebSockets for realtime traffic and persistent storage for claims, strokes, artwork, engagement and credits. Reuse existing Postgres/Redis only with separate game data, credentials and resource limits. Preserve the studio's operation.

Expose the game backend through HTTPS/WSS with configured Aippy origins. Keep server credentials off the client. No server capacity, player count, hosting cost or deployment completion is assumed until measured. Record actual deployment commands and configuration when that work happens.

### Local response and shared agreement

- Simulate the local player's movement/look and render their paint immediately. Never wait for a position or stroke acknowledgement to display the local action.
- Send movement snapshots periodically; interpolate remote avatars with bounded extrapolation. Network smoothing must not be applied to the local input path.
- Batch paint actions rather than transmitting every pixel or brush sample separately. Initial tuning can target roughly 50-150 ms paint batches and about 50 ms movement updates; these are adjustable starting points, not fixed requirements.
- A stroke identifies the artwork/claim, surface/face, layer, brush settings, surface-coordinate points and unique client operation ID. Use stable IDs, not transient Three.js object references or mutable array positions.
- The server validates ownership, geometry limits and operation size, deduplicates retries, establishes an ordered stroke sequence and distributes accepted work.
- Render unacknowledged local strokes over confirmed state. Reconcile acknowledgements without drawing a stroke twice or repeatedly replacing the full texture. Snapshot loading and encoding must not block the brush.
- Nearby chunk subscriptions deliver nearby players, claim status and paint. Do not broadcast or download the entire open world's state for every player.

Use the same stable player identity for character presence, text chat, artwork authorship and credits. Chat and other players' animation can arrive late without stalling local paint. Keep network queues and message sizes bounded so a busy conversation or a complex mural cannot freeze input.

Protection and responsive painting must coexist: display a pending box immediately, and allow local preview strokes while a claim is awaiting confirmation. Pending work is provisional and cannot overwrite confirmed shared artwork. If the server refuses the claim, retain the draft locally, explain why, and offer another valid area. Once a claim is accepted, every brush gesture remains immediate while strokes synchronise in the background.

On connection loss, show a small honest connection state and retain a bounded queue/draft. Replay valid work with operation IDs after reconnecting; expired or rejected claims require reconciliation, not silent overwriting. Pending credit purchases cannot be treated as successful offline. The server remains authoritative for final claims, expiry, credits and shared ordering, without running the client's brush frame by frame.

Persist stroke history and periodic paint snapshots so a late joiner or restarted server reconstructs the same accepted artwork. Keep current local saves safe during migration and make any upload/migration explicit rather than blindly replacing the shared world with a device's old local textures.

## Further premium-game recommendations

These are assistant recommendations to pursue after the requested foundation; they are not claims of completed features or fixed scope ahead of the owner's priorities.

- **A serious artist workspace:** undo/redo for your own contributions, zoom/pan, brush previews, stencils, reusable saved palettes, and optional line smoothing. Undo must not erase someone else's later work. Keep advanced tools tucked away.
- **A reason to explore:** discoverable mural hotspots, an artist portfolio/gallery, saved favourites, neighbourhood reputation and optional daily painting briefs with modest server-awarded credits. Use starter credits or introductory briefs as a tuned on-ramp; do not rely on refresh farming or endless spray rewards.
- **Social expression:** wave/point/admire emotes, easy friend meetups and opt-in collaborative murals where the owner can invite another artist to paint the same protected area.
- **A believable street:** varied paintable brick/concrete/metal surfaces, restrained lighting, readable landmarks, and environmental sound. Preserve artwork colour readability; avoid heavy effects over the brush or excessive mobile GPU cost.
- **Paint with character:** subtle nozzle hiss, can shake, pressure/coverage feedback, gentle haptics and believable drip accumulation. Sound and vibration settings must work independently.
- **Rivalry with memory:** inspect before/after versions and who tagged whom. Reward interesting creation and real engagement; paid tag-over should be costly drama, not the only viable progression loop.
- **A finished product:** graceful asset-loading/WebGL error screens, autosaved drafts, restrained connection feedback, safe-area layouts, accessible contrast, and performance settings. Aim for 60 FPS local input/rendering on supported target phones and measure it rather than promising it on every device.

## Delivery order and completion checks

1. Clean the HUD; add independent left move/right look and the top-right portrait toggle. Check simultaneous input, jump, menu touches and rotated pointer alignment on a phone.
2. Add surface-box selection, live canvas mode, spray heads and reach/occlusion. Check doorways, distant walls, ordinary clipping and deliberate drizzle spill; switch wall/canvas/orientation without losing paint.
3. Integrate coherent rigged character models, then deploy the VM service and connect two real clients with visible presence, chat, server claims and ordered paint. Check the four-hour boundary and concurrent overlapping claims.
4. Add persistent artwork inspection, views, likes, comments and the credit ledger; connect paid expansion and costly protected tag-over. Check insufficient funds, duplicate requests, original-version attribution and drizzle hitting a protected neighbour.
5. Exercise reconnects, late joins, chunk changes and server restart. Under simulated 500 ms round-trip latency, confirm local movement/look/brush does not wait for the network, while clients eventually converge. Check that chat, drip simulation and canvas switching do not stall painting.

Use actual game interaction and measured results for completion claims. Source inspection alone does not establish good control feel. Work in the main game, preserve the existing GitHub-to-Aippy import workflow, and update `HOW_I_DID_IT.md` as real systems are built. This document defines the destination; implementation and deployment are separate tasks.
