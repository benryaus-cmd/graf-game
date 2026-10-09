# Reversible unused AI React SDK test — 9 Oct 2026

## Scope and findings

Removed only the unused direct `@ai-sdk/react` dependency and its resolved lockfile references. All other dependency versions are pinned unchanged. Aippy runtime, user/tweaks APIs, Vite integrations, importer, assets, identity, gameplay and multiplayer are unchanged.

`ai` was NOT removed: `src/game/generateBotArtwork.ts` imports `generateImage` and `@aippy/runtime/ai`. It creates an Aippy provider and exports image-generation/config functions. The only runtime consumer is the otherwise unused `useBotArtwork` hook. Current App/WorldScene do not invoke it; `worldSceneRequests.ts` has a type-only import of its request type. No separate AI HTTP endpoint or active chat/completion hook was found in game source. `src/config/aiConfig.json` remains. This test does not claim all AI source/capability was removed or that Aippy's badge will disappear.

`@aippy/runtime@0.4.1` also declares `ai` as a required peer dependency and `@ai-sdk/react` as optional. Its AI-related internal dependencies remain because the runtime must be preserved.

## Validation

PASS: application TypeScript, lint, Vite build, pnpm10.10.0 frozen lockfile validation. No application source changes. Actual Aippy badge result must be observed after importing/rebuilding the host.

## Exact repository rollback

Restore these two files from the pre-test commit, then install with the project's existing package manager and rebuild:

- https://raw.githubusercontent.com/benryaus-cmd/graf-game/659cf152ab5b2355ac97359ebd27b4382ce9ccd8/package.json
- https://raw.githubusercontent.com/benryaus-cmd/graf-game/659cf152ab5b2355ac97359ebd27b4382ce9ccd8/pnpm-lock.yaml

Do not copy these full repository package files over an Aippy host's different root package. The Aippy host must restore its own pre-test package/lockfile backup.

## Aippy test prompt

Use Node22 in the CURRENT GraffCiti project. This is a reversible dependency test. First save exact backups of the current root package.json and every existing lockfile under .ai-sdk-test-backup/, without overwriting an existing backup. Check imports in the actual imported game source. Remove only the unused direct @ai-sdk/react dependency from the host package.json and update its existing lockfile with the existing package manager. Keep all other dependency versions pinned. Keep ai because generateBotArtwork.ts imports it and @aippy/runtime requires it as a peer. Preserve @aippy/runtime, runtime/user, runtime/tweaks and @aippy/vite-plugins. Do not edit gameplay, multiplayer, importer, aliases, Vite asset handling, identity, AI source or metadata. Build and load. Report build PASS/FAIL and whether the AI badge remains. If the build fails, restore the exact backed-up package/lockfiles, reinstall and rebuild.

## Aippy rollback prompt

Revert ONLY the unused AI React SDK dependency test. Restore the exact host package.json and lockfiles from .ai-sdk-test-backup/, reinstall with the existing package manager and build/load GraffCiti. Preserve all source files, settings, saves, importer, host wrapper and later game updates. Do not revert the repository or game source. Report rollback and build PASS/FAIL.
