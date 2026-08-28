import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function ensureRequired(args, keys) {
  for (const key of keys) {
    if (!args[key]) {
      throw new Error(`Missing required argument: --${key}`);
    }
  }
}

function normalizeVersion(version) {
  return version.startsWith('v') ? version.slice(1) : version;
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function findUpdaterArtifact(artifactsDir) {
  const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const signedCandidates = files.filter((file) => {
    const isWindowsUpdater = file.endsWith('.msi.zip') || file.endsWith('.msi');
    return isWindowsUpdater && files.includes(`${file}.sig`);
  });
  const updaterArchive = signedCandidates.find((file) => file.endsWith('.msi.zip'));
  if (updaterArchive) {
    return updaterArchive;
  }
  const signedMsi = signedCandidates.find((file) => file.endsWith('.msi'));
  if (signedMsi) {
    return signedMsi;
  }

  throw new Error(`No signed Windows MSI updater artifact found in ${artifactsDir}`);
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function packageWindowsInternalUpdate(args) {
  ensureRequired(args, ['artifacts-dir', 'output-dir', 'base-url', 'version']);

  const artifactsDir = path.resolve(args['artifacts-dir']);
  const outputDir = path.resolve(args['output-dir']);
  const channel = args.channel || 'stable';
  const version = normalizeVersion(args.version);
  const releaseTag = `v${version}`;
  const baseUrl = normalizeBaseUrl(args['base-url']);
  const notes = args.notes || '';
  const pubDate = args['pub-date'] || new Date().toISOString();
  const platform = args.platform || 'windows-x86_64';

  if (!fs.existsSync(artifactsDir)) {
    throw new Error(`Artifacts directory does not exist: ${artifactsDir}`);
  }

  const installerName = findUpdaterArtifact(artifactsDir);
  const signatureName = `${installerName}.sig`;
  const installerPath = path.join(artifactsDir, installerName);
  const signaturePath = path.join(artifactsDir, signatureName);

  if (!fs.existsSync(signaturePath)) {
    throw new Error(`Signature file not found for installer: ${signaturePath}`);
  }

  const channelDir = path.join(outputDir, channel);
  const versionDir = path.join(channelDir, releaseTag);
  copyFile(installerPath, path.join(versionDir, installerName));
  copyFile(signaturePath, path.join(versionDir, signatureName));

  const signature = fs.readFileSync(signaturePath, 'utf8').trim();
  const latestJson = {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      [platform]: {
        url: `${baseUrl}/${releaseTag}/${installerName}`,
        signature,
      },
    },
  };

  const manifest = {
    version,
    releaseTag,
    channel,
    generatedAt: pubDate,
    baseUrl,
    platform,
    files: [
      `${channel}/${releaseTag}/${installerName}`,
      `${channel}/${releaseTag}/${signatureName}`,
      `${channel}/latest.json`,
    ],
  };

  writeJson(path.join(channelDir, 'latest.json'), latestJson);
  writeJson(path.join(channelDir, 'release-manifest.json'), manifest);

  console.log(`Prepared Windows internal update bundle at ${channelDir}`);
  return { channelDir, version, platform, installerName, signatureName };
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  packageWindowsInternalUpdate(parseArgs(process.argv.slice(2)));
}
