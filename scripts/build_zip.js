// scripts/build_zip.js
// Packs the clean production extension into release/twitter-ai-reply-v1.4.0.zip

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.resolve(rootDir, 'release');
if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const version = manifest.version;
const zipName = `twitter-ai-reply-v${version}.zip`;
const zipPath = path.join(releaseDir, zipName);

console.log(`Packaging extension version ${version} into release/${zipName}...`);

// Use tar or powershell Compress-Archive
const stagingDir = path.join(releaseDir, `staging_v${version}`);
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagingDir, { recursive: true });

const filesToCopy = [
  'manifest.json',
  'background.js',
  'content_gemini.js',
  'content_twitter.css',
  'content_twitter.js',
  'offscreen.html',
  'offscreen.js'
];

filesToCopy.forEach(f => {
  fs.copyFileSync(path.join(rootDir, f), path.join(stagingDir, f));
});

// Copy directories
['icons', 'popup'].forEach(dir => {
  const src = path.join(rootDir, dir);
  const dst = path.join(stagingDir, dir);
  fs.cpSync(src, dst, { recursive: true });
});

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Compress staging directory
execSync(`powershell -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force"`);

// Clean staging directory
fs.rmSync(stagingDir, { recursive: true, force: true });

const stats = fs.statSync(zipPath);
console.log(`✓ Successfully created ${zipName} (${stats.size} bytes) in release/`);

