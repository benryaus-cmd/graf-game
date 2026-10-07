# Live system snapshot — 7 Oct 2026

## Verified live server

- WebSocket protocol: **2**
- Multiplayer endpoint: `wss://24.144.88.205/multiplayer`
- Health endpoint: `https://24.144.88.205/health`
- Artwork upload endpoint: `https://24.144.88.205/artwork-upload`
- Runtime server root: `/opt/aippy-game-server`
- Live server source file: `/opt/aippy-game-server/server/server.js`
- Verified Batch 6 server SHA: `1a6ebb3e1194a37104cfd8c91664a655073eec53d8973ac8fa279dd9b8a23e3d`
- GraffCiti container is currently run with a live Docker limit of **2 CPU / 2 GB**.
- Host machine is 4 vCPU / 8 GB RAM / 160 GB disk.
- Protocol v2 remains the base protocol. Batch 6 did not replace it.

## Verified Batch 6 capabilities

The live hello advertises the normal multiplayer capabilities plus:

- `spatial_interest_v1`
- `spatial_world_delta_v1`
- `player_directory_v1`

A client becomes spatial only when it joins with:

```json
{
  "type": "join",
  "roomId": "public",
  "protocol": 2,
  "spatialInterest": true,
  "position": [0, 1.7, 0]
}
```

Legacy clients can still connect and receive full-room networking.

## Current room-cap state

During the load tests, runtime settings still reported `maxRoomPlayers: 350`.

The practical product target chosen after testing is **120 concurrent users per room on this VM**, not 350. Do not claim the live runtime cap has been changed until the owner settings page/health response confirms it.

## Batch 7 status

A Batch 7 installer/client-revision gate was designed/generated after Batch 6.

It is **not part of this verified live snapshot unless an operator later installs it and verifies the resulting server SHA/health output**.

Do not make the client require `networkRevision` merely because these docs mention the proposed gate. The currently verified spatial opt-in is capability-gated through `hello.capabilities`.

## Identity/security note

The project still needs proper verified production Aippy authentication. Do not treat an off-main Git branch as a security boundary. Never commit owner PINs or SSH/API credentials.

Destructive owner controls use the separate server-side owner-control PIN mechanism. Client UI permissions must use server-returned permissions/roles, never nickname text.
