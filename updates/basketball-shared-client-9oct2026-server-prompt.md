Use the CURRENT GraffCiti server at /opt/aippy-game-server and its existing multiplayer WSS service.

Read the current frontend handover on GitHub:
https://github.com/benryaus-cmd/graf-game/blob/main/docs/shared-basketball-client-handoff-9oct2026.md

Also read docs/basketball-server-handoff.md, docs/server-report-town-basketball-9oct2026.md and the current pure basketballCourt.ts, basketballPhysics.ts, basketballRelease.ts, basketballHorse.ts and basketballSession.ts under src/game.

Implement the shared free-shooting adapter on the existing authenticated morning-quarter-v1 room, worldId map2-v1, mapId map2, courtId map2-basketball. Adopt the required bounded mark-relative releaseOffset and preserve court version 1. Derive the launch from the assigned mark and validated gesture; broadcast launch immediately, and present results no earlier than resultServerTime. Keep five unique seats, canonical shot IDs, cooldown, deduplication and disconnect cleanup.

Confirm or revise the optional court_state.state.liveShots shape from the handover before enabling capability. Advertise basketball_court_v1 only after the full contract works. Do not require it to use normal town multiplayer. Keep HORSE disabled until the deployed adapter and real two-client tests pass.

Preserve accounts, roles, credits, artwork, world namespaces and protocol 2/network revision 6. Do not create another backend or endpoint. If a different scheduling/schema approach is better, provide the updated exact schemas for the frontend before enabling it. Report changed files, verification and deployment status separately; prepared code is not proof of deployment.
