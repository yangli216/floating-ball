import assert from 'node:assert/strict';
import test from 'node:test';
import { createWin7ReleaseConfig } from './prepare-win7-release-config.mjs';

function fixturePublicKey(seed = '1') {
  const keyBytes = Buffer.alloc(42, seed.charCodeAt(0));
  keyBytes.write('Ed', 0, 'ascii');
  return Buffer.from(
    `untrusted comment: minisign public key\n${keyBytes.toString('base64')}\n`,
  ).toString('base64');
}

function fixtureConfig() {
  return {
    baseConfig: {
      identifier: 'com.med-hermes.app',
      bundle: { windows: { wix: { upgradeCode: 'regular-upgrade-code' } } },
      plugins: { updater: { pubkey: fixturePublicKey('1') } },
    },
    win7Config: {
      identifier: 'com.med-hermes.app.win7',
      bundle: {
        createUpdaterArtifacts: false,
        windows: { wix: { upgradeCode: 'win7-upgrade-code' } },
      },
      plugins: { updater: { active: false, endpoints: [] } },
    },
  };
}

test('creates an updater-enabled Win7 release overlay without changing its identity', () => {
  const fixture = fixtureConfig();
  const result = createWin7ReleaseConfig({
    ...fixture,
    publicKey: fixturePublicKey('2'),
  });

  assert.equal(result.config.identifier, fixture.win7Config.identifier);
  assert.equal(result.config.bundle.createUpdaterArtifacts, true);
  assert.equal(result.config.plugins.updater.active, true);
  assert.equal(result.config.plugins.updater.endpoints.length, 0);
  assert.equal(result.config.plugins.updater['dangerous-insecure-transport-protocol'], true);
  assert.match(result.publicKeyFingerprint, /^[a-f0-9]{64}$/);
});

test('rejects reuse of the regular updater public key', () => {
  const fixture = fixtureConfig();
  assert.throws(
    () => createWin7ReleaseConfig({ ...fixture, publicKey: fixture.baseConfig.plugins.updater.pubkey }),
    /must not reuse/,
  );
});

test('rejects an invalid updater public key', () => {
  const fixture = fixtureConfig();
  assert.throws(
    () => createWin7ReleaseConfig({ ...fixture, publicKey: 'not-a-key' }),
    /public key/,
  );
});
