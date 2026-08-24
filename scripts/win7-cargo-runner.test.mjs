import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCargoArgs,
  runWin7Cargo,
  TAURI_UTILS_WIN7_REVISION,
} from './win7-cargo-runner.mjs';

test('pins the upstream tauri-utils Win7 ctor fix before the Cargo subcommand', () => {
  const args = buildCargoArgs(['build', '--release', '--target', 'x86_64-win7-windows-msvc']);
  assert.equal(args[0], '--config');
  assert.ok(args.some((value) => value.includes('patch.crates-io.tauri-utils.git')));
  assert.ok(args.some((value) => value.includes(TAURI_UTILS_WIN7_REVISION)));
  assert.deepEqual(args.slice(-4), ['build', '--release', '--target', 'x86_64-win7-windows-msvc']);
});

test('refuses to patch Cargo outside the explicit Win7 flavor', () => {
  assert.throws(
    () => runWin7Cargo(['build'], { env: {}, runner: () => ({ status: 0 }) }),
    /PCIE_WIN7_BUILD=1/,
  );
});
