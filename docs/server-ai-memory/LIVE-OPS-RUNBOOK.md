# Live server operations runbook

## Scope

GraffCiti live multiplayer server root:
`/opt/aippy-game-server`

Main server source:
`/opt/aippy-game-server/server/server.js`

Do not touch:
`/opt/game-studio`

That is a separate system.

## Before any server edit

1. Make a timestamped backup of `server/server.js`.
2. Make the edit/patch narrowly.
3. Run `node --check server/server.js`.
4. If syntax check fails, restore the backup. Do not rebuild broken source.

## Rebuild/restart

The working pattern used for these batches:
- `docker compose config`
- `docker compose up -d --build`
- wait for health
- inspect recent logs

The live 2 CPU / 2 GB limit was applied with Docker after rebuilds.

Batch 6 intentionally did not permanently rewrite the Compose resource configuration. A future rebuild script must reapply the live limit unless Compose has since been updated and verified.

## Verify after deployment

Check:
- local health
- public health
- container state
- recent logs
- runtime settings preserved
- expected capability markers
- WebSocket smoke test when networking changed

Never claim a patch is live merely because a script was generated.

## Current verified live checkpoint

Batch 6 source SHA:
`1a6ebb3e1194a37104cfd8c91664a655073eec53d8973ac8fa279dd9b8a23e3d`

Container target:
- 2 CPU
- 2 GB

## Scaling target

Chosen practical room target after load testing: 120.

The last observed runtime cap during tests was still 350, so verify/change it through owner runtime settings rather than assuming the code default.

## Temporary load-test infrastructure

A separate temporary load generator was used for synthetic testing. Delete it after testing is fully finished so it does not continue billing.

## Secrets

Never place into this repo private SSH keys, owner-control PINs, provider/API keys, cookies/tokens, or .env contents.
