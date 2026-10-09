# Basketball court server handoff

The frontend now implements capability-gated shared free shooting and the tested pure court rules. Shared backend deployment and real two-client verification remain pending; HORSE controls remain disabled. The town previously labelled Map 2 is now the main world and only multiplayer choice; its existing-server room/world integration is described in [main-world-server-handoff-9oct2026.md](main-world-server-handoff-9oct2026.md). The existing player-state decoder strips unknown fields, so adding basketball fields to player cosmetics, emotes or chat cannot provide shared seats or HORSE. See [shared-basketball-client-handoff-9oct2026.md](shared-basketball-client-handoff-9oct2026.md) for the current frontend adapter and remaining server work.

## Capability and room ownership

The existing service must explicitly advertise `basketball_court_v1` with court protocol `version: 1` before a client offers shared play. Do not infer support from the existing world protocol version. The service must first admit the isolated main-town room `morning-quarter-v1` and confirm `worldId: "map2-v1"`; this is not an assertion that the current server accepts it. Never fall back to `public` when it rejects the town. Preserve canonical map ID `map2`, existing artwork addresses and court ID `map2-basketball` despite the new main-world label.

One `CourtSession` belongs to `(roomId, mapId, courtId)`, with canonical `mapId: "map2"` and `courtId: "map2-basketball"`. IDs and positions for the five marks, `0..4`, come from `BASKETBALL_COURT`. A server adapter uses the same `basketballCourt.ts`, `basketballPhysics.ts`, `basketballRelease.ts` and `basketballSession.ts` versions as the client. Authenticate the connection using the existing service and derive the player ID from it. The `handleRequest(playerId, decodedValue, serverTime)` entry point never trusts a payload player ID and rejects another room/map/court.

## Client commands

Every request contains exactly this common envelope (unknown input properties are stripped by `readCourtRequest`):

| Field | Type | Meaning |
| --- | --- | --- |
| `type` | string below | Command discriminator |
| `version` | literal `1` | Court protocol version |
| `roomId` | bounded ID | Confirmed isolated room |
| `mapId` | bounded ID | `map2` |
| `courtId` | bounded ID | `map2-basketball` |
| `revision` | nonnegative safe integer | Last authoritative court revision |

| Command | Additional fields | Server action |
| --- | --- | --- |
| `court_join` | none | Allocate one free mark; return state or `full` |
| `court_leave` | none | Release seat and end a challenge involving this player |
| `court_state` | none | Return current state even when the supplied revision is stale |
| `court_shot` | `shotId`, `sequence`, `seatEpoch`, `gesture: {dx,dy,durationMs}`, `releaseOffset: {right,up,forward}` | Validate seat/turn and bounded release, then simulate the shot on the server |
| `horse_invite` | `inviteeId`, `spotId` | Invite another seated player to a spare mark |
| `horse_accept` | none | Only the named invitee can accept; reserve the challenge mark |

`shotId` is canonical `s${seatEpoch}-${sequence}`, for example `s12-7`. `seatEpoch` is a positive server-issued allocation epoch from state. `sequence` is a positive safe integer greater than that seat's last accepted sequence. A client retains the same ID and sequence when retrying a shot. A reconnect obtains a new epoch and starts a new sequence. This binding plus the sequence watermark rejects old IDs even after the bounded recent-ID cache evicts them. No `made`, score, ball position or client result is accepted.

`gesture.dx` is lateral distance and `gesture.dy` is upward distance from recent release motion, normalized by `.65` of the short logical viewport edge after portrait conversion; `durationMs` is that recent sampling interval. It is not the held finger's static position, total preparation distance or held duration. The checked-in decoder and `launchFromFlick` are the exact finite-value/interval validation sources; adopt the current versions rather than the old upward-only minimum-motion gate. Every normal release after grabbing the local ball now throws, including a zero-motion drop; pointer cancellation, blur and menu entry do not send a shot. A rejected shared shot must not change the player's attempts, sequence or revision.

**Release-origin agreement adopted from the server report.** Version 1 now requires `releaseOffset` in metres relative to the assigned mark. `basketballRelease.ts` encodes the actual moved ball and reconstructs the same position on the server. Finite bounds are right −1.75..1.75, up 0.40..2.80, forward 0.05..1.75, horizontal radius at most 2.10, and reconstructed x/z within the court bounds expanded by 2 m. Invalid or missing offsets are rejected without changing counters or sequence. Never accept arbitrary world-space velocity or a client score flag. Keep the undeployed protocol at version 1; the existing server must adopt the updated pure contract before advertising shared support.

## Server messages and state

All responses use common envelope `{version:1, roomId, mapId, courtId, revision, serverTime}`. `serverTime` is server-owned epoch milliseconds; the client sends no clock. Response types exported by `CourtResponse` are:

| Type | Additional fields |
| --- | --- |
| `court_state` | `state: CourtState` |
| `court_rejected` | `requestType`, `reason`, `state: CourtState` |
| `court_shot` | `playerId`, `seatEpoch`, `sequence`, `launch: ShotLaunch` |
| `court_result` | `playerId`, `seatEpoch`, `sequence`, `result: ShotResult`, `state: CourtState` |

The `court_shot.serverTime` is launch time. A `ShotLaunch` contains `{courtId,shotId,spotId,version:1,origin:[x,y,z],velocity:[x,y,z]}`. The `court_result.serverTime` is the `resultServerTime` returned by `shoot`; a result contains `{courtId,shotId,spotId,version:1,outcome:"make"|"miss",swish:boolean}`. Derive all of these from the pure simulation. `SessionReply` is an in-process return value, not itself a wire message.

`CourtState` contains the common scope, `version`, `revision`, `serverTime`, `seats`, `horse` and `horseReadyAt`. Each of at most five seats contains `{playerId,spotId,epoch,sequence,attempts,makes,readyAt}`. `readyAt` is the earliest next shared shot; one accepted shot occupies a seat for three seconds. Counters are per allocation and do not introduce persistence or an economy.

`HorseState` contains scope, its own rules `revision` and `serverTime`, `phase` (`invited`, `set`, `match`, `ended`), `inviterId`, `inviteeId`, `setterId`, `matcherId`, `spotId`, `occupantId`, `letters` (only the two player IDs), `winnerId` and `endReason` (`letters`, `departure` or null). Wire requests always compare the outer court revision; nested HORSE revisions are for pure rule calls only.

## Rules and race handling

Serialize calls to each court instance in the existing service. If five join requests race with the same revision, one wins and the others receive `stale` plus a current snapshot; each client retries its join using that revision. This optimistic flow allocates five distinct marks without overlap. A sixth receives `full`. Duplicate joins at the current revision are idempotent. Disconnect cleanup must use the current server revision, not the departed client's stale revision. Release every seat belonging to a connection on disconnect or room/map change.

Only one pending or active challenge exists per court. Both participants must already be seated. Their free-shooting marks stay assigned throughout the challenge, and other free shooters retain their marks. Acceptance reserves one additional unused mark and `occupantId` switches between setter and matcher. Therefore HORSE needs a spare mark; a completely full court must first free one. A pending invitation does not reserve its mark: if another join takes it before acceptance, accept returns `mark`. Participants can leave the court to end that invitation; a future server UI may add a dedicated decline/cancel command after extending the versioned contract.

A setting miss swaps setter and matcher. A setting make gives the matcher a shot from the same reserved mark. A match make adds no letter; a miss adds the next letter of HORSE. The setter continues until missing. Five letters end the game with the setter as winner. Either participant leaving ends it with the remaining participant as winner and releases the reserved mark. During an active challenge, participants may only shoot on their turn; their free seats remain reserved but cannot be used to evade the challenge. Other seated players continue independently.

`shoot` computes the complete deterministic result immediately in bounded fixed steps and updates its pure rules snapshot. It returns a launch, result and the physical `resultServerTime`; this is not a network timer. The adapter must broadcast the launch immediately, schedule result presentation no earlier than `resultServerTime`, and gate the next challenge shot using `horseReadyAt`. A snapshot after launch already includes the computed outcome and next phase, so clients must defer visible score/letter feedback to the result event and disable the next turn until `horseReadyAt`. If the service requires results to be committed only at the physical crossing instant, its adapter needs pending-shot scheduling before adopting this synchronous reducer; no such scheduler has been deployed here.

Local launch/presentation must remain immediate and may predict a shot while requesting authorization. On rejection the shared client reconciles to the authoritative state without replaying a score. Deduplicate launch/result echoes by scope, epoch and sequence. Late arrivals need launches from the server's bounded active-shot list with launch timestamps: reconstruct elapsed age with `createBall(launch, elapsedSeconds)` and omit balls older than three seconds. That transient launch list and its network timer are adapter work; the pure session does not pretend to provide them.

## Bounds and rollout checks

Reject a frame over 4096 UTF-8 bytes before `JSON.parse`. Identifier fields permit only `[A-Za-z0-9_.:-]` and length `1..64`. Reject non-finite numbers, fractions where integers are required, negative revisions, unsupported versions, and times above `Number.MAX_SAFE_INTEGER - 3000`. Commands are limited to five seats, one challenge and one live shared shot per seat; simulation performs at most 361 fixed steps per accepted shot. Store at most 256 recent IDs per court and per HORSE reducer. For standalone `HorseSession.resolveShot`, only feed results already validated/deduplicated by the court (or an equivalent server shot gate); it is a trusted rules input and must never be exposed as a client command.

Before advertising shared support on the server, verify capability/version negotiation, explicit isolated-room/world support, bounded actual-release-origin agreement, five simultaneous clients plus the full response, disconnect/reconnect epochs, duplicate IDs after cache eviction, deterministic make/miss equivalence and late arrivals within lifetime with real clients. Preserve town painting IDs and art isolation. Without the capability this frontend offers solo practice. HORSE remains disabled until a deployed adapter and real setter/matcher/departure checks are available; the pure HORSE rules do not constitute a deployed game.
