import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// File paths
const packageJsonPath = path.join(rootDir, 'package.json');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');

// Read current version
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const currentVersion = packageJson.version;

// Parse arguments
const args = process.argv.slice(2);
const type = args[0] || 'patch'; // patch, minor, major

// Calculate new version
let [major, minor, patch] = currentVersion.split('.').map(Number);

if (type === 'major') {
  major++;
  minor = 0;
  patch = 0;
} else if (type === 'minor') {
  minor++;
  patch = 0;
} else if (type === 'patch') {
  patch++;
} else {
  console.error('Invalid release type. Use: patch, minor, or major');
  process.exit(1);
}

const newVersion = `${major}.${minor}.${patch}`;
console.log(`🚀 Releasing version: ${currentVersion} -> ${newVersion}`);

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log('✅ Updated package.json');

// Update tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
tauriConf.version = newVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
console.log('✅ Updated tauri.conf.json');

// Update Cargo.toml
let cargoToml = fs.readFileSync(cargoTomlPath, 'utf-8');
// Replace version = "x.y.z" strictly under [package]
// We assume [package] is at the top or we look for the specific pattern
cargoToml = cargoToml.replace(/^version = ".*"/m, `version = "${newVersion}"`);
fs.writeFileSync(cargoTomlPath, cargoToml);
console.log('✅ Updated Cargo.toml');

// Git operations
try {
  console.log('📦 Committing changes...');
  execSync(`git add "${packageJsonPath}" "${tauriConfPath}" "${cargoTomlPath}"`, { stdio: 'inherit' });
  execSync(`git commit -m "chore: release v${newVersion}"`, { stdio: 'inherit' });
  
  console.log('🏷️ Creating tag...');
  execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
  
  console.log('\n✨ Release prepared successfully!');
  console.log(`\nTo publish, run:\n  git push && git push origin v${newVersion}`);
} catch (error) {
  console.error('❌ Failed to run git commands:', error.message);
  process.exit(1);
}
