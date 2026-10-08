# Basketball Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add lightweight basketball practice at the existing Map 2 hoop, with five shooting marks and reusable shot/session interfaces for shared free shooting and HORSE.

**Architecture:** A shared court definition feeds geometry and gameplay. Pure shot simulation and session rules are separate from pooled Three.js presentation and React input. Shared play uses the existing server with explicit court messages; Map 2 remains local until its isolated room and court capabilities are confirmed.

**Tech Stack:** Existing TypeScript, React, Three.js, Node 22, Vite and protocol-v2 connection. No new dependencies.

**Spec:** `final-goal.md`, section “Social minigames: basketball first”, approved by the owner on 8 October 2026.

## Global Constraints

- Unlimited free balls; thrown balls fade and disappear three seconds after launch.
- Five shooting marks, stable IDs, no overlap with buildings or props.
- Preserve paint surface IDs, saved artwork and the paintable backboard.
- No added physics dependency, shadows, bloom or real lights.
- Local input and ball launch never wait for the network.
- Shared seats and HORSE turns require the existing server, never another service.
- Exact-file incremental delivery; preserve importer, aliases, host wrapper and dependencies.

## Review Focus

- Rotated portrait gestures must have the same aim/power as landscape gestures.
- Slow frames and background pauses must not prolong a ball beyond three seconds.
- Cancelled pointers and menus must not launch balls or leave movement/paint stuck.
- Simultaneous joins and disconnects must not assign one mark to two players.
- A duplicated shot or an upward rim crossing must never award a second basket.

---

### Task 1: Court definition and deterministic shots

**Files:** Create `src/game/basketballCourt.ts`, `src/game/basketballPhysics.ts`, `tests/basketball.test.ts`; modify `src/game/morningQuarterContent.ts`.

**Interfaces:** Court `id`, `mapId`, rim centre/radius, backboard bounds and five `{id, position}` shooting marks. `launchFromFlick(spotId, gesture): ShotLaunch | null`; `stepBall(ball, seconds): ShotResult | null`. Shot IDs and launch version accompany result events.

- [x] Write failing tests for downward rim clearance, misses, upward crossings, one score per shot, three-second expiry, large time steps and cancelled/invalid flicks. Check all marks against the actual court and existing collision footprints. A portrait-normalized flick must produce the same launch as its landscape equivalent.
- [x] Run tests and confirm these behaviours are absent before implementation.
- [x] Extract the existing rim centre `[-53, 3.05, -40.08]` and radius `.28` into the court definition without changing wall order. Place five marks on a playable arc facing the hoop. Implement gravity and bounded fixed substeps for scoring/court/backboard/rim contacts. Lifetime uses elapsed wall-clock time, not the animation loop's clamped movement delta. Strength and lateral aim come from normalized flick length, direction and duration; no random make/miss.
- [x] Run the new tests and full `npm test`; inspect shot trajectories from all five marks.
- [x] Commit the tested court and shot simulation.

### Task 2: Pooled presentation and basket feedback

**Files:** Create `src/game/basketballGame.ts`; extend `tests/basketball.test.ts`.

**Interfaces:** `BasketballGame(world, onView)` owns enter/leave, current spot, held ball, `shoot(gesture)`, `receiveShot(launch)`, `update(now)` and `dispose()`. `BasketballView` reports nearby/active, spot, attempts, makes, streak and recent result. Hooks expose `onShot(launch)` and `onResult(result)` without assuming a network transport.

- [x] Write failing tests for fade/expiry, disposal, echo deduplication and repeated enter/leave. Repeating hundreds of shots must not grow scene resources after pool capacity is reached.
- [x] Confirm failures, then add reusable low-poly balls and restrained basket effects. Use shared geometry/materials, no shadows/lights. Provide a brief rim/net response and BUCKET/streak feedback. Use existing sound-volume/mute controls for a synthesized swish; do not fetch audio assets.
- [x] Run tests and TypeScript; inspect a made shot, backboard bounce and miss in the browser.
- [x] Commit presentation and lifecycle changes.

### Task 3: Nearby button, flick input and safe control ownership

**Files:** Create `src/components/BasketballControls.tsx`; modify `src/components/WorldScene.tsx`, `src/game/worldControls.ts`, `src/game/worldTypes.ts` and existing game styles. Extend `tests/basketball.test.ts` and browser QA.

**Interfaces:** Add an optional basketball frame hook and input-lock state to WorldEngine. WorldScene owns the game instance and mounts its controls. The React shooting pad calls `shoot` only after a completed, valid, upward pointer gesture through the existing portrait coordinate helpers.

- [x] Write failing checks for no shooting on cancel/lost capture/blur, no movement or paint while shooting, and restored normal controls on Leave. Test that entering does not clear a paint draft.
- [x] Confirm failures. Show PLAY BASKETBALL only near the court while exploring. On entry, place the player at a free mark, face the hoop and display the compact shooting pad, score and Leave. Block competing keyboard/joystick/jump/spray input through one activity lock. Menus and focus loss cancel the gesture. Restore prior camera/control state on exit and dispose on map changes.
- [x] Browser-test actual drag/release, cancellation, entry/exit, menus, portrait rotation and map changes. Run `npm test`, TypeScript and ESLint.
- [x] Commit the playable solo basketball flow.

### Task 4: Court sessions and HORSE rules

**Files:** Create `src/game/basketballSession.ts`, `tests/basketball-session.test.ts`, `docs/basketball-server-handoff.md`.

**Interfaces:** `CourtSession` allocates/releases five spots by player ID and deduplicates shot IDs. A two-player `HorseSession` handles invite/accept, setter/matcher turns, required mark, letters and departures. Define versioned join/leave/state/shot/result/invite/accept messages with map/court IDs, server time and revision.

- [x] Write failing tests: concurrent joins allocate five distinct marks; sixth gets full; disconnect frees one; stale revisions/duplicate shots are ignored; a failed match adds one letter; a missed setting shot passes the turn; HORSE ends at five letters or departure.
- [x] Confirm failures. Implement pure session rules and document the exact request/response fields and finite bounds needed by the existing server. Scores derive from the same simulation, not a client-supplied success flag. Free shooters retain their marks; a HORSE challenge uses a reserved mark that changes occupants with turns.
- [x] Run tests and commit the tested rules and server handoff. These pure rules are groundwork, not evidence of deployed shared play.

### Task 5: Existing-server integration, playtest and delivery

**Files:** Modify `src/multiplayer/protocol.ts`, `src/multiplayer/worldSession.ts`, `src/components/WorldScene.tsx`, `src/App.tsx` and multiplayer controls only after the existing server contract is available. Update `final-goal.md`, release documentation and `updates/basketball-9oct2026.json` with the actual delivered scope.

- [x] Inspect the existing server's source and room persistence before patching it. Confirm support for a Map 2 room isolated from `public`. Add court messages/session rules to that service; no replacement backend. If server access is unavailable, deliver solo practice and the tested session/transport groundwork, explicitly marking shared seats and HORSE as pending instead of enabling a broken join button.
- [ ] PENDING EXISTING SERVER: Test capability negotiation and map/room isolation before enabling shared controls. Connect two real clients; verify simultaneous seats, shared trajectories, deduplication, late arrivals within ball lifetime, leave and reconnect. Test five occupied seats and the full-court response.
- [x] Play and tune flick strength/aim, HUD placement, bounces and basket feedback. Compare idle/active court performance logs; ensure normal painting still works and art remains isolated.
- [x] Run full tests, TypeScript, ESLint, standalone and imported-host builds; obtain a whole-change code review and resolve material findings.
- [x] Publish verified exact runtime files and rollback through GitHub, then provide the short Node 22 Aippy update prompt with the actual manifest file count. Do not claim mobile FPS or shared play without the corresponding evidence.

## Delivery scope resolution

Tasks 1–4 implemented and task reviewed. Actual server source/access was unavailable; Task 5 used its approved solo-delivery fallback. Shared transport, real two-client seat/late-arrival/HORSE checks remain pending the documented server adapter. Browser solo QA and build/test evidence are recorded in docs/basketball-9oct2026.md.
