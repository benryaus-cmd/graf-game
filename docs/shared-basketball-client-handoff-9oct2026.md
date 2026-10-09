# Shared basketball frontend handoff — 9 October 2026

The town remains `roomId: morning-quarter-v1`, `worldId: map2-v1`, canonical map `map2`, court `map2-basketball`. Use the existing `wss://24.144.88.205/multiplayer` service and socket. No new endpoint, account system, dependencies or artwork migration is needed. The received [server report](server-report-town-basketball-9oct2026.md) describes prepared town work; it does not establish deployment of shared basketball.

## What is implemented

`src/multiplayer/basketballSync.ts` uses the admitted `WorldSession` connection. The client advertises optional `basketball_court_v1`; shared controls appear only after the server advertises it and admits the correct town world. Without it, connected players can still use SOLO PRACTICE. World protocol remains 2 and client network revision remains 6.

The server assigns one of five marks and an allocation epoch. Grabbing and releasing the visible ball predicts its flight immediately. Shared scores and feedback wait for a valid authoritative result; predictions cannot grant coins. Echoes reconcile the same canonical ball. Rejections remove it without scoring. Seats are released on leaving or disconnect; stale leave responses retry with pacing, without disconnecting painting. HORSE invitations and controls remain disabled.

## Required shot contract

Adopt current `basketballCourt.ts`, `basketballPhysics.ts`, `basketballRelease.ts`, `basketballHorse.ts` and `basketballSession.ts` together. Keep court version 1 because this extension has never been deployed. The exact full request/response contract is in [basketball-server-handoff.md](basketball-server-handoff.md).

Example shot (IDs/revision come from the assigned seat and latest authority):

```json
{
  "type": "court_shot", "version": 1,
  "roomId": "morning-quarter-v1", "mapId": "map2", "courtId": "map2-basketball",
  "revision": 7, "seatEpoch": 2, "sequence": 1, "shotId": "s2-1",
  "gesture": { "dx": 0, "dy": 0.9, "durationMs": 120 },
  "releaseOffset": { "right": 0, "up": 1.3, "forward": 0.6 }
}
```

`releaseOffset` is the actual held-ball origin relative to the authoritative mark. The helper defines the rim-facing forward/right basis and reconstruction. Validate finite right −1.75..1.75, up 0.40..2.80, forward 0.05..1.75, horizontal radius ≤2.10 and reconstructed x/z inside court bounds expanded by 2 m. Raw request bounds are strict; inverse projection of authoritative world origins allows only a tiny floating-point tolerance. Reject missing/invalid offsets before mutating sequence, counters or revision. Accept normal zero-motion releases as drops. Do not trust client velocity, result or score.

Broadcast the accepted launch immediately. Schedule `court_result` no earlier than the pure simulation's `resultServerTime`; snapshots can already contain computed counters, so the frontend defers its pending shot's visible score until that result. Preserve canonical `s${seatEpoch}-${sequence}`, server-owned times, per-seat three-second cooldown, bounded simulation and deduplication. Serialize calls per court. Derive player identity from authentication.

## Optional late-arrival extension to confirm

The report did not prescribe the exact active-shot snapshot schema. This frontend supports an optional `court_state.state.liveShots` array, at most five entries:

```ts
{ playerId: string, seatEpoch: number, sequence: number,
  launch: ShotLaunch, serverTime: number }[]
```

Here `serverTime` is launch time, and `launch` has the same validated shape as `court_shot.launch`. Missing means no replay. Entries must match current seats and canonical IDs. Clients simulate only the remaining portion of the three-second lifetime. This list is transient adapter state, never persisted with artwork. Adopt this exact extension or return your preferred schema before advertising support; this is not a claim that the backend already sends it.

## Remaining server work

1. Install/confirm the existing town patch and world admission from the received report.
2. Integrate the updated pure court contract into the same authenticated room service; implement join, leave, state, shot, rejection and timed result broadcasts. Clear seats on disconnect/room change.
3. Confirm or revise `liveShots`, and advertise `basketball_court_v1` only for clients/services that support the complete contract.
4. Run actual two-client make/drop/rejection/echo/late-arrival equivalence and five-client seat allocation/full/disconnect checks. Mocked frontend tests are not proof of backend deployment.
5. Leave HORSE disabled until the adapter, invitation/turn/departure flows and real two-client checks are complete. If your preferred backend scheduling/schema differs, provide updated schemas before enabling it.

No server deployment was performed by this frontend update. Existing account permissions, credits, town painting IDs and separate original-map art remain unchanged.
