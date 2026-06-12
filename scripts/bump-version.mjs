#!/usr/bin/env node
// Bump the application version across all canonical files and create a git tag.
//
// Usage:
//   node scripts/bump-version.mjs                # +0.0.1 (default)
//   node scripts/bump-version.mjs 0.1.0          # add 0.1.0 to current version
//   node scripts/bump-version.mjs --major        # +1.0.0
//   node scripts/bump-version.mjs --minor        # +0.1.0
//   node scripts/bump-version.mjs --patch        # +0.0.1
//   node scripts/bump-version.mjs --set 1.2.3    # set an exact version
//   node scripts/bump-version.mjs --no-commit    # skip git commit
//   node scripts/bump-version.mjs --no-tag       # skip git tag
//   node scripts/bump-version.mjs --dry-run      # preview without writing

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** Files whose `version` field must stay in sync. */
const jsonTargets = [
  'package.json',
  'apps/desktop/package.json',
  'apps/node-service/package.json',
  'apps/desktop/src-tauri/tauri.conf.json',
].map((rel) => resolve(root, rel));

const cargoToml = resolve(root, 'apps/desktop/src-tauri/Cargo.toml');

function parseArgs(argv) {
  const flags = { commit: true, tag: true, dryRun: false };
  let delta = null;
  let setVersion = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--no-commit':
        flags.commit = false;
        break;
      case '--no-tag':
        flags.tag = false;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--major':
        delta = [1, 0, 0];
        break;
      case '--minor':
        delta = [0, 1, 0];
        break;
      case '--patch':
        delta = [0, 0, 1];
        break;
      case '--set':
        setVersion = argv[i + 1];
        i += 1;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        delta = parseTriple(arg, `delta "${arg}"`);
        break;
    }
  }

  return { flags, delta, setVersion };
}

function parseTriple(value, label) {
  const parts = String(value).split('.');
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`Invalid ${label}. Expected MAJOR.MINOR.PATCH (e.g. 0.0.1).`);
  }
  return parts.map((p) => Number.parseInt(p, 10));
}

function readCurrentVersion() {
  const pkg = JSON.parse(readFileSync(jsonTargets[0], 'utf8'));
  return parseTriple(pkg.version, `current version "${pkg.version}"`);
}

function applyEdits(nextVersion) {
  for (const file of jsonTargets) {
    const raw = readFileSync(file, 'utf8');
    const updated = raw.replace(/("version"\s*:\s*")\d+\.\d+\.\d+(")/, `$1${nextVersion}$2`);
    if (updated === raw) {
      throw new Error(`Could not find a version field to update in ${file}`);
    }
    writeFileSync(file, updated);
  }

  const cargoRaw = readFileSync(cargoToml, 'utf8');
  const cargoUpdated = cargoRaw.replace(/^(version\s*=\s*")\d+\.\d+\.\d+(")/m, `$1${nextVersion}$2`);
  if (cargoUpdated === cargoRaw) {
    throw new Error(`Could not find a version field to update in ${cargoToml}`);
  }
  writeFileSync(cargoToml, cargoUpdated);
}

function git(args) {
  return execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
}

function main() {
  const { flags, delta, setVersion } = parseArgs(process.argv.slice(2));
  const current = readCurrentVersion();

  let next;
  if (setVersion) {
    next = parseTriple(setVersion, `--set value "${setVersion}"`);
  } else {
    const inc = delta ?? [0, 0, 1];
    next = [current[0] + inc[0], current[1] + inc[1], current[2] + inc[2]];
  }

  const currentStr = current.join('.');
  const nextStr = next.join('.');
  const tag = `v${nextStr}`;

  console.log(`Current version: ${currentStr}`);
  console.log(`Next version:    ${nextStr}`);

  if (flags.dryRun) {
    console.log('Dry run: no files written, no git actions performed.');
    return;
  }

  applyEdits(nextStr);
  console.log('Updated version in:');
  for (const file of [...jsonTargets, cargoToml]) {
    console.log(`  - ${file.replace(`${root}\\`, '').replace(`${root}/`, '')}`);
  }

  if (flags.commit || flags.tag) {
    let isRepo = false;
    try {
      git(['rev-parse', '--is-inside-work-tree']);
      isRepo = true;
    } catch {
      console.warn('Not a git repository: skipping commit and tag.');
    }

    if (isRepo) {
      const existing = git(['tag', '--list', tag]);
      if (existing) {
        throw new Error(`Git tag ${tag} already exists. Aborting.`);
      }

      if (flags.commit) {
        git(['add', ...[...jsonTargets, cargoToml]]);
        git(['commit', '-m', `chore: release ${tag}`]);
        console.log(`Committed version bump as "chore: release ${tag}".`);
      }

      if (flags.tag) {
        git(['tag', '-a', tag, '-m', `Release ${tag}`]);
        console.log(`Created git tag ${tag}.`);
        console.log(`Push it with: git push origin ${tag}`);
      }
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`bump-version failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
