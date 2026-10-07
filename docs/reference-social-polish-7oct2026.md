# GraffCiti reference and social polish

Incremental runtime update over the existing creative-tools, tutorial and direct-reference-URL releases. No host wrapper/importer changes or server code.

## Reference placement and painting tools

Loading a reference enters Adjust mode immediately and closes the import sheet. Drag starts only on the visible image, including rotated/scaled/offset guides. Three compact sliders stay at the bottom: opacity, size, rotation. Done Adjusting restores painting and leaves reference controls collapsed at the top right. Image source and preview use disclosure sections rather than a permanent large thumbnail. Hide/show, fit, remove and replacement remain available.

Above Art is the default: the local ghost draws after transparent saved artwork and active paint, but opaque city geometry still occludes it. Below Paint draws before both. Neither mode writes depth, alters paint capture, sends an artwork request, or changes permanent graffiti stacking. Yellow selected-area outline and invalid-area feedback use a separate higher visual order so saved artwork cannot cover their edges. Actual wall strokes/layers and finished piece ownership are unchanged.

Custom colour selection previews continuously, quietly, without adding each intermediate sample to Recent colours. Releasing a gesture or selecting a hue preset commits one recent colour. Default and saved palette entries still change only through their explicit controls. The full rainbow hue strip and ten hue presets make changing colour families clear, including starting from black/white/grey; the two-dimensional picker then chooses saturation and brightness. Eyedropper remains separate.

## Collapsible UI

All shared game sheets (paint, art/piece inspection, chat, player list/profile, settings, closet, sky, emotes and reference) have separate minimise and close buttons. Minimise preserves mounted contents, selections and draft input, releases the modal focus trap and restores movement/look/workspace controls appropriate to the current game state. The compact header expands the same panel again. The selected-art highlight remains while inspecting the wall. Canvas/reference controls stack below a minimised sheet rather than overlap its header. Poster placement also has a local collapse control that preserves the carried poster. Developer project-file viewer remains separate from player game sheets.

## Players and moderation

Online opens a live names/handles list for everyone, including yourself. Snapshot, player_joined/player_left and role changes update it; movement frames do not update React. Select a player to see their nickname, Aippy @username, session ID and navigation back to players or chat. Chat authors select profiles by stable player ID, so duplicate nicknames cannot select the wrong author. Known chat identities remain available after a player leaves, while retained chat is capped by the existing 100-message limit.

Owners/admins get a direct Kick Player button using the existing admin_kick action. Existing admin-only ban duration presets, unban, credits and role controls remain. Admins cannot target owners, ordinary players see no moderation actions, and self-moderation is hidden. Requests retain existing server-authoritative role checks and confirmations; sending a kick is not presented as a confirmed removal. No server-wide announcement action was found, so no unsupported broadcast command was added.

Historical chat can use optional username/nickName fields already supplied by a server, or a player identity seen in this session. When neither exists, the UI says Aippy tag unavailable instead of guessing a handle from a display name. See server handoff for complete historical identity support.

## Validation

Automated tests cover guide draw order and rotated hit testing, neutral-colour hue selection, profile identity retention/enrichment, duplicate names, accessible roster/chat author controls and moderation role visibility. Browser checks exercise actual colour dragging, reference upload → Adjust → hide/show/front/back, 390×640 and 390×480 portrait, 844×390 landscape, rotated touch scrolling/tag drawing/chat, simultaneous walk/jump and panel collapse. Mock WebSocket browser checks exercise roster selection, existing kick/one-hour-ban payloads, duplicate-name chat profiles and departed-author profiles; this does not claim live server moderation was tested.

All 178 automated tests pass. Application TypeScript, ESLint, standalone production build and isolated Aippy-host production build pass. Protected paint/interpolation/surface/sync/flatten/connection files remain untouched. WorldSession changes are limited to identities and UI selection/view notifications; session switching, timers and flatten methods are unchanged.
