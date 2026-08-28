import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

export function decodeUpdaterPublicKey(encodedPublicKey) {
  const value = String(encodedPublicKey || '').trim();
  assert(value && /^[A-Za-z0-9+/]+={0,2}$/.test(value), 'Win7 updater public key must be base64 encoded');
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  const keyLine = decoded.split(/\r?\n/).find((line) => line.startsWith('RW'));
  assert(keyLine, 'Win7 updater public key does not contain a minisign public key');
  const keyBytes = Buffer.from(keyLine, 'base64');
  assert(keyBytes.length >= 42, 'Win7 updater public key is truncated');
  return { encoded: value, decoded };
}

export function createWin7ReleaseConfig({ baseConfig, win7Config, publicKey }) {
  const decodedPublicKey = decodeUpdaterPublicKey(publicKey);
  assert(win7Config.identifier, 'Win7 validation config must define an identifier');
  assert(
    win7Config.identifier !== baseConfig.identifier,
    'Win7 release identifier must remain isolated from the regular client',
  );
  assert(
    win7Config.bundle?.windows?.wix?.upgradeCode !== baseConfig.bundle?.windows?.wix?.upgradeCode,
    'Win7 release UpgradeCode must remain isolated from the regular client',
  );
  assert(
    win7Config.bundle?.createUpdaterArtifacts === false && win7Config.plugins?.updater?.active === false,
    'The committed Win7 config must remain an updater-disabled validation config',
  );
  assert(
    decodedPublicKey.encoded !== baseConfig.plugins?.updater?.pubkey,
    'Win7 updater public key must not reuse the regular client updater key',
  );

  const releaseConfig = structuredClone(win7Config);
  releaseConfig.bundle.createUpdaterArtifacts = true;
  releaseConfig.plugins.updater = {
    active: true,
    'dangerous-insecure-transport-protocol': true,
    endpoints: [],
    pubkey: decodedPublicKey.encoded,
    windows: {
      installMode: 'passive',
    },
  };

  return {
    config: releaseConfig,
    publicKeyFingerprint: crypto
      .createHash('sha256')
      .update(decodedPublicKey.decoded)
      .digest('hex'),
  };
}

export function prepareWin7ReleaseConfig({ rootDir, outputPath, publicKey }) {
  const baseConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  const win7ConfigPath = path.join(rootDir, 'src-tauri', 'tauri.win7.conf.json');
  const resolvedOutputPath = path.resolve(outputPath);
  assert(resolvedOutputPath !== path.resolve(win7ConfigPath), 'Generated release config must not overwrite the validation config');

  const result = createWin7ReleaseConfig({
    baseConfig: JSON.parse(fs.readFileSync(baseConfigPath, 'utf8')),
    win7Config: JSON.parse(fs.readFileSync(win7ConfigPath, 'utf8')),
    publicKey,
  });
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(result.config, null, 2)}\n`);
  return { ...result, outputPath: resolvedOutputPath };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = path.resolve(args.root || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
    const outputPath = path.resolve(args.output || path.join(rootDir, 'src-tauri', 'tauri.win7.release.generated.conf.json'));
    const publicKey = process.env.WIN7_TAURI_UPDATER_PUBLIC_KEY;
    const result = prepareWin7ReleaseConfig({ rootDir, outputPath, publicKey });
    console.log(`Prepared Win7 release config: ${result.outputPath}`);
    console.log(`Win7 updater public key SHA-256: ${result.publicKeyFingerprint}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
