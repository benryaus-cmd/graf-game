# Shared basketball client verification — 9 October 2026

Source update: `basketball-shared-client-9oct2026`.

| Check | Result |
| --- | --- |
| Full Node test suite | 413 passed, 0 failed |
| App TypeScript | PASS |
| Repository lint | PASS |
| Standalone Vite build | PASS |
| Existing imported Aippy host fixture build | PASS |
| Solo native Chromium touch checks | 18 passed, no page errors |
| Mocked shared-court browser checks | 11 passed, no page errors |
| Old-world prompt browser checks | 5 passed, no page errors |

Pure tests cover strict release-offset bounds, all five marks and three viewport aspects, moved releases, zero-power drops, simulation equivalence, no mutation on malformed requests, shared prediction/echo deduplication, rejected retry IDs, authority-only feedback, five-client allocation, stale join/leave recovery, advancing clock, out-of-order results and delayed-result cleanup. A narrow authority-only inverse-projection tolerance prevents floating-point boundary rejection; raw client offset bounds remain strict.

Browser checks use actual Chromium touch events. Shared networking is mocked on the existing town connection; no live server court writes were made. Tiny software rendering is used for deterministic input checks, followed by a full scene screenshot to inspect the compact controls. These results do not measure Android performance or prove backend deployment. Existing softer 8.1 launch-speed ceiling and normal-release/drop behavior are preserved.

The old-world prompt was checked against a saved `original` choice: No preserves that selection, repeat entry prompts again, Yes saves/switches to town, town startup does not prompt, and entering original from town prompts. Its text is “New map available.” / “Join now.” with Yes and No. No permanent dismissal flag is written.

Independent rule and integration review identified clock freezing, result ordering, exhausted leave retries and same-ID rejected prediction issues. Those were corrected and covered by tests. Final root review confirmed the changes remain at the basketball bridge/lifecycle and map invitation; paint-history, rendering defaults, importer, aliases, wrapper and dependencies are unchanged. The legacy-world saved choice is preserved until the player accepts the invitation. Original and town artwork remain in their existing separate namespaces.

The shared free-shooting frontend is gated by admitted town identity and server capability. Unsupported servers continue to offer solo practice. Backend integration, deployment and actual multi-client verification remain pending; HORSE controls remain disabled. See [shared-basketball-client-handoff-9oct2026.md](shared-basketball-client-handoff-9oct2026.md).
