import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertProjectVersionsAligned,
  readProjectVersionState,
  resolveTargetVersion,
  restoreProjectVersionState,
  writeProjectVersion,
} from './release-version.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  let explicitVersion;
  let type = 'patch';
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--version') {
      const nextValue = argv[index + 1];
      if (!nextValue || nextValue.startsWith('--')) {
        throw new Error('--version requires a stable X.Y.Z value');
      }
      explicitVersion = nextValue;
      index += 1;
    } else if (!value.startsWith('--')) {
      type = value;
    } else {
      throw new Error(`unknown release option: ${value}`);
    }
  }
  return { explicitVersion, type };
}

function git(args, options = {}) {
  const output = execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', ...options });
  return typeof output === 'string' ? output.trim() : '';
}

function tagExists(tag) {
  try {
    git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function assertFormalReleaseWorkspace(targetVersion) {
  const branch = git(['branch', '--show-current']);
  if (branch !== 'main') {
    throw new Error(`formal releases must run on main, current branch: ${branch || '(detached HEAD)'}`);
  }
  const status = git(['status', '--porcelain']);
  if (status) {
    throw new Error('formal releases require a clean working tree; commit or stash changes first');
  }
  if (tagExists(`v${targetVersion}`)) {
    throw new Error(`tag v${targetVersion} already exists`);
  }
}

try {
  const state = readProjectVersionState(rootDir);
  const currentVersion = assertProjectVersionsAligned(state);
  const targetVersion = resolveTargetVersion(currentVersion, parseArgs(process.argv.slice(2)));
  assertFormalReleaseWorkspace(targetVersion);

  console.log(`Preparing formal release: ${currentVersion} -> ${targetVersion}`);
  let committed = false;
  try {
    writeProjectVersion(state, targetVersion);
    execFileSync(
      process.execPath,
      [path.join(rootDir, 'scripts', 'release-preflight.mjs'), '--tag', `v${targetVersion}`],
      { cwd: rootDir, stdio: 'inherit' },
    );
    git(['add', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml'], { stdio: 'inherit' });
    git(['commit', '-m', `chore: release v${targetVersion}`], { stdio: 'inherit' });
    committed = true;
    git(['tag', `v${targetVersion}`], { stdio: 'inherit' });
  } catch (error) {
    if (!committed) {
      restoreProjectVersionState(state);
      try {
        git(['restore', '--staged', 'package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml']);
      } catch {
        // The files may not have reached the staging step yet.
      }
    }
    throw error;
  }

  console.log(`Formal release v${targetVersion} prepared successfully.`);
  console.log(`Push with:\n  git push origin main\n  git push origin v${targetVersion}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
