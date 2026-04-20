/**
 * Video Stability Assistant – Distribution Packaging Script
 *
 * Creates a distributable zip archive of the built extension for sideloading
 * and store submission.
 *
 * Usage
 * ─────
 *   node scripts/zip.js               → packages Chrome build (dist/)
 *   node scripts/zip.js --browser firefox  → packages Firefox build
 *
 * Output
 * ──────
 *   releases/
 *     video-stability-assistant-{version}-chrome.zip
 *     video-stability-assistant-{version}-firefox.zip
 *
 * @repository  github.com/bqtuhan/video-stability-assistant
 * @license     Apache-2.0
 */

'use strict';

const path     = require('path');
const fs       = require('fs');
const archiver = require('archiver');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const args    = process.argv.slice(2);
const BROWSER = args.includes('--browser') && args[args.indexOf('--browser') + 1] === 'firefox'
  ? 'firefox'
  : 'chrome';

const ROOT         = path.resolve(__dirname, '..');
const DIST_DIR     = path.resolve(ROOT, 'dist');
const RELEASES_DIR = path.resolve(ROOT, 'releases');

// ---------------------------------------------------------------------------
// Version Resolution
// ---------------------------------------------------------------------------

const manifestPath = path.resolve(DIST_DIR, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('[zip] ERROR: dist/manifest.json not found. Run the build first.');
  process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const outputName  = `video-stability-assistant-${version}-${BROWSER}.zip`;
const outputPath  = path.resolve(RELEASES_DIR, outputName);

// ---------------------------------------------------------------------------
// Archive Creation
// ---------------------------------------------------------------------------

fs.mkdirSync(RELEASES_DIR, { recursive: true });

const output  = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`[zip] ✅ ${outputName} (${kb} KB)`);
});

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('[zip] WARN:', err.message);
  } else {
    throw err;
  }
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Add entire dist/ directory contents (not the dist/ folder itself).
archive.directory(DIST_DIR, false);

archive.finalize().catch((err) => {
  console.error('[zip] Finalisation error:', err);
  process.exit(1);
});
