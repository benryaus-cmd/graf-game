# Load-test results — Batch 6

All numbers below are measurements from the temporary load generator against the live GraffCiti server. These are synthetic tests, not a promise that browser rendering will support the same count.

## Old full-room architecture baseline

### 50 movers
- ~24k inbound deliveries/sec at the generator
- ~78–84 Mbps generator inbound
- server outbound around 83–96 Mbps
- p95 around 96–109ms in representative tests
- movement fan-out closely matched 50 × 49 × 10 = 24,500 deliveries/sec

The bottleneck was not RAM. It was broadcast/JSON/network/event-loop work.

## Batch 6 spatial — 50 movers, spread

- 50/50 connected
- 0 failures
- 0 drops
- ~1,500 inbound messages/sec
- ~5.0–5.2 Mbps generator inbound
- p50 5ms
- p95 14ms
- p99 18ms
- server CPU roughly in the teens
- negligible buffering

## Batch 6 spatial — 100 movers, spread

- 100/100 connected
- 0 failures
- 0 drops
- ~3,300–3,500 inbound messages/sec
- ~11 Mbps generator inbound
- p50 6ms
- p95 31ms
- p99 60ms
- server CPU mostly about 24–34%, with a higher sample around 42%
- server TX roughly 12–14 Mbps
- no socket backlog

## Batch 6 spatial — 200 movers, spread

- 200/200 connected
- 0 failures
- 0 drops
- ~6,700–7,100 inbound messages/sec
- ~23 Mbps generator inbound
- p50 30ms
- p95 103ms
- p99 233ms
- server CPU commonly ~66–85% of one Node core during full load
- new ~110ms event-loop stalls observed

Conclusion: 200 technically connected and ran, but it is not the desired comfortable production target on the current VM.

## Final 120-player mixed torture test

Profile:
- 120 simultaneous users
- every player moving at 10Hz
- spread spatial layout
- 25% painters, roughly 30 simultaneous painters

Results:
- 120/120 connected
- 0 failures
- 0 drops
- p50 7ms
- p95 49ms
- p99 91ms
- max WebSocket buffered amount: 1158 bytes
- server CPU mostly ~35–53%
- RAM ~30–32MB during the load
- server outbound around 16–22 Mbps
- one new 187ms event-loop lag warning

Live-paint spatial counters at the end:
- delivered spatial: 28,362
- avoided: 496,428

That is roughly 95% of potential live-paint fan-out avoided.

## Chosen product target

Use **120 concurrent players per room** as the practical target for this VM/configuration.

200 is useful evidence that there is headroom above 120, but it was already entering an uncomfortable event-loop/CPU zone.

Real browser/client rendering may become the limiting factor before the Node server does, especially if many nearby art textures are mounted at once.
