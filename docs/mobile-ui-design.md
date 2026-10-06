# GraffCiti mobile UI design

Approved in the conversation on 7 October 2026. Apply the existing five-pass UI plan to the current game; preserve intentional Aippy-side fixes before presentation edits.

## Boundaries
- Existing game, React/Vite architecture, Aippy identity and multiplayer server remain.
- Import the ZIP's interpolation, texture density, immediate flattening, artwork reload and Android ZIP export changes exactly. No further gameplay/network edits.
- Deferred flatten helpers remain capability-gated; do not advertise or enable server capabilities.
- Temporary paint layers owned by individual pieces are a separate future project.
- Keep GitHub's newer tests, docs and real cover asset; omit whitespace-only city edits.

## Presentation
- The game fills its available parent; no minimum game height or reserved black footer.
- Shared GameSheet: labelled reachable header/close, one scrolling body, optional persistent footer. Dark charcoal, warm white, restrained orange accent, 44px primary targets.
- Game HUD: connection/player count, correct currency, chat and menu. Compact paint tools/status and movement controls remain outside sheets.
- Paint: brush, colour, spray/erase, size/opacity, five layers; palette management and advanced tuning disclose on demand; explicit Paint/Tags switch.
- Canvas: setup and existing server quotes before start; compact controls while painting; existing Finish, Edit Again countdown and Done callbacks remain.
- Chat: independently scrolling log and fixed composer, no forced scroll away from history, unread count while closed, bounded by available visual viewport.
- Art and selected-player sheets close locally without changing game selections. Admin operations stay behind permission-gated disclosure.
- Profile/closet/settings use the same surface. Radio/weather/view/rotation move out of the wrapping top toolbar.
- One foreground sheet at a time; closing a sheet must not invoke finish/clear or change the paint session.

## Verification
Build and run the existing test suite, TypeScript checks and focused UI tests. Verify archived preservation files byte-for-byte after UI edits. Exercise portrait 360/390px widths, short 500/600px frames, keyboard, landscape and desktop where a browser is available. Report any blocked browser checks honestly.
