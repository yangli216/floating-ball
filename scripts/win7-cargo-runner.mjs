import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAURI_UTILS_WIN7_REVISION = '8a97d387a3a1a52f7c501762517e294d8c94e119';
export const TAURI_UTILS_REPOSITORY = 'https://github.com/tauri-apps/tauri';

export function buildCargoArgs(args) {
  return [
    '--config',
    `patch.crates-io.tauri-utils.git="${TAURI_UTILS_REPOSITORY}"`,
    '--config',
    `patch.crates-io.tauri-utils.rev="${TAURI_UTILS_WIN7_REVISION}"`,
    ...args,
  ];
}

export function runWin7Cargo(args, { env = process.env, runner = spawnSync } = {}) {
  if (env.PCIE_WIN7_BUILD !== '1') {
    throw new Error('Win7 Cargo runner requires PCIE_WIN7_BUILD=1');
  }

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = runner('cargo', buildCargoArgs(args), {
    cwd: path.join(projectRoot, 'src-tauri'),
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Win7 Cargo build failed with exit code ${result.status ?? 'unknown'}`);
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  try {
    runWin7Cargo(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
