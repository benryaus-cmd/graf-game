# Project File Viewer

## Concept
A hidden, secure developer utility for inspecting and extracting project source code, accessible only via a secret interaction sequence in the settings menu.

## Gameplay
- **Core Function**: Provides a searchable, multi-select file explorer for the current project's source code.
- **Access**: Triggered by tapping the "Settings" title 10 times in 8 seconds, followed by the password "gg".
- **Search**: Toggle between "NAMES ONLY" and "NAMES + CONTENT" search modes.
- **File Management**: Select multiple files to copy their contents or the project tree structure to the clipboard.
- **Preview**: View full source code for any file with horizontal/vertical scrolling.

## Visual & Audio
- **Theme**: Dark, professional developer-focused aesthetic (monospaced fonts, high-contrast text).
- **Art Style**: Minimalist UI, clean lines, dark background, functional layout.
- **Layout**: Full-screen mobile overlay with fixed header, scrollable list, and fixed bottom toolbar.
- **Key Visuals**: Code-drawn UI elements, file icons, search bar, and selection checkboxes.
- **Audio Mood**: Silent, with subtle haptic feedback on successful clipboard operations.

## Feedback & Juice
- **Interaction** -> Haptic tick on success.
- **Search** -> Instant filtering of file list.
- **Copy** -> Brief "COPIED" feedback text.

## Leaderboard
- **Enabled**: No
- **Reason**: Developer utility, not a game.

## Assets
| Type | Name | Params | Description | Url |
|------|------|--------|-------------|-----|
| synth | haptic_tick | 50ms | Crisp, short haptic vibration pulse | |