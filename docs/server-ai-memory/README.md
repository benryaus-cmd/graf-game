# GraffCiti server/client memory

This folder is the compact technical memory for the multiplayer/server work completed on 7 Oct 2026.

It intentionally lives on the side branch `perf-artwork-lag-probe`, not `main`. It is documentation/reference material, not a second runtime source tree.

> Important: a Git branch is not a secret. Do not commit passwords, SSH private keys, owner-control PINs, API keys, cookies, or other credentials here.

## Read first

- [LIVE-SYSTEM-SNAPSHOT.md](./LIVE-SYSTEM-SNAPSHOT.md) — what is actually live and what is only proposed.
- [CLIENT-SERVER-SCHEMAS.txt](./CLIENT-SERVER-SCHEMAS.txt) — exact client/server wire schemas gathered from the server implementation.
- [CLIENT-INTEGRATION-CHECKLIST.md](./CLIENT-INTEGRATION-CHECKLIST.md) — what the GitHub/Aippy client still needs to wire.
- [SPATIAL-NETWORKING.md](./SPATIAL-NETWORKING.md) — why Batch 6 exists and how relevance/unloading works.
- [LOAD-TEST-RESULTS.md](./LOAD-TEST-RESULTS.md) — measured 50/100/120/200-player results.
- [OWNER-ADMIN-FEATURES.md](./OWNER-ADMIN-FEATURES.md) — moderation, persistent owner references, saved art and server controls.
- [SERVER-BATCH-HISTORY.md](./SERVER-BATCH-HISTORY.md) — Batches 1–6 and the proposed Batch 7 gate.
- [KNOWN-TRAPS.md](./KNOWN-TRAPS.md) — bugs/architecture mistakes not to repeat.
- [LIVE-OPS-RUNBOOK.md](./LIVE-OPS-RUNBOOK.md) — where the server lives and how to patch/restart it safely.
- [GAME-CODER-HANDOVER.txt](./GAME-CODER-HANDOVER.txt) — grouped product/client requirements handover.

## Source-of-truth rule

There are two separate systems:

1. GitHub `benryaus-cmd/graf-game` is the game/client source.
2. The live multiplayer server is a separately deployed Node service under `/opt/aippy-game-server` on the DigitalOcean VM.

Do not assume changing GitHub changes the live server. Do not create a second backend in the game repo.

The unrelated `/opt/game-studio` system must not be touched during GraffCiti server work.
