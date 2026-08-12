import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPATIBLE_IDENTIFIER,
  COMPATIBLE_UPDATER_PUBLIC_KEY,
  STABLE_PRODUCT_NAME,
  validateReleaseConfiguration,
} from './release-preflight.mjs';

function validConfiguration() {
  return {
    tag: 'v1.4.0',
    packageJson: { name: 'pcie', version: '1.4.0' },
    cargoVersion: '1.4.0',
    tauriConfig: {
      productName: STABLE_PRODUCT_NAME,
      version: '1.4.0',
      identifier: COMPATIBLE_IDENTIFIER,
      bundle: { createUpdaterArtifacts: true },
      plugins: {
        updater: {
          active: true,
          pubkey: COMPATIBLE_UPDATER_PUBLIC_KEY,
          endpoints: ['https://github.com/yangli216/pcie/releases/latest/download/latest.json'],
        },
      },
    },
  };
}

test('accepts the main 1.4.0 release baseline', () => {
  assert.deepEqual(validateReleaseConfiguration(validConfiguration()), { tag: 'v1.4.0', version: '1.4.0' });
});

test('rejects a reused pre-1.4 version line', () => {
  const configuration = validConfiguration();
  configuration.tag = 'v1.3.9';
  configuration.packageJson.version = '1.3.9';
  configuration.tauriConfig.version = '1.3.9';
  configuration.cargoVersion = '1.3.9';
  assert.throws(() => validateReleaseConfiguration(configuration), /must be 1\.4\.0 or newer/);
});

test('rejects a version that does not advance the latest published release', () => {
  const configuration = validConfiguration();
  configuration.previousVersion = 'v1.4.0';
  assert.throws(() => validateReleaseConfiguration(configuration), /must be newer/);
});

test('rejects an updater identity or key change', () => {
  const configuration = validConfiguration();
  configuration.tauriConfig.identifier = 'com.pcie.app';
  assert.throws(() => validateReleaseConfiguration(configuration), /identifier must remain/);

  const keyConfiguration = validConfiguration();
  keyConfiguration.tauriConfig.plugins.updater.pubkey = 'different-key';
  assert.throws(() => validateReleaseConfiguration(keyConfiguration), /compatibility public key/);
});
