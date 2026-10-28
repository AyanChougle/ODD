'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dbPath = path.join(__dirname, '..', 'storage', 'odd-perfume.sqlite');

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

// Create the active admin and initialize database cleanly via create-admin.js
execSync('node scripts/create-admin.js "admin@oddperfume.com" "ODDAdmin2026!Secure" "admin" "Administrator"', {
  stdio: 'inherit'
});

console.log('Database cleanly reset to pristine baseline state.');
