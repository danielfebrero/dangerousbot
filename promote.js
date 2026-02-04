/**
 * promote.js - Promotion atomique de .build/ vers dist/
 *
 * Utilisé par `npm run promote` et `npm run build:deploy`
 * Déplace .build/ vers dist/ de manière atomique (rename, pas copy)
 */

const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '.build');
const distDir = path.join(__dirname, 'dist');
const distOldDir = path.join(__dirname, 'dist.old');

if (!fs.existsSync(buildDir)) {
  console.error('Error: .build/ does not exist. Run npm run build first.');
  process.exit(1);
}

// Remove stale dist.old if present
if (fs.existsSync(distOldDir)) {
  fs.rmSync(distOldDir, { recursive: true, force: true });
}

// Atomic swap: dist -> dist.old, .build -> dist
if (fs.existsSync(distDir)) {
  fs.renameSync(distDir, distOldDir);
}

try {
  fs.renameSync(buildDir, distDir);
} catch (err) {
  // If rename fails, try to restore dist from dist.old
  if (fs.existsSync(distOldDir)) {
    fs.renameSync(distOldDir, distDir);
  }
  console.error('Error promoting .build/ to dist/:', err.message);
  process.exit(1);
}

// Cleanup
if (fs.existsSync(distOldDir)) {
  fs.rmSync(distOldDir, { recursive: true, force: true });
}

console.log('Promoted .build/ -> dist/');
