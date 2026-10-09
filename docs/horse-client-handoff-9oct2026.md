# HORSE client handover — 9 October 2026

The client implements HORSE on the current shared basketball socket. No world admission, endpoint, court version, physics, releaseOffset, artwork, dependency or economy changes are required by this update. Backend deployment and real two-client verification have not been performed here.

## Enable only after server support is ready

In the existing protocol-2 `hello.capabilities` array advertise optional `basketball_horse_v1` alongside `basketball_court_v1` after deploying invitation, acceptance, turn and departure handling. This is a server-to-client feature gate, not a new required client-admission capability; do not add it to `requiredClientCapabilities`. Without it the HORSE UI and commands stay disabled. Ordinary multiplayer and solo/shared free shooting keep their existing gates and behavior.

Use the existing authenticated town connection: room `morning-quarter-v1`, world `map2-v1`, canonical map `map2`, court `map2-basketball`, court version `1`. Keep the existing endpoint. Derive the actor from the authenticated socket, never from an invitation payload.

## Exact implemented client messages

These are the two existing v1 commands newly exposed by the client; no new request fields are introduced. `revision` is the latest authoritative **CourtState** revision, not HorseState.revision. Example values must be replaced with current IDs/revision and a genuinely unused mark.

```json
{
  "type": "horse_invite", "version": 1,
  "roomId": "morning-quarter-v1", "mapId": "map2", "courtId": "map2-basketball",
  "revision": 7, "inviteeId": "other-authenticated-player-id", "spotId": 4
}
```

```json
{
  "type": "horse_accept", "version": 1,
  "roomId": "morning-quarter-v1", "mapId": "map2", "courtId": "map2-basketball",
  "revision": 8
}
```

`CourtSession.handleRequest()` and `readCourtRequest()` in `src/game/basketballSession.ts` already define these commands and the existing HorseSession/HorseState rules. There is no separate basketballHorse.ts file. Reuse the current basketballCourt.ts, basketballPhysics.ts, basketballRelease.ts and basketballSession.ts together.

On success broadcast the existing `court_state` envelope with the full authoritative CourtState, including `horse` and `horseReadyAt`. On rejection return the existing `court_rejected` envelope with full current state, `requestType: "horse_invite"` or `"horse_accept"`, and an existing reducer reason such as stale, invitation, mark or busy. The client adopts valid current state and retries a stale request at most five times only if that state still permits it. A six-second unconfirmed request expires locally and requests court_state; no invitation or turn is predicted.

## Shots, authority and presentation

`court_shot`, `court_result`, releaseOffset and their envelopes are unchanged; do not add a client spotId, score, letters, winner or phase to shot requests. During set/match, participants may shoot only when horse.occupantId equals their authenticated ID, from horse.spotId, after seat.readyAt and horseReadyAt. Reconstruct releaseOffset and launchFromFlick in that reserved mark's frame. Other seated players keep shooting from their own assigned marks; an invited-but-not-accepted player also keeps free shooting. One spare mark is reserved only for an active match.

The client moves the active occupant to the reserved mark and returns them to their normal seat for the other player's turn, at match end or when HORSE is absent. Repositioning preserves accepted balls and shared counters. Authoritative echoes/results validate the launch's actual mark. Optional liveShots snapshots may include a participant's normal-seat ball accepted before the match started; validate its release origin at that launch mark.

All letters, setter/matcher roles, occupants, phases and winners are displayed exclusively from accepted server state/results. Predicted flight never grants scores, letters, turns, wins, coins or rewards. Keep existing timed result broadcasts and authority-only counters. If the backend uses the synchronous pure reducer, its snapshot already contains the computed next HORSE state: broadcast/commit that state at the intended presentation time if letters/turn feedback must wait for physical impact. The client does not invent a delayed or predicted HorseState. Enforce horseReadyAt on the server regardless of presentation timing.

Serialize court mutations, handle disconnect/court_leave using the current departure rules, and send current state to all seated clients. Keep room/world admission and artwork protocols untouched. Test invite/accept, stale and occupied-mark rejection, two-player SET/MATCH/letters/winner, participant waiting, bystander free shooting, disconnect/forfeit and late active-ball replay with real clients before enabling the capability.

## Proposed decline/cancel requests — review required, not implemented

The v1 decoder, transport and UI intentionally do **not** send or accept horse_decline or horse_cancel. The following are proposals for server agreement, not additions to the deployed contract:

```ts
type ProposedHorseExit = {
  type: 'horse_decline' | 'horse_cancel';
  version: 1;
  roomId: string; mapId: string; courtId: string;
  revision: number;       // current CourtState revision
  horseRevision: number; // current HorseState revision, safe nonnegative integer
};
```

Proposed semantics:

| Request | Authorized actor / phase | Proposed authoritative effect |
| --- | --- | --- |
| horse_decline | Named invitee; invited only | Clear pending invitation to horse:null, advance court revision, preserve seats/counters |
| horse_cancel | Inviter; invited only | Clear pending invitation to horse:null, advance court revision, preserve seats/counters |
| horse_cancel | Either participant; set/match only | Forfeit using existing departure rules: phase ended, other player wins, endReason departure; preserve seats and release reserved mark |

Validate scope, authentication, both revisions and phase before mutation. Return existing court_rejected with the request type and current state on failure; broadcast court_state on success. Never use an optimistic client cancellation or reward. The two revision guards prevent an old cancellation from targeting a newer invitation. No new HorseState endReason is proposed. Confirm these schemas and forfeit semantics, or send preferred alternatives, before frontend commands/buttons are added.

## Frontend delivery and verification

The incremental manifest is `updates/horse-client-9oct2026.json`, replacing six frontend source files. Existing saves/settings remain intact. The client defaults to HORSE disabled until the optional server capability is advertised. Automated reducer/transport/UI tests and mocked-socket Chromium touch checks validate the client; they do not establish live backend support.
