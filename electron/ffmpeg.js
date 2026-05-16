'use strict';

const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

/**
 * Resolve the ffmpeg binary path.
 *
 * Priority:
 *  1. Packaged app  → binary bundled next to the Electron executable
 *  2. Dev mode      → local bin/mac/ffmpeg (if present)
 *  3. Fallback      → 'ffmpeg' from system PATH
 */
function getFfmpegPath() {
  if (app.isPackaged) {
    // electron-builder copies it to Contents/MacOS/ffmpeg
    return path.join(process.resourcesPath, '..', 'MacOS', 'ffmpeg');
  }

  // Development: check for a local binary first
  const localBin = path.join(__dirname, '..', 'bin', 'mac', 'ffmpeg');
  if (fs.existsSync(localBin)) return localBin;

  // Homebrew default locations
  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (fs.existsSync(p)) return p;
  }

  // Fall back to whatever is on PATH
  return 'ffmpeg';
}

module.exports = { getFfmpegPath };
