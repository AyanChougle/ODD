'use strict';

/**
 * ODD Perfumes — Staff Administrator Account Creator
 * Creates or resets the initial administrator account securely.
 * Usage:
 *   $env:ODD_ADMIN_EMAIL="admin@oddperfume.com"
 *   $env:ODD_ADMIN_PASSWORD="SecurePassphraseHere"
 *   $env:ODD_ADMIN_NAME="Store Administrator"
 *   node scripts/create-admin.js
 */

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const DB_PATH = path.join(STORAGE_DIR, 'odd-perfume.sqlite');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Ensure DB schema exists
require('../server.js');

const db = new DatabaseSync(DB_PATH);

const email = (process.env.ODD_ADMIN_EMAIL || process.argv[2] || 'admin@oddperfume.com').trim().toLowerCase();
const password = (process.env.ODD_ADMIN_PASSWORD || process.argv[3] || 'admin123').trim();
const name = (process.env.ODD_ADMIN_NAME || process.argv[4] || 'Store Administrator').trim();

if (!email || !password) {
  console.error('Error: Email and password must be provided.');
  console.error('Example:');
  console.error('  $env:ODD_ADMIN_EMAIL="admin@oddperfume.com"');
  console.error('  $env:ODD_ADMIN_PASSWORD="YourSecurePassword"');
  console.error('  node scripts/create-admin.js');
  process.exit(1);
}

// Scrypt password hashing
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
const passwordHash = `${salt}:${hash}`;

try {
  const existing = db.prepare('SELECT id, email, role FROM staff WHERE email = ?').get(email);
  if (existing) {
    db.prepare(`
      UPDATE staff
      SET name = ?, password_hash = ?, role = 'admin', active = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, passwordHash, existing.id);
    console.log(`Successfully updated existing administrator account:`);
    console.log(`  Name : ${name}`);
    console.log(`  Email: ${email}`);
    console.log(`  Role : admin (Active)`);
  } else {
    db.prepare(`
      INSERT INTO staff (name, email, password_hash, role, active)
      VALUES (?, ?, ?, 'admin', 1)
    `).run(name, email, passwordHash);
    console.log(`Successfully created new administrator account:`);
    console.log(`  Name : ${name}`);
    console.log(`  Email: ${email}`);
    console.log(`  Role : admin (Active)`);
  }
} catch (err) {
  console.error('Failed to create/update admin user:', err.message);
  process.exit(1);
}
