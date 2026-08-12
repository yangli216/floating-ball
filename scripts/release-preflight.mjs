import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const MINIMUM_MAIN_RELEASE = '1.4.0';
export const COMPATIBLE_IDENTIFIER = 'com.med-hermes.app';
export const STABLE_PRODUCT_NAME = 'PCIE';
export const WINDOWS_DISPLAY_NAME = '全医慧助（PCIE）';
export const WINDOWS_WIX_UPGRADE_CODE = '3b611483-0215-50cb-b961-cf1a889c5546';
export const LEGACY_WINDOWS_WIX_UPGRADE_CODES = [
  '14565492-a50a-59b4-b895-f9ebb5c21055',
  'b12fd688-122f-51fe-bec8-022d41a503e1',
];
export const WINDOWS_WIX_TEMPLATE = './windows/wix/main.wxs';
export const WINDOWS_WIX_LOCALE = './windows/wix/zh-CN.wxl';
export const COMPATIBLE_UPDATER_PUBLIC_KEY =
  'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDM0MUE5REVEQkMwOEE0RTgKUldUb3BBaTg3WjBhTk9WREQxN3dlSm1uYklSbGNNZldhbnBpV3Rpb1pscnBVZisxcTNDM08zRncK';

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[current.slice(2)] = true;
    } else {
      args[current.slice(2)] = next;
      index += 1;
    }
  }
  return args;
}

export function parseSemver(value, label = 'version') {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) {
    throw new Error(`${label} must be a stable x.y.z version, received: ${value}`);
  }
  return match.slice(1).map(Number);
}

export function compareSemver(left, right) {
  const leftParts = parseSemver(left, 'left version');
  const rightParts = parseSemver(right, 'right version');
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return 0;
}

export function readCargoPackageVersion(cargoToml) {
  const packageStart = cargoToml.indexOf('[package]');
  if (packageStart < 0) throw new Error('src-tauri/Cargo.toml is missing [package]');
  const packageBody = cargoToml.slice(packageStart + '[package]'.length);
  const nextSection = packageBody.search(/^\[[^\]]+\]/m);
  const packageSection = nextSection >= 0 ? packageBody.slice(0, nextSection) : packageBody;
  const version = packageSection.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (!version) throw new Error('src-tauri/Cargo.toml is missing [package].version');
  return version;
}

export function validateReleaseConfiguration({
  tag,
  previousVersion,
  packageJson,
  tauriConfig,
  windowsConfig,
  windowsInstallerTemplate,
  windowsInstallerLocale,
  cargoVersion,
}) {
  if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`release tag must use vX.Y.Z, received: ${tag || '(empty)'}`);
  }

  const version = tag.slice(1);
  parseSemver(version, 'release version');
  const versions = {
    tag: version,
    packageJson: packageJson.version,
    tauriConfig: tauriConfig.version,
    cargo: cargoVersion,
  };
  const mismatched = Object.entries(versions).filter(([, value]) => value !== version);
  if (mismatched.length > 0) {
    throw new Error(
      `release versions must match ${version}: ${mismatched.map(([name, value]) => `${name}=${value}`).join(', ')}`,
    );
  }

  if (compareSemver(version, MINIMUM_MAIN_RELEASE) < 0) {
    throw new Error(`main releases must be ${MINIMUM_MAIN_RELEASE} or newer, received: ${version}`);
  }
  if (previousVersion && compareSemver(version, previousVersion.replace(/^v/, '')) <= 0) {
    throw new Error(`release ${version} must be newer than the latest published version ${previousVersion}`);
  }
  if (packageJson.name !== 'pcie') {
    throw new Error(`package.json name must remain pcie, received: ${packageJson.name}`);
  }
  if (tauriConfig.productName !== STABLE_PRODUCT_NAME) {
    throw new Error(`Tauri productName must remain ${STABLE_PRODUCT_NAME} for stable artifact names`);
  }
  if (tauriConfig.identifier !== COMPATIBLE_IDENTIFIER) {
    throw new Error(`Tauri identifier must remain ${COMPATIBLE_IDENTIFIER} for in-place upgrades`);
  }

  const updater = tauriConfig.plugins?.updater;
  if (!updater?.active || updater.pubkey !== COMPATIBLE_UPDATER_PUBLIC_KEY) {
    throw new Error('Tauri updater must stay active and use the published compatibility public key');
  }
  if (tauriConfig.bundle?.createUpdaterArtifacts !== true) {
    throw new Error('bundle.createUpdaterArtifacts must remain true');
  }

  const windowsBundle = windowsConfig?.bundle;
  const wix = windowsBundle?.windows?.wix;
  if (windowsBundle?.targets !== 'msi') {
    throw new Error('Windows releases must only build the MSI target');
  }
  if (wix?.upgradeCode?.toLowerCase() !== WINDOWS_WIX_UPGRADE_CODE) {
    throw new Error(`Windows WiX upgradeCode must remain ${WINDOWS_WIX_UPGRADE_CODE}`);
  }
  if (wix?.template !== WINDOWS_WIX_TEMPLATE) {
    throw new Error(`Windows WiX template must remain ${WINDOWS_WIX_TEMPLATE}`);
  }
  if (wix?.language?.['zh-CN']?.localePath !== WINDOWS_WIX_LOCALE) {
    throw new Error(`Windows WiX zh-CN locale must remain ${WINDOWS_WIX_LOCALE}`);
  }

  const displayNameMarker = `<?define DisplayName = "${WINDOWS_DISPLAY_NAME}" ?>`;
  const requiredTemplateMarkers = [
    displayNameMarker,
    'Name="$(var.DisplayName)"\n            UpgradeCode="{{upgrade_code}}"',
    'Id="ApplicationDesktopShortcut" Name="$(var.DisplayName)"',
    'Id="ApplicationStartMenuShortcut"',
    'Name="卸载全医慧助（PCIE）"',
    'RemoveLegacyPcieDesktopShortcut',
    'RemoveLegacyMedHermesDesktopShortcut',
    'CleanupLegacyPcieStartMenu',
    'CleanupLegacyMedHermesStartMenu',
  ];
  if (
    typeof windowsInstallerTemplate !== 'string' ||
    requiredTemplateMarkers.some((marker) => !windowsInstallerTemplate.includes(marker))
  ) {
    throw new Error(`Windows WiX template must expose the display name ${WINDOWS_DISPLAY_NAME}`);
  }
  for (const legacyUpgradeCode of LEGACY_WINDOWS_WIX_UPGRADE_CODES) {
    if (!windowsInstallerTemplate.toLowerCase().includes(legacyUpgradeCode)) {
      throw new Error(`Windows WiX template must migrate legacy upgrade code ${legacyUpgradeCode}`);
    }
  }
  if (
    typeof windowsInstallerLocale !== 'string' ||
    !windowsInstallerLocale.includes(`启动${WINDOWS_DISPLAY_NAME}`) ||
    !windowsInstallerLocale.includes(`安装${WINDOWS_DISPLAY_NAME}`)
  ) {
    throw new Error(`Windows WiX locale must use the display name ${WINDOWS_DISPLAY_NAME}`);
  }

  const endpoints = updater.endpoints ?? [];
  if (!endpoints.includes('https://github.com/yangli216/pcie/releases/latest/download/latest.json')) {
    throw new Error('the current GitHub updater endpoint is missing');
  }

  return { tag, version };
}

export function runReleasePreflight(rootDir, tag, previousVersion) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const tauriConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const windowsConfigPath = path.join(rootDir, 'src-tauri', 'tauri.windows.conf.json');
  const windowsConfig = JSON.parse(fs.readFileSync(windowsConfigPath, 'utf8'));
  const wix = windowsConfig.bundle.windows.wix;
  const windowsInstallerTemplate = fs.readFileSync(
    path.resolve(path.dirname(windowsConfigPath), wix.template),
    'utf8',
  );
  const windowsInstallerLocale = fs.readFileSync(
    path.resolve(path.dirname(windowsConfigPath), wix.language['zh-CN'].localePath),
    'utf8',
  );
  const cargoToml = fs.readFileSync(path.join(rootDir, 'src-tauri', 'Cargo.toml'), 'utf8');
  return validateReleaseConfiguration({
    tag,
    previousVersion,
    packageJson,
    tauriConfig,
    windowsConfig,
    windowsInstallerTemplate,
    windowsInstallerLocale,
    cargoVersion: readCargoPackageVersion(cargoToml),
  });
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = path.resolve(args.root || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
    const result = runReleasePreflight(rootDir, args.tag, args['previous-version']);
    console.log(`Release preflight passed for ${result.tag}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
