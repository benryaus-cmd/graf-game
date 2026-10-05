# HOW_I_DID_IT

## GitHub Importer Setup

A reusable importer was added to this project as **setup only**. Nothing was imported or replaced yet.

- Importer: `scripts/import-github.mjs` (Node 22 native fetch + `node:fs/promises`)
- Command: `pnpm run import:github`
- Upstream: `benryaus-cmd/graf-game`, branch `main`

### What it does

1. Fetches the **latest** `main` commit every time it is explicitly run — no revision numbers or markers to edit.
2. Resolves one commit, reads its Git Trees file list, and downloads every file from that **same commit**.
3. Imports all files under `src/` and `public/` into their identical existing project paths, including new files and binary assets.
4. Downloads everything into a staging directory **before** replacing anything. If any download fails, the existing game is left unchanged.
5. Backs up replaced files and restores them if applying the update fails.
6. Never touches: the importer itself, `package.json`, `vite.config.ts`, Aippy build configuration/plugins, `index.html`, `README.md`, `eslint.config.js`, `.env`, or `src/config/assets.*` (auto-generated).
7. Reports dependency differences between GitHub's `package.json` and the local one, so required changes can be merged manually without replacing Aippy's configuration.
8. Preserves saved paint, progression and settings — these live in browser localStorage, which the script never touches.
9. Records the imported commit SHA and file list in `import-record.json` **only after a successful import**.
10. Runs entirely in Node during development/build work — no browser-side GitHub fetching. No duplicate game, upstream folder, iframe, or additional React root is created.

### Usage

When I say **"Import latest GitHub"**:

1. Run `pnpm run import:github`.
2. Handle any required dependency changes reported by the diff (merge manually into `package.json`, keep Aippy's configuration).
3. Run the existing build command.

The import must finish **before** Vite generates the project-file manifest or compiles the game.