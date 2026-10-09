Update the EXISTING GraffCiti server basketball adapter using the current client contract on GitHub.

Exact frontend handover:
https://github.com/benryaus-cmd/graf-game/blob/7ea6319f8c5dd834f97d56dea462d62fbc396294/docs/horse-client-handoff-9oct2026.md

Keep current normal multiplayer, room/world admission, endpoints, free-shooting physics, releaseOffset, court version 1, artwork and economy unchanged.

Expose the existing v1 horse_invite and horse_accept commands on the SAME authenticated court socket. Use current basketballSession.ts (HorseState/HorseSession are in that file), basketballCourt.ts, basketballPhysics.ts and basketballRelease.ts. Send existing court_state/court_rejected with authoritative full CourtState. The exact payloads and rejection requirements are in the handover.

Participants in SET/MATCH can shoot only when horse.occupantId is their authenticated ID. Use horse.spotId to reconstruct releaseOffset and simulate their shot. Nonparticipants and pending-invitation players retain free shooting from their own assigned marks. Enforce seat.readyAt and horseReadyAt. All letters, phases, turns and winners must come from server authority, with no predicted rewards.

Only after implementing and testing real two-client invitation/acceptance/turns/letters/winner/departure plus a free-shooting bystander, advertise OPTIONAL server hello capability basketball_horse_v1 alongside basketball_court_v1. Do not add HORSE to requiredClientCapabilities or alter client admission. Keep it disabled until these checks pass.

Review the proposed horse_decline and horse_cancel schemas/semantics in the handover and return your preferred exact contract before frontend implementation. They are NOT currently v1 commands; do not assume client support. If backend scheduling or schemas should differ, send those updated schemas before enabling HORSE.

Report deployed server revision, supported messages/capabilities, real-client test evidence, and any schema changes. Do not treat mocked frontend tests as proof of backend deployment.
