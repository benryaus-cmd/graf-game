# Server batch history

## Batch 1 — ownership, reconnect and retention

Implemented durable artwork/piece ownership fields so ownership survives reconnects rather than depending only on a transient player/session ID.

Also established:
- recent-chat delivery on join/resync
- 24-hour protection behavior
- graffiti survival-window behavior
- compatibility handling for older records

A bad deferred-flatten code path once caused `ReferenceError: message is not defined`; the obsolete path was removed. Do not reintroduce it.

## Batch 2 — gesture undo/redo and staged moderation deletion

Added server-authoritative:
- `stroke_undo`
- `stroke_redo`
- last 2 complete finger gestures
- `stroke_history_state`
- staged `admin_remove_user_art`
- direct `admin_delete_artwork`

Bulk removal processes 10 art entities per batch and yields between batches instead of deleting an entire user history in one synchronous loop.

## Batch 3 — owner reset/control tools

Added owner-only:
- save art baseline
- restore baseline
- wipe art
- restart
- reset + restart
- short challenge window + server-side owner-control PIN

Baseline operations preserve physical uploaded assets; they manipulate room art state.

## Batch 4 — owner references and performance foundations

Added:
- persistent owner reference images, max 50
- owner reference transforms/opacity/layer preference
- performance status
- event-loop/upload/persistence/message/memory counters
- async artwork writes
- debounced room persistence with stale-write protection
- forced save path
- immediate authoritative flatten behavior

Deferred flatten timer was removed.

## Batch 5 — runtime settings, owner web UI and saved art

Added persisted runtime settings including:
- art-creation cooldown
- online credit reward
- graffiti survival/protection settings
- recent chat window
- save debounce
- optional auto-reset
- saved-art reuse cost and max saved art
- starting credits
- canvas pricing
- room player cap

Also added:
- phone-friendly owner page
- account roles/actions/performance/settings
- saved finished-art library
- account-persistent saved art placement
- runtime credit/cooldown behavior

## Batch 6 — spatial interest + world streaming

Added:
- opt-in spatial clients
- 32m spatial cells
- player movement relevance tiers
- live-paint relevance
- persistent world filtering/deltas
- lightweight global player directory
- spatial performance counters
- legacy-client fallback

Defaults:
- near players: <=25m, up to 10Hz
- medium: <=60m, ~4Hz
- far: <=100m, ~1Hz
- beyond 100m: not rendered/updated
- live paint: 60m radius
- persistent world: 128m radius
- world sync interval: 1000ms

This changed the scaling profile from effectively full-room N² movement fan-out to relevance-based delivery.

## Proposed Batch 7 — client revision gate

Purpose:
- reduce room cap to chosen production target
- allow minimum client/network revision enforcement after the new spatial client is deployed
- reject stale clients rather than letting them silently fall back to expensive legacy full-room networking

Status in this documentation snapshot: **proposed/generated, not verified live**.

Activation rule:
1. deploy spatial-capable client
2. confirm it is actually joining spatially
3. only then enable the minimum-revision requirement
