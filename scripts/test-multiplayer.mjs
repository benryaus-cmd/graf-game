import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const directory = await mkdtemp(path.join(tmpdir(), 'sidestreet-tests-'));
try {
  const outfile = path.join(directory, 'tests.mjs');
  await build({
    entryPoints: [process.argv.includes('--live') ? 'tests/multiplayer-live.ts' : 'tests/multiplayer.test.ts'], outfile, bundle: true,
    platform: 'node', format: 'esm', alias: { '@': path.resolve('src') },
    define: { 'import.meta.env': JSON.stringify({ VITE_MULTIPLAYER_URL: process.env.VITE_MULTIPLAYER_URL }) },
  });
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
