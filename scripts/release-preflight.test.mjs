import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPATIBLE_IDENTIFIER,
  COMPATIBLE_UPDATER_PUBLIC_KEY,
  LEGACY_WINDOWS_WIX_UPGRADE_CODES,
  STABLE_PRODUCT_NAME,
  WINDOWS_DISPLAY_NAME,
  WINDOWS_WIX_LOCALE,
  WINDOWS_WIX_TEMPLATE,
  WINDOWS_WIX_UPGRADE_CODE,
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
    windowsConfig: {
      bundle: {
        targets: 'msi',
        windows: {
          wix: {
            language: { 'zh-CN': { localePath: WINDOWS_WIX_LOCALE } },
            upgradeCode: WINDOWS_WIX_UPGRADE_CODE,
            template: WINDOWS_WIX_TEMPLATE,
          },
        },
      },
    },
    windowsInstallerTemplate: `
      <?define DisplayName = "${WINDOWS_DISPLAY_NAME}" ?>
      <Product
            Name="$(var.DisplayName)"
            UpgradeCode="{{upgrade_code}}">
        <Upgrade Id="${LEGACY_WINDOWS_WIX_UPGRADE_CODES[0]}" />
        <Upgrade Id="${LEGACY_WINDOWS_WIX_UPGRADE_CODES[1]}" />
        <Shortcut Id="ApplicationDesktopShortcut" Name="$(var.DisplayName)" />
        <Shortcut Id="ApplicationStartMenuShortcut"
          Name="$(var.DisplayName)" />
        <Shortcut Id="UninstallShortcut" Name="卸载全医慧助（PCIE）" />
        <RemoveFile Id="RemoveLegacyPcieDesktopShortcut" />
        <RemoveFile Id="RemoveLegacyMedHermesDesktopShortcut" />
        <Component Id="CleanupLegacyPcieStartMenu" />
        <Component Id="CleanupLegacyMedHermesStartMenu" />
      </Product>
    `,
    windowsInstallerLocale: `
      <String Id="LaunchApp">启动${WINDOWS_DISPLAY_NAME}</String>
      <String Id="InstallAppFeature">安装${WINDOWS_DISPLAY_NAME}。</String>
    `,
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

test('rejects an implicit or changed Windows MSI upgrade identity', () => {
  const configuration = validConfiguration();
  delete configuration.windowsConfig.bundle.windows.wix.upgradeCode;
  assert.throws(() => validateReleaseConfiguration(configuration), /upgradeCode must remain/);
});

test('rejects a Windows installer that drops a historical installation family', () => {
  const configuration = validConfiguration();
  configuration.windowsInstallerTemplate = configuration.windowsInstallerTemplate.replace(
    LEGACY_WINDOWS_WIX_UPGRADE_CODES[0],
    'removed-legacy-upgrade-code',
  );
  assert.throws(() => validateReleaseConfiguration(configuration), /must migrate legacy upgrade code/);
});

test('rejects an English-only Windows installer display name', () => {
  const configuration = validConfiguration();
  configuration.windowsInstallerTemplate = configuration.windowsInstallerTemplate.replace(
    WINDOWS_DISPLAY_NAME,
    'PCIE',
  );
  assert.throws(() => validateReleaseConfiguration(configuration), /must expose the display name/);
});
