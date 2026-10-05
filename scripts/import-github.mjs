/**
 * import-github.mjs — GitHub importer for this Aippy project.
 *
 * Setup-only tool: run explicitly with `pnpm run import:github`.
 * Fetches the latest `main` branch of the upstream repository, resolves a
 * single commit, downloads every file under src/ and public/ from that
 * same commit into a staging area, and only then applies the update.
 *
 * Safety rules enforced here:
 *  - Nothing is replaced until EVERYTHING has downloaded successfully.
 *  - If applying the update fails, replaced files are restored from backup.
 *  - The importer itself, Aippy build config, plugins, README.md and
 *    eslint.config.js are never touched.
 *  - Saved paint / progression / settings live in localStorage — this script
 *    never clears any browser storage, so they are preserved.
 *  - The imported commit SHA and file list are recorded only after success.
 *
 * Node 22+ (native fetch, node:fs/promises).
 */

import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const REPO = 'benryaus-cmd/graf-game';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const fetch = globalThis.fetch;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGING_ROOT = path.join(PROJECT_ROOT, '.import-staging');
const RECORD_PATH = path.join(PROJECT_ROOT, 'import-record.json');

/** Paths that must never be imported or overwritten. */
const PRESERVED = [
  'package.json',
  'vite.config.ts',
  'eslint.config.js',
  'README.md',
  'index.html',
  'HOW_I_DID_IT.md',
  '.env',
  'scripts',
  'import-record.json',
];

/** Auto-generated Aippy files that must not be overwritten by upstream. */
const AUTO_GENERATED = [
  'src/config/assets.json',
  'src/config/assets.ts',
];

/** Directories we import (identical paths into the project root). */
const IMPORT_PREFIXES = ['src/', 'public/'];

function isPreserved(p) {
  const norm = p.replaceAll('\\', '/');
  return PRESERVED.some((k) => norm === k || norm.startsWith(`${k}/`));
}

function shouldImport(p) {
  const norm = p.replaceAll('\\', '/');
  return (
    IMPORT_PREFIXES.some((prefix) => norm.startsWith(prefix)) &&
    !isPreserved(norm) &&
    !AUTO_GENERATED.includes(norm)
  );
}

async function ghFetch(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'aippy-import-github',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub request failed: ${res.status} ${res.statusText} (${url})`);
  }
  return res;
}

async function resolveLatestCommit() {
  const res = await ghFetch(`${API}/commits/${BRANCH}`);
  const data = await res.json();
  return { sha: data.sha, message: data.commit?.message?.split('\n')[0] ?? '' };
}

async function fetchTree(sha) {
  const res = await ghFetch(`${API}/git/trees/${sha}?recursive=1`);
  const data = await res.json();
  if (data.truncated) {
    throw new Error('Git tree response was truncated — repository too large.');
  }
  return data.tree.filter((e) => e.type === 'blob');
}

async function downloadIntoStaging(files, commitSha, stagingDir) {
  const manifest = [];
  let index = 0;
  for (const entry of files) {
    index += 1;
    const rel = entry.path;
    if (!shouldImport(rel)) continue;

    const dest = path.join(stagingDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    const res = await fetch(`${RAW}/${commitSha}/${rel.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { 'User-Agent': 'aippy-import-github' },
    });
    if (!res.ok) {
      throw new Error(`Failed to download ${rel}: ${res.status} ${res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    manifest.push({ path: rel, size: buf.length, mode: entry.mode });
    process.stdout.write(`  [${index}/${files.length}] staged ${rel} (${buf.length} bytes)\n`);
  }
  return manifest;
}

async function applyStagedFiles(stagingDir, manifest, backupDir) {
  const applied = [];
  try {
    for (const { path: rel } of manifest) {
      const projectPath = path.join(PROJECT_ROOT, rel);
      if (existsSync(projectPath)) {
        const backupPath = path.join(backupDir, rel);
        await mkdir(path.dirname(backupPath), { recursive: true });
        await rename(projectPath, backupPath);
      } else {
        await mkdir(path.dirname(projectPath), { recursive: true });
      }
      await rename(path.join(stagingDir, rel), projectPath);
      applied.push(rel);
    }
  } catch (err) {
    process.stderr.write(`\nApplying update failed: ${err.message}\nRestoring replaced files...\n`);
    for (const rel of applied) {
      const projectPath = path.join(PROJECT_ROOT, rel);
      const backupPath = path.join(backupDir, rel);
      try {
        if (existsSync(projectPath)) await rm(projectPath);
        if (existsSync(backupPath)) await rename(backupPath, projectPath);
      } catch (restoreErr) {
        process.stderr.write(`  WARNING: could not restore ${rel}: ${restoreErr.message}\n`);
      }
    }
    throw new Error('Update rolled back. Existing game files were restored.', { cause: err });
  }
}

async function reportDependencyDiffs(commitSha) {
  try {
    const res = await fetch(`${RAW}/${commitSha}/package.json`, {
      headers: { 'User-Agent': 'aippy-import-github' },
    });
    if (!res.ok) return process.stdout.write('\nNo package.json upstream — skipping dependency diff.\n');
    const upstream = await res.json();
    const local = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));

    process.stdout.write('\n=== DEPENDENCY DIFF (upstream vs local package.json) ===\n');
    let found = false;
    for (const section of ['dependencies', 'devDependencies']) {
      const up = upstream[section] ?? {};
      const lo = local[section] ?? {};
      for (const [name, version] of Object.entries(up)) {
        if (lo[name] === undefined) {
          process.stdout.write(`  + ADD to ${section}: ${name}@${version}\n`);
          found = true;
        } else if (lo[name] !== version) {
          process.stdout.write(`  ~ DIFF in ${section}: ${name} upstream=${version} local=${lo[name]}\n`);
          found = true;
        }
      }
    }
    if (!found) process.stdout.write('  (no differences)\n');
    process.stdout.write(
      'NOTE: merge any required changes manually — the Aippy package.json is NOT replaced.\n',
    );
  } catch (err) {
    process.stderr.write(`Dependency diff skipped: ${err.message}\n`);
  }
}

async function main() {
  process.stdout.write(`Importing latest ${BRANCH} from github.com/${REPO}...\n`);

  const { sha, message } = await resolveLatestCommit();
  process.stdout.write(`Latest commit: ${sha.slice(0, 12)} — ${message}\n`);

  process.stdout.write('Fetching file tree...\n');
  const tree = await fetchTree(sha);
  const importable = tree.filter((e) => shouldImport(e.path));
  if (importable.length === 0) {
    process.stdout.write('Nothing to import under src/ or public/.\n');
  }

  // Download EVERYTHING into staging before touching the project.
  await rm(STAGING_ROOT, { recursive: true, force: true });
  await mkdir(STAGING_ROOT, { recursive: true });
  let stagingDir;
  try {
    stagingDir = await mkdtemp(path.join(STAGING_ROOT, 'run-'));
    process.stdout.write(`Staging ${importable.length} files...\n`);
    const manifest = await downloadIntoStaging(importable, sha, stagingDir);

    // All downloads succeeded — apply atomically with rollback support.
    const backupDir = path.join(STAGING_ROOT, 'backup');
    await mkdir(backupDir, { recursive: true });
    await applyStagedFiles(stagingDir, manifest, backupDir);

    // Success only now — record the imported commit and file list.
    await writeFile(
      RECORD_PATH,
      `${JSON.stringify({ commit: sha, message, importedAt: new Date().toISOString(), files: manifest }, null, 2)}\n`,
    );
    process.stdout.write(`\nImport complete: ${manifest.length} files at commit ${sha.slice(0, 12)}.\n`);
    process.stdout.write('Recorded in import-record.json.\n');

    await reportDependencyDiffs(sha);
  } finally {
    await rm(STAGING_ROOT, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`\nImport failed: ${err.message}\nThe existing game was left unchanged.\n`);
  process.exit(1);
});