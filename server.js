'use strict';

/**
 * ODD Perfumes — Authoritative Production Server
 * Native Node.js HTTP + Built-in SQLite (Node 22.5+)
 * Enterprise E-Commerce Engine, Inventory Synchronization, Razorpay & Staff RBAC
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Automatically load .env file if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// --- Configuration ---
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const NODE_ENV = process.env.NODE_ENV || 'production';
const ROOT_DIR = __dirname;
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
const DB_PATH = path.join(STORAGE_DIR, 'odd-perfume.sqlite');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// --- Razorpay Environment Configuration ---
let RAZORPAY_CONFIG = {
  keyId: process.env.RAZORPAY_KEY_ID || 'rzp_live_Ti8AffHarb3tai',
  keySecret: process.env.RAZORPAY_KEY_SECRET || 'X4Ws6I0iovvSrTYh18i1nNjl',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  brandName: 'ODD Perfume',
  themeColor: '#E86B32',
  env: 'live',
  enabled: true
};

// --- Database Initialization ---
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for high-performance concurrent writes
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      price INTEGER NOT NULL DEFAULT 899,
      original_price INTEGER NOT NULL DEFAULT 1199,
      stock INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      tagline TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      product_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      stock_after INTEGER NOT NULL,
      reason TEXT NOT NULL,
      staff_name TEXT DEFAULT 'System',
      order_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      discount_percent INTEGER NOT NULL,
      min_spend INTEGER NOT NULL DEFAULT 0,
      max_discount INTEGER NOT NULL DEFAULT 0,
      max_uses INTEGER NOT NULL DEFAULT 0,
      used_count INTEGER NOT NULL DEFAULT 0,
      per_user_limit INTEGER NOT NULL DEFAULT 1,
      start_date TEXT,
      expiry_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS coupon_usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_code TEXT NOT NULL COLLATE NOCASE,
      order_id TEXT NOT NULL,
      customer_email TEXT NOT NULL COLLATE NOCASE,
      customer_phone TEXT DEFAULT '',
      discount_amount INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      tracking_token TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL COLLATE NOCASE,
      customer_phone TEXT NOT NULL,
      shipping_address TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      coupon_code TEXT,
      shipping_fee INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'Pending',
      status TEXT NOT NULL DEFAULT 'Confirmed',
      gateway TEXT NOT NULL,
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      stock_deducted INTEGER NOT NULL DEFAULT 1,
      dispatched_at TEXT,
      delivered_at TEXT,
      cancelled_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      line_total INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT 'Home',
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line TEXT NOT NULL,
      city TEXT NOT NULL,
      pincode TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'warehouse',
      active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_type TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      csrf_token TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial TEXT NOT NULL UNIQUE,
      sku TEXT NOT NULL,
      product_name TEXT NOT NULL,
      lot_number TEXT NOT NULL,
      mfg_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      mrp INTEGER NOT NULL DEFAULT 899,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      sku TEXT NOT NULL,
      item_name TEXT NOT NULL,
      mode TEXT NOT NULL,
      delta INTEGER NOT NULL,
      stock_after TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key_name TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  try {
    db.exec(`
      ALTER TABLE orders ADD COLUMN courier_name TEXT;
      ALTER TABLE orders ADD COLUMN tracking_number TEXT;
      ALTER TABLE orders ADD COLUMN tracking_url TEXT;
      ALTER TABLE orders ADD COLUMN label_url TEXT;
    `);
  } catch (e) {}

  // Seed baseline products if table is empty
  const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (prodCount === 0) {
    const insertProd = db.prepare(`
      INSERT INTO products (id, sku, name, price, original_price, stock, active, tagline, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // CRITICAL: First Move strictly starts with 0 units as documented
    insertProd.run('phantom', 'ODD-PH-001', 'ODD Phantom', 899, 1199, 240, 1, 'Unseen. Unforgotten. Dominant.', 'Oud · Amber · Smoky Woods');
    insertProd.run('lucid', 'ODD-LC-003', 'ODD Lucid', 899, 1199, 180, 1, 'Clear Mind. Sharp Presence.', 'Citrus · Black Tea · Clean Woods');
    insertProd.run('first-move', 'ODD-FM-002', 'ODD First Move', 899, 1199, 0, 1, 'Start First. Stay Ahead.', 'Pineapple · Woods · Smoky Musk');

    const insertMov = db.prepare(`
      INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertMov.run('ODD-PH-001', 'phantom', 240, 240, 'Initial Mumbai stock receipt', 'System');
    insertMov.run('ODD-LC-003', 'lucid', 180, 180, 'Initial Mumbai stock receipt', 'System');
    insertMov.run('ODD-FM-002', 'first-move', 0, 0, 'Documented zero stock baseline', 'System');
  }

  // Seed baseline coupons if table is empty
  const couponCount = db.prepare('SELECT COUNT(*) as count FROM coupons').get().count;
  if (couponCount === 0) {
    const insertCoupon = db.prepare(`
      INSERT INTO coupons (code, discount_percent, min_spend, max_discount, max_uses, per_user_limit, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertCoupon.run('LAUNCH20', 20, 0, 500, 500, 1, 1);
    insertCoupon.run('ODD10', 10, 0, 300, 1000, 1, 1);
    insertCoupon.run('WELCOME15', 15, 0, 400, 1000, 1, 1);
    insertCoupon.run('ODDSPOT10', 10, 0, 300, 1000, 1, 1);
  }

  // Seed default settings if missing
  const setSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key_name, value_json) VALUES (?, ?)
  `);
  setSetting.run('shipping', JSON.stringify({ standardRate: 50, freeThreshold: 0, enabled: true }));
  setSetting.run('envia', JSON.stringify({
    enabled: true,
    env: 'live',
    apiKey: process.env.ENVIA_API_KEY || '87e6fa5254254329cc8f21c4de06ce0dd3546197e4b55664bc3a25efcbf87236',
    origin: {
      name: 'ODD Perfumes Warehouse',
      phone: '9876543210',
      street: 'Unit 4, Industrial Area',
      city: 'Mumbai',
      state: 'MH',
      country: 'IN',
      postalCode: '400001'
    },
    carrier: 'all'
  }));
  setSetting.run('banner', JSON.stringify({
    active: true,
    code: 'LAUNCH20',
    text: "WE'RE LIVE. Take 20% OFF your first order with code LAUNCH20",
    timerEnds: '2026-11-30T23:59:59Z'
  }));
  setSetting.run('razorpay', JSON.stringify({
    enabled: true,
    env: 'live',
    keyId: RAZORPAY_CONFIG.keyId,
    brandName: 'ODD Perfume',
    themeColor: '#E86B32',
    simulate: false
  }));
}

initDatabase();

// --- Cryptographic Security Helpers ---
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

function generateSecureToken(len = 32) {
  return crypto.randomBytes(len).toString('hex');
}

// --- Login Throttling (In-memory IP attempts cache) ---
const loginAttempts = new Map();
function checkLoginThrottling(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return true;
  if (now > entry.resetTime) {
    loginAttempts.delete(ip);
    return true;
  }
  return entry.count < 5;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, resetTime: now + 15 * 60 * 1000 };
  entry.count += 1;
  loginAttempts.set(ip, entry);
}

function clearLoginFailures(ip) {
  loginAttempts.delete(ip);
}

// --- Cookie Parser & Serializer ---
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      const val = decodeURIComponent(parts.join('='));
      list[key] = val;
    });
  }
  return list;
}

function setCookie(res, name, value, maxAgeSeconds = 7 * 86400) {
  const isSecure = NODE_ENV === 'production';
  const cookieStr = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookieStr);
}

function clearCookie(res, name) {
  const isSecure = NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`);
}

// --- Session Resolution & RBAC ---
function getStaffSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies['odd_admin_session'] || (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
  if (!sessionId) return null;

  const session = db.prepare(`
    SELECT s.*, st.name, st.email, st.role, st.active
    FROM sessions s
    JOIN staff st ON s.user_id = st.id
    WHERE s.id = ? AND s.user_type = 'staff' AND datetime(s.expires_at) > datetime('now')
  `).get(sessionId);

  if (!session || !session.active) return null;
  return session;
}

function getCustomerSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies['odd_customer_session'];
  if (!sessionId) return null;

  const session = db.prepare(`
    SELECT s.*, c.name, c.email, c.phone
    FROM sessions s
    JOIN customers c ON s.user_id = c.id
    WHERE s.id = ? AND s.user_type = 'customer' AND datetime(s.expires_at) > datetime('now')
  `).get(sessionId);

  return session || null;
}

const ROLE_PERMISSIONS = {
  admin: ['*'],
  warehouse: ['inventory', 'scans', 'barcodes', 'shipping'],
  orders: ['orders', 'shipping'],
  finance: ['payments', 'orders'],
  marketing: ['coupons', 'banner']
};

function requireStaffAuth(req, res, requiredPerm = null) {
  const session = getStaffSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Authentication required. Please sign in to staff portal.' });
    return null;
  }

  if (requiredPerm) {
    const role = session.role;
    const perms = ROLE_PERMISSIONS[role] || [];
    if (!perms.includes('*') && !perms.includes(requiredPerm)) {
      sendJson(res, 403, { error: `Forbidden: Staff role '${role}' cannot access ${requiredPerm}.` });
      return null;
    }
  }

  // Validate CSRF token on state-changing requests
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    const csrfHeader = req.headers['x-csrf-token'];
    if (!csrfHeader || csrfHeader !== session.csrf_token) {
      sendJson(res, 403, { error: 'Invalid or missing CSRF token.' });
      return null;
    }
  }

  return session;
}

// --- Body Parsing Helper ---
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) { // 2MB max
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

// --- Static File MIME Types ---
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.glb': 'model/gltf-binary',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8'
};

// --- HTTP Request Router ---
const server = http.createServer(async (req, res) => {
  const clientIp = req.socket.remoteAddress || '127.0.0.1';
  const urlObj = new URL(req.url, `http://${req.headers.host || HOST}`);
  const pathname = urlObj.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS if needed in testing
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
      'Access-Control-Allow-Credentials': 'true'
    });
    return res.end();
  }

  try {
    /* ========================================================================
       API ROUTES (/api/*)
       ======================================================================== */
    if (pathname.startsWith('/api/')) {

      // --- 1. Staff Authentication (/api/auth) ---
      if (pathname === '/api/auth/login' && method === 'POST') {
        if (!checkLoginThrottling(clientIp)) {
          return sendJson(res, 429, { error: 'Too many failed login attempts. Please wait 15 minutes.' });
        }

        const body = await parseJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!email || !password) {
          return sendJson(res, 400, { error: 'Please enter both email and password.' });
        }

        const staff = db.prepare('SELECT * FROM staff WHERE email = ?').get(email);
        if (!staff || !verifyPassword(password, staff.password_hash)) {
          recordLoginFailure(clientIp);
          return sendJson(res, 401, { error: 'Invalid email or password.' });
        }

        if (!staff.active) {
          return sendJson(res, 403, { error: 'Account disabled. Please contact your ODD administrator.' });
        }

        clearLoginFailures(clientIp);

        // Session creation & rotation
        const sessionId = generateSecureToken(32);
        const csrfToken = generateSecureToken(24);
        const expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

        db.prepare(`
          INSERT INTO sessions (id, user_type, user_id, role, csrf_token, ip_address, user_agent, expires_at)
          VALUES (?, 'staff', ?, ?, ?, ?, ?, ?)
        `).run(sessionId, String(staff.id), staff.role, csrfToken, clientIp, req.headers['user-agent'] || '', expiresAt);

        db.prepare("UPDATE staff SET last_login = datetime('now') WHERE id = ?").run(staff.id);

        setCookie(res, 'odd_admin_session', sessionId, 7 * 86400);

        return sendJson(res, 200, {
          authenticated: true,
          user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
          csrfToken: csrfToken,
          permissions: ROLE_PERMISSIONS[staff.role] || []
        });
      }

      if (pathname === '/api/auth/logout' && method === 'POST') {
        const cookies = parseCookies(req);
        const sessionId = cookies['odd_admin_session'];
        if (sessionId) {
          db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
        }
        clearCookie(res, 'odd_admin_session');
        return sendJson(res, 200, { success: true, message: 'Logged out successfully.' });
      }

      if (pathname === '/api/auth/session' && method === 'GET') {
        const session = getStaffSession(req);
        if (!session) {
          return sendJson(res, 200, { authenticated: false });
        }
        return sendJson(res, 200, {
          authenticated: true,
          user: { id: session.user_id, name: session.name, email: session.email, role: session.role },
          csrfToken: session.csrf_token,
          permissions: ROLE_PERMISSIONS[session.role] || []
        });
      }

      // --- 2. Products & Catalogue (/api/products) ---
      if (pathname === '/api/products' && method === 'GET') {
        const products = db.prepare('SELECT id, sku, name, price, original_price as originalPrice, stock, active, tagline, notes FROM products WHERE active = 1').all();
        return sendJson(res, 200, { products });
      }

      // --- 3. Inventory Management (/api/inventory) ---
      if (pathname === '/api/inventory' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'inventory');
        if (!session) return;

        const inventory = db.prepare('SELECT sku, name, stock, price, updated_at as updated FROM products ORDER BY id').all();
        return sendJson(res, 200, { inventory });
      }

      if (pathname.startsWith('/api/inventory/') && (method === 'PATCH' || method === 'PUT')) {
        const session = requireStaffAuth(req, res, 'inventory');
        if (!session) return;

        const sku = decodeURIComponent(pathname.replace('/api/inventory/', '')).trim();
        const body = await parseJsonBody(req);
        const product = db.prepare('SELECT * FROM products WHERE sku = ?').get(sku);

        if (!product) {
          return sendJson(res, 404, { error: `Product with SKU '${sku}' not found.` });
        }

        let newStock = product.stock;
        let newPrice = product.price;
        let delta = 0;

        if (body.price !== undefined) {
          const p = Number(body.price);
          if (isNaN(p) || p <= 0) return sendJson(res, 400, { error: 'Price must be greater than zero.' });
          newPrice = p;
        }

        // Per business rule: stock is managed authoritatively by QR / barcode scanner.
        // Direct inventory endpoint updates price. If stock was explicitly supplied with admin flag, allow it.
        if (body.stock !== undefined && body.allow_manual_stock && session.role === 'admin') {
          const val = Number(body.stock);
          if (isNaN(val) || val < 0) return sendJson(res, 400, { error: 'Stock must be a non-negative integer.' });
          delta = val - product.stock;
          newStock = val;
        }

        db.exec('BEGIN IMMEDIATE TRANSACTION;');
        try {
          db.prepare("UPDATE products SET stock = ?, price = ?, updated_at = datetime('now') WHERE sku = ?").run(newStock, newPrice, sku);

          if (delta !== 0) {
            db.prepare(`
              INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(sku, product.id, delta, newStock, body.reason || 'Manual staff adjustment', session.name);
          }

          db.exec('COMMIT;');
        } catch (err) {
          db.exec('ROLLBACK;');
          throw err;
        }

        return sendJson(res, 200, {
          success: true,
          sku,
          stock: newStock,
          price: newPrice,
          item: {
            sku,
            name: product.name,
            stock: newStock,
            price: newPrice,
            updated: new Date().toISOString()
          }
        });
      }

      // --- 4. Coupons Management (/api/coupons) ---
      if (pathname === '/api/coupons' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'coupons');
        if (!session) return;

        const coupons = db.prepare(`
          SELECT id, code, discount_percent as discount, min_spend as minSpend, max_discount as maxDiscount,
                 max_uses as maxUses, used_count as usedCount, per_user_limit as perUserLimit,
                 active, created_at as createdAt
          FROM coupons
          ORDER BY id DESC
        `).all();

        return sendJson(res, 200, { coupons });
      }

      if (pathname === '/api/coupons' && method === 'POST') {
        const session = requireStaffAuth(req, res, 'coupons');
        if (!session) return;

        const body = await parseJsonBody(req);
        const code = String(body.code || '').trim().toUpperCase();
        const discount = Number(body.discount || body.discount_percent);

        if (!code || isNaN(discount) || discount <= 0 || discount > 100) {
          return sendJson(res, 400, { error: 'Valid coupon code and discount percentage (1–100) are required.' });
        }

        try {
          const insert = db.prepare(`
            INSERT INTO coupons (code, discount_percent, min_spend, max_discount, max_uses, per_user_limit, active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          insert.run(code, discount, Number(body.minSpend) || 0, Number(body.maxDiscount) || 0, Number(body.maxUses) || 0, Number(body.perUserLimit) || 1, body.active !== false ? 1 : 0);
          return sendJson(res, 201, { success: true, message: `Coupon ${code} created.` });
        } catch (err) {
          if (err.message.includes('UNIQUE')) {
            return sendJson(res, 400, { error: `Coupon ${code} already exists.` });
          }
          throw err;
        }
      }

      if (pathname.startsWith('/api/coupons/') && method === 'PATCH') {
        const session = requireStaffAuth(req, res, 'coupons');
        if (!session) return;

        const target = decodeURIComponent(pathname.replace('/api/coupons/', '')).trim();
        const body = await parseJsonBody(req);

        if (body.active !== undefined) {
          db.prepare('UPDATE coupons SET active = ? WHERE id = ? OR code = ? COLLATE NOCASE').run(body.active ? 1 : 0, target, target);
        }
        return sendJson(res, 200, { success: true });
      }

      if (pathname.startsWith('/api/coupons/') && method === 'DELETE') {
        const session = requireStaffAuth(req, res, 'coupons');
        if (!session) return;

        const target = decodeURIComponent(pathname.replace('/api/coupons/', '')).trim();
        db.prepare('DELETE FROM coupons WHERE id = ? OR code = ? COLLATE NOCASE').run(target, target);
        return sendJson(res, 200, { success: true });
      }

      // Coupon redemptions log
      if (pathname === '/api/coupons/usages' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'coupons:read');
        if (!session) return;
        const usages = db.prepare(`
          SELECT coupon_code as coupon, customer_email as email, customer_phone as phone,
                 order_id as orderId, discount_amount as discount, used_at as date
          FROM coupon_usages ORDER BY used_at DESC LIMIT 100
        `).all();
        return sendJson(res, 200, { usages });
      }

      // Public Coupon Validation
      if (pathname === '/api/coupons/validate' && method === 'POST') {
        const body = await parseJsonBody(req);
        const code = String(body.code || '').trim().toUpperCase();
        const subtotal = Number(body.subtotal) || 0;
        const email = String(body.email || '').trim().toLowerCase();

        const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(code);
        if (!coupon) {
          return sendJson(res, 400, { valid: false, error: 'Invalid or inactive promo code.' });
        }

        if (coupon.min_spend > 0 && subtotal < coupon.min_spend) {
          return sendJson(res, 400, { valid: false, error: `Minimum order value of ₹${coupon.min_spend} required for code ${code}.` });
        }

        if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
          return sendJson(res, 400, { valid: false, error: `Promo code ${code} has reached its maximum global redemptions.` });
        }

        if (email && coupon.per_user_limit > 0) {
          const userUsages = db.prepare('SELECT COUNT(*) as count FROM coupon_usages WHERE coupon_code = ? AND customer_email = ?').get(code, email).count;
          if (userUsages >= coupon.per_user_limit) {
            return sendJson(res, 400, { valid: false, error: `You have already redeemed code ${code}.` });
          }
        }

        let discount = Math.round(subtotal * (coupon.discount_percent / 100));
        if (coupon.max_discount > 0 && discount > coupon.max_discount) {
          discount = coupon.max_discount;
        }

        return sendJson(res, 200, {
          valid: true,
          code: coupon.code,
          discountPercent: coupon.discount_percent,
          discountAmount: discount
        });
      }

      // --- 5. Checkout Calculation (/api/checkout/calculate) ---
      if (pathname === '/api/checkout/calculate' && method === 'POST') {
        const body = await parseJsonBody(req);
        const items = Array.isArray(body.items) ? body.items : [];
        const couponCode = String(body.couponCode || '').trim().toUpperCase();
        const customerEmail = String(body.email || '').trim().toLowerCase();

        let subtotal = 0;
        const validatedItems = [];

        for (const item of items) {
          const sku = String(item.sku || item.id || '').trim();
          const qty = Math.max(1, parseInt(item.qty || item.quantity) || 1);
          const product = db.prepare('SELECT * FROM products WHERE (sku = ? OR id = ?) AND active = 1').get(sku, sku);

          if (!product) {
            return sendJson(res, 400, { error: `Product '${sku}' is invalid or deactivated.` });
          }

          if (product.stock <= 0) {
            return sendJson(res, 400, { error: `${product.name} is currently out of stock.` });
          }

          if (qty > product.stock) {
            return sendJson(res, 400, { error: `Only ${product.stock} units available for ${product.name}.` });
          }

          const lineTotal = product.price * qty;
          subtotal += lineTotal;
          validatedItems.push({
            id: product.id,
            sku: product.sku,
            name: product.name,
            price: product.price,
            quantity: qty,
            lineTotal
          });
        }

        // Shipping settings
        const shipSetting = JSON.parse(db.prepare("SELECT value_json FROM settings WHERE key_name = 'shipping'").get()?.value_json || '{}');
        let shippingFee = shipSetting.enabled !== false ? (Number(shipSetting.standardRate) || 50) : 0;
        if (shipSetting.freeThreshold > 0 && subtotal >= shipSetting.freeThreshold) {
          shippingFee = 0;
        }

        // Coupon discount
        let discountAmount = 0;
        if (couponCode) {
          const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(couponCode);
          if (coupon) {
            let eligible = true;
            if (coupon.min_spend > 0 && subtotal < coupon.min_spend) eligible = false;
            if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) eligible = false;
            if (customerEmail && coupon.per_user_limit > 0) {
              const uCount = db.prepare('SELECT COUNT(*) as count FROM coupon_usages WHERE coupon_code = ? AND customer_email = ?').get(couponCode, customerEmail).count;
              if (uCount >= coupon.per_user_limit) eligible = false;
            }
            if (eligible) {
              discountAmount = Math.round(subtotal * (coupon.discount_percent / 100));
              if (coupon.max_discount > 0 && discountAmount > coupon.max_discount) {
                discountAmount = coupon.max_discount;
              }
            }
          }
        }

        const totalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

        return sendJson(res, 200, {
          subtotal,
          discountAmount,
          couponCode: discountAmount > 0 ? couponCode : null,
          shippingFee,
          totalAmount,
          items: validatedItems
        });
      }

      // --- 6. Orders (/api/orders) ---
      if (pathname === '/api/orders' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { customer, email, phone, address, items, paymentMethod, couponCode } = body;

        if (!customer || !email || !phone || !address || !Array.isArray(items) || !items.length) {
          return sendJson(res, 400, { error: 'Please provide full name, email, phone, delivery address, and at least one item.' });
        }

        db.exec('BEGIN IMMEDIATE TRANSACTION;');
        try {
          // Generate clean sequential order ID: ODD-00001, ODD-00002, etc.
          const existingOrders = db.prepare("SELECT id FROM orders WHERE id LIKE 'ODD-%'").all();
          let maxSeq = 0;
          for (const row of existingOrders) {
            const m = String(row.id).match(/^ODD-(\d{1,5})$/);
            if (m) {
              const num = parseInt(m[1], 10);
              if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
          }
          let nextNum = Math.max(1, maxSeq + 1);
          let orderId = 'ODD-' + String(nextNum).padStart(5, '0');

          while (db.prepare('SELECT COUNT(*) as c FROM orders WHERE id = ?').get(orderId).c > 0) {
            nextNum++;
            orderId = 'ODD-' + String(nextNum).padStart(5, '0');
          }
          const trackingToken = generateSecureToken(24);
          const isOnline = String(paymentMethod).toLowerCase().includes('razorpay');
          let subtotal = 0;
          const orderItemsData = [];

          for (const item of items) {
            const sku = String(item.sku || item.id || '').trim();
            const qty = Math.max(1, parseInt(item.qty || item.quantity) || 1);
            const product = db.prepare('SELECT * FROM products WHERE (sku = ? OR id = ?) AND active = 1').get(sku, sku);

            if (!product) {
              throw new Error(`Product '${sku}' is not available.`);
            }

            if (product.stock < qty) {
              throw new Error(product.stock === 0 ? `${product.name} is currently out of stock.` : `Insufficient stock for ${product.name}. Available: ${product.stock}`);
            }

            // Atomic stock deduction
            db.prepare("UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?").run(qty, product.id);

            const newStock = product.stock - qty;
            db.prepare(`
              INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, order_id, staff_name)
              VALUES (?, ?, ?, ?, 'Customer Order Placement', ?, 'System')
            `).run(product.sku, product.id, -qty, newStock, orderId);

            const lineTotal = product.price * qty;
            subtotal += lineTotal;
            orderItemsData.push({
              product_id: product.id,
              sku: product.sku,
              name: product.name,
              price: product.price,
              quantity: qty,
              line_total: lineTotal
            });
          }

          // Shipping fee
          const shipSetting = JSON.parse(db.prepare("SELECT value_json FROM settings WHERE key_name = 'shipping'").get()?.value_json || '{}');
          let shippingFee = shipSetting.enabled !== false ? (Number(shipSetting.standardRate) || 50) : 0;
          if (shipSetting.freeThreshold > 0 && subtotal >= shipSetting.freeThreshold) shippingFee = 0;

          // Coupon
          let discountAmount = 0;
          let validCoupon = null;
          if (couponCode) {
            const c = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(couponCode.toUpperCase());
            if (c) {
              discountAmount = Math.round(subtotal * (c.discount_percent / 100));
              if (c.max_discount > 0 && discountAmount > c.max_discount) discountAmount = c.max_discount;
              validCoupon = c.code;

              db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(c.id);
              db.prepare(`
                INSERT INTO coupon_usages (coupon_code, order_id, customer_email, customer_phone, discount_amount)
                VALUES (?, ?, ?, ?, ?)
              `).run(c.code, orderId, email.toLowerCase(), phone, discountAmount);
            }
          }

          const totalAmount = Math.max(0, subtotal - discountAmount + shippingFee);

          // Insert order
          db.prepare(`
            INSERT INTO orders (
              id, tracking_token, customer_name, customer_email, customer_phone, shipping_address,
              subtotal, discount_amount, coupon_code, shipping_fee, total_amount,
              payment_method, payment_status, status, gateway, razorpay_order_id, razorpay_payment_id, stock_deducted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?, ?, ?, 1)
          `).run(
            orderId, trackingToken, customer.trim(), email.trim().toLowerCase(), phone.trim(), address.trim(),
            subtotal, discountAmount, validCoupon, shippingFee, totalAmount,
            paymentMethod, isOnline ? 'Pending' : 'Pending', isOnline ? 'Razorpay Live' : 'Cash on Delivery (COD)',
            body.razorpayOrderId || null, body.razorpayPaymentId || null
          );

          // Insert items
          const insertItem = db.prepare(`
            INSERT INTO order_items (order_id, product_id, sku, name, price, quantity, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          for (const it of orderItemsData) {
            insertItem.run(orderId, it.product_id, it.sku, it.name, it.price, it.quantity, it.line_total);
          }

          db.exec('COMMIT;');

          // Optional Envia Auto-Dispatch
          try {
            const enviaSetting = JSON.parse(db.prepare("SELECT value_json FROM settings WHERE key_name = 'envia'").get()?.value_json || '{}');
            if (enviaSetting.autoDispatch) {
              dispatchOrderWithEnvia(orderId).catch(() => {});
            }
          } catch (_) {}

          return sendJson(res, 201, {
            success: true,
            orderId,
            trackingToken,
            totalAmount,
            status: 'Confirmed',
            paymentStatus: isOnline ? 'Pending' : 'Pending'
          });
        } catch (err) {
          db.exec('ROLLBACK;');
          return sendJson(res, 400, { error: err.message || 'Order creation failed.' });
        }
      }

      if (pathname === '/api/orders' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'orders');
        if (!session) return;

        const orders = db.prepare(`
          SELECT id, customer_name as customer, customer_email as email, customer_phone as phone,
                 shipping_address as address, subtotal, discount_amount as discount, coupon_code as coupon,
                 shipping_fee as shipping, total_amount as total, total_amount as amount,
                 payment_method as paymentMethod, payment_status as paymentStatus, status, gateway,
                 courier_name as courier, tracking_number as trackingNumber, tracking_url as trackingUrl, label_url as labelUrl,
                 razorpay_payment_id as razorpayPaymentId, created_at as date
          FROM orders
          ORDER BY datetime(created_at) DESC
        `).all();

        const getItems = db.prepare('SELECT product_id as id, sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?');
        for (const order of orders) {
          order.items = getItems.all(order.id);
        }

        return sendJson(res, 200, { orders });
      }

      if (pathname.startsWith('/api/orders/') && method === 'PATCH') {
        const session = requireStaffAuth(req, res, 'orders');
        if (!session) return;

        const orderId = decodeURIComponent(pathname.replace('/api/orders/', '')).trim();
        const body = await parseJsonBody(req);
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

        if (!order) {
          return sendJson(res, 404, { error: `Order ${orderId} not found.` });
        }

        const newStatus = body.status;
        const validStatuses = ['Confirmed', 'Processing', 'Packed', 'Dispatched', 'Delivered', 'Cancelled'];

        if (newStatus && !validStatuses.includes(newStatus)) {
          return sendJson(res, 400, { error: `Invalid status: ${newStatus}` });
        }

        db.exec('BEGIN IMMEDIATE TRANSACTION;');
        try {
          // If cancelling an order where stock was deducted, restore stock atomically
          if (newStatus === 'Cancelled' && order.status !== 'Cancelled' && order.stock_deducted) {
            const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
            for (const item of items) {
              db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?").run(item.quantity, item.product_id);
              const p = db.prepare('SELECT stock, sku FROM products WHERE id = ?').get(item.product_id);
              db.prepare(`
                INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, order_id, staff_name)
                VALUES (?, ?, ?, ?, 'Order Cancellation Stock Restored', ?, ?)
              `).run(p.sku, item.product_id, item.quantity, p.stock, orderId, session.name);
            }
            db.prepare("UPDATE orders SET status = 'Cancelled', stock_deducted = 0, cancelled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(orderId);
          } else if (newStatus === 'Dispatched') {
            db.prepare("UPDATE orders SET status = 'Dispatched', dispatched_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(orderId);
          } else if (newStatus === 'Delivered') {
            db.prepare("UPDATE orders SET status = 'Delivered', payment_status = 'Paid', delivered_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(orderId);
          } else if (newStatus) {
            db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, orderId);
          }

          db.exec('COMMIT;');
        } catch (err) {
          db.exec('ROLLBACK;');
          throw err;
        }

        const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        return sendJson(res, 200, { success: true, order: updatedOrder });
      }

      // Public Secure Tracking
      if (pathname === '/api/orders/track' && method === 'GET') {
        const orderId = (urlObj.searchParams.get('order') || '').trim().toUpperCase();
        const phone = (urlObj.searchParams.get('phone') || '').trim();
        const token = (urlObj.searchParams.get('token') || '').trim();

        let order = null;
        if (token) {
          order = db.prepare('SELECT * FROM orders WHERE tracking_token = ?').get(token);
        } else if (orderId && phone) {
          const cleanPhone = phone.replace(/[^0-9]/g, '');
          order = db.prepare("SELECT * FROM orders WHERE id = ? AND replace(replace(customer_phone, '+91', ''), ' ', '') LIKE ?").get(orderId, `%${cleanPhone.slice(-10)}%`);
        } else if (orderId) {
          // Public preview by order ID without leaking customer private phone/address
          order = db.prepare('SELECT id, status, subtotal, discount_amount, coupon_code, shipping_fee, total_amount, created_at FROM orders WHERE id = ?').get(orderId);
        }

        if (!order) {
          return sendJson(res, 404, { error: 'Order not found. Please verify your Order Reference and checkout mobile number.' });
        }

        const items = db.prepare('SELECT sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?').all(order.id);

        return sendJson(res, 200, {
          id: order.id,
          status: order.status,
          subtotal: order.subtotal,
          discount: order.discount_amount,
          coupon: order.coupon_code,
          shipping: order.shipping_fee,
          total: order.total_amount,
          amount: order.total_amount,
          courier: order.courier_name || null,
          trackingNumber: order.tracking_number || null,
          trackingUrl: order.tracking_url || null,
          labelUrl: order.label_url || null,
          date: order.created_at,
          items: items
        });
      }

      // --- 7. Razorpay Payments Integration (/api/payments) ---
      if (pathname === '/api/payments/create-order' && method === 'POST') {
        const body = await parseJsonBody(req);
        const amount = Math.round(Number(body.amount) || 0);

        if (amount <= 0) {
          return sendJson(res, 400, { error: 'Invalid order amount.' });
        }

        if (!RAZORPAY_CONFIG.keyId || !RAZORPAY_CONFIG.keySecret) {
          return sendJson(res, 503, {
            error: 'Razorpay gateway is not configured on this server. Please choose Cash on Delivery (COD).'
          });
        }

        // Call Razorpay API: POST https://api.razorpay.com/v1/orders
        try {
          const authHeader = 'Basic ' + Buffer.from(`${RAZORPAY_CONFIG.keyId}:${RAZORPAY_CONFIG.keySecret}`).toString('base64');
          const rzpReqData = JSON.stringify({
            amount: amount * 100, // paise
            currency: 'INR',
            receipt: body.receipt || ('rcpt_' + Date.now()),
            payment_capture: 1
          });

          const rzpResponse = await new Promise((resolve, reject) => {
            const https = require('node:https');
            const rReq = https.request('https://api.razorpay.com/v1/orders', {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(rzpReqData)
              }
            }, rRes => {
              let rBody = '';
              rRes.on('data', c => rBody += c);
              rRes.on('end', () => resolve({ statusCode: rRes.statusCode, body: rBody }));
            });
            rReq.on('error', reject);
            rReq.write(rzpReqData);
            rReq.end();
          });

          const rzpParsed = JSON.parse(rzpResponse.body);
          if (rzpResponse.statusCode >= 400) {
            return sendJson(res, 400, { error: rzpParsed.error?.description || 'Failed to create Razorpay order.' });
          }

          return sendJson(res, 200, {
            orderId: rzpParsed.id,
            amount: rzpParsed.amount,
            currency: rzpParsed.currency,
            keyId: RAZORPAY_CONFIG.keyId
          });
        } catch (err) {
          console.error('Razorpay API request error:', err);
          return sendJson(res, 502, { error: 'Failed to communicate with Razorpay gateway.' });
        }
      }

      if (pathname === '/api/payments/verify' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
          return sendJson(res, 400, { error: 'Missing payment signature components.' });
        }

        const expectedSig = crypto
          .createHmac('sha256', RAZORPAY_CONFIG.keySecret)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest('hex');

        if (expectedSig !== razorpay_signature) {
          return sendJson(res, 400, { verified: false, error: 'Cryptographic signature verification failed.' });
        }

        // Signature verified! Update order status
        if (order_id) {
          db.prepare(`
            UPDATE orders
            SET payment_status = 'Paid', razorpay_order_id = ?, razorpay_payment_id = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(razorpay_order_id, razorpay_payment_id, order_id);
        }

        return sendJson(res, 200, { verified: true, paymentId: razorpay_payment_id });
      }

      // Payments Summary Dashboard
      if (pathname === '/api/payments/summary' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'payments');
        if (!session) return;

        const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
        const confirmedRevenue = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as s, COUNT(*) as c FROM orders WHERE payment_status = 'Paid' AND status != 'Cancelled'").get();
        const codRevenue = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as s, COUNT(*) as c FROM orders WHERE gateway LIKE '%Cash on Delivery%' AND payment_status != 'Paid' AND status != 'Cancelled'").get();
        const pendingRevenue = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as s, COUNT(*) as c FROM orders WHERE payment_status = 'Pending' AND gateway NOT LIKE '%Cash on Delivery%' AND status != 'Cancelled'").get();

        const recentOrders = db.prepare(`
          SELECT id, customer_name as customer, customer_phone as phone, total_amount as amount,
                 gateway, payment_status as paymentStatus, status, created_at as date, razorpay_payment_id as razorpayPaymentId
          FROM orders
          ORDER BY datetime(created_at) DESC
          LIMIT 10
        `).all();

        const getItems = db.prepare('SELECT name, quantity as qty FROM order_items WHERE order_id = ?');
        for (const o of recentOrders) {
          o.items = getItems.all(o.id);
        }

        return sendJson(res, 200, {
          totalOrders,
          confirmedRevenue: confirmedRevenue.s,
          paidCount: confirmedRevenue.c,
          codRevenue: codRevenue.s,
          codCount: codRevenue.c,
          pendingRevenue: pendingRevenue.s,
          pendingCount: pendingRevenue.c,
          recentOrders
        });
      }

      // --- 7B. Envia Multi-Carrier Shipping Integration ---
      if (pathname === '/api/shipping/envia/test' && method === 'POST') {
        const body = await parseJsonBody(req);
        const token = String(body.apiKey || process.env.ENVIA_API_KEY || '87e6fa5254254329cc8f21c4de06ce0dd3546197e4b55664bc3a25efcbf87236').trim();
        const env = body.env === 'test' ? 'test' : 'live';
        const host = env === 'test' ? 'queries.test.envia.com' : 'queries.envia.com';

        try {
          const https = require('node:https');
          const enviaRes = await new Promise((resolve, reject) => {
            const r = https.request({
              hostname: host,
              path: '/carrier?country_code=IN',
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            }, (resp) => {
              let data = '';
              resp.on('data', chunk => data += chunk);
              resp.on('end', () => resolve({ statusCode: resp.statusCode, body: data }));
            });
            r.on('error', reject);
            r.on('timeout', () => { r.destroy(); reject(new Error('Envia API request timed out')); });
            r.end();
          });

          const json = JSON.parse(enviaRes.body || '{}');
          if (enviaRes.statusCode === 200 && Array.isArray(json.data)) {
            const carriers = json.data.map(c => ({ id: c.id, name: c.name, trackUrl: c.track_url || '' }));
            return sendJson(res, 200, {
              success: true,
              count: carriers.length,
              carriers,
              message: `Envia.com connection active! ${carriers.length} couriers connected.`
            });
          } else {
            return sendJson(res, 400, {
              success: false,
              error: json.message || 'Failed to authenticate with Envia. Please check your API token.'
            });
          }
        } catch (err) {
          return sendJson(res, 502, { error: err.message || 'Error communicating with Envia API' });
        }
      }

      async function dispatchOrderWithEnvia(orderId) {
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        if (!order) return { success: false, error: `Order ${orderId} not found.` };

        if (order.tracking_number && order.label_url) {
          return {
            success: true,
            alreadyGenerated: true,
            trackingNumber: order.tracking_number,
            labelUrl: order.label_url,
            trackUrl: order.tracking_url,
            carrier: order.courier_name,
            message: `Label already generated: ${order.courier_name} AWB ${order.tracking_number}`
          };
        }

        const enviaSetting = JSON.parse(db.prepare("SELECT value_json FROM settings WHERE key_name = 'envia'").get()?.value_json || '{}');
        const token = enviaSetting.apiKey || process.env.ENVIA_API_KEY || '87e6fa5254254329cc8f21c4de06ce0dd3546197e4b55664bc3a25efcbf87236';
        const env = enviaSetting.env === 'test' ? 'test' : 'live';
        const apiHost = env === 'test' ? 'api-test.envia.com' : 'api.envia.com';
        const origin = enviaSetting.origin || {
          name: 'ODD Perfumes Warehouse',
          phone: '9876543210',
          street: 'Industrial Area',
          number: '10',
          city: 'Mumbai',
          state: 'MH',
          country: 'IN',
          postalCode: '400001'
        };

        const destAddress = String(order.shipping_address || '');
        const pincodeMatch = destAddress.match(/\b\d{6}\b/);
        const pincode = pincodeMatch ? pincodeMatch[0] : '400001';
        const chosenCarrier = enviaSetting.carrier && enviaSetting.carrier !== 'all' ? enviaSetting.carrier.toLowerCase() : 'delhivery';

        const payload = {
          origin: {
            name: origin.name || 'ODD Perfumes',
            company: 'ODD Perfumes',
            phone: (origin.phone || '9876543210').replace(/[^0-9]/g, ''),
            street: origin.street || 'Main Street',
            number: '1',
            city: origin.city || 'Mumbai',
            state: origin.state || 'MH',
            country: 'IN',
            postalCode: origin.postalCode || '400001'
          },
          destination: {
            name: order.customer_name || 'Valued Customer',
            phone: (order.customer_phone || '9876543210').replace(/[^0-9]/g, ''),
            street: destAddress.slice(0, 100),
            number: '1',
            city: origin.city || 'Mumbai',
            state: 'MH',
            country: 'IN',
            postalCode: pincode
          },
          packages: [{
            content: 'ODD Luxury Perfume Fragrance',
            amount: 1,
            type: 'box',
            weight: 0.4,
            weightUnit: 'KG',
            lengthUnit: 'CM',
            dimensions: { length: 15, width: 10, height: 8 },
            declaredValue: Number(order.total_amount) || 899
          }],
          shipment: {
            type: 1,
            carrier: chosenCarrier,
            service: 'express'
          },
          settings: {
            currency: 'INR',
            printFormat: 'PDF',
            printSize: 'STOCK_4X6'
          }
        };

        try {
          const https = require('node:https');
          const reqData = JSON.stringify(payload);
          const enviaRes = await new Promise((resolve, reject) => {
            const r = https.request({
              hostname: apiHost,
              path: '/ship/generate/',
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(reqData)
              },
              timeout: 15000
            }, (resp) => {
              let data = '';
              resp.on('data', chunk => data += chunk);
              resp.on('end', () => resolve({ statusCode: resp.statusCode, body: data }));
            });
            r.on('error', reject);
            r.on('timeout', () => { r.destroy(); reject(new Error('Envia label generation timed out')); });
            r.write(reqData);
            r.end();
          });

          const resJson = JSON.parse(enviaRes.body || '{}');
          const shipData = (Array.isArray(resJson.data) ? resJson.data[0] : resJson.data) || {};
          const trackingNumber = shipData.trackingNumber || shipData.tracking_number || null;
          const labelUrl = shipData.label || shipData.labelUrl || shipData.label_url || null;
          const carrierName = (shipData.carrier || chosenCarrier).toUpperCase();
          const trackUrl = shipData.trackUrl || shipData.track_url || `https://www.delhivery.com/track/package/${trackingNumber}`;

          if (trackingNumber) {
            db.prepare(`
              UPDATE orders
              SET courier_name = ?, tracking_number = ?, tracking_url = ?, label_url = ?, status = 'Dispatched', dispatched_at = datetime('now'), updated_at = datetime('now')
              WHERE id = ?
            `).run(carrierName, trackingNumber, trackUrl, labelUrl, orderId);

            return {
              success: true,
              trackingNumber,
              labelUrl,
              trackUrl,
              carrier: carrierName,
              message: `Envia shipping label generated with ${carrierName}! AWB: ${trackingNumber}`
            };
          } else {
            let errMsg = 'Envia could not generate label for this address.';
            if (resJson.error?.message) {
              const raw = String(resJson.error.message);
              if (resJson.error.code === 1170 || raw.toLowerCase().includes('not enough money')) {
                errMsg = 'Insufficient Envia wallet balance (Not Enough money). Please recharge your Envia account balance at shipping.envia.com to generate courier labels.';
              } else {
                errMsg = raw;
              }
            } else if (resJson.meta?.message) {
              errMsg = String(resJson.meta.message);
            } else if (typeof resJson.message === 'string') {
              errMsg = resJson.message;
            } else if (typeof resJson.error === 'string') {
              errMsg = resJson.error;
            }

            return {
              success: false,
              error: errMsg,
              raw: resJson
            };
          }
        } catch (err) {
          return { success: false, error: err.message || 'Error communicating with Envia API' };
        }
      }

      if (pathname === '/api/shipping/envia/create-label' && method === 'POST') {
        const session = getStaffSession(req);
        if (session) {
          const perms = ROLE_PERMISSIONS[session.role] || [];
          if (!perms.includes('*') && !perms.includes('orders') && !perms.includes('shipping')) {
            return sendJson(res, 403, { error: `Forbidden: Role ${session.role} cannot create labels` });
          }
        }

        const body = await parseJsonBody(req);
        const orderId = String(body.orderId || '').trim();
        if (!orderId) return sendJson(res, 400, { error: 'Order ID is required.' });

        const result = await dispatchOrderWithEnvia(orderId);
        return sendJson(res, result.success ? 200 : 400, result);
      }

      if (pathname === '/api/shipping/envia/rates' && method === 'POST') {
        const body = await parseJsonBody(req);
        const pincode = String(body.postalCode || body.pincode || '400001').trim();
        if (!/^\d{6}$/.test(pincode)) {
          return sendJson(res, 400, { error: 'Please provide a valid 6-digit Indian PIN code.' });
        }

        const enviaSetting = JSON.parse(db.prepare("SELECT value_json FROM settings WHERE key_name = 'envia'").get()?.value_json || '{}');
        const token = enviaSetting.apiKey || process.env.ENVIA_API_KEY || '87e6fa5254254329cc8f21c4de06ce0dd3546197e4b55664bc3a25efcbf87236';
        const origin = enviaSetting.origin || {
          name: 'ODD Perfumes Warehouse',
          phone: '9876543210',
          street: 'Industrial Area',
          number: '10',
          city: 'Mumbai',
          state: 'MH',
          country: 'IN',
          postalCode: '400001'
        };

        const carriers = ['delhivery', 'ekart'];
        const https = require('node:https');
        const ratePromises = carriers.map(carrier => new Promise(resolve => {
          const payload = JSON.stringify({
            origin: {
              name: origin.name || 'ODD Perfumes',
              company: 'ODD Perfumes',
              phone: (origin.phone || '9876543210').replace(/[^0-9]/g, ''),
              street: origin.street || 'Main Street',
              number: '1',
              city: origin.city || 'Mumbai',
              state: 'MH',
              country: 'IN',
              postalCode: origin.postalCode || '400001'
            },
            destination: {
              name: 'Customer',
              phone: '9876543210',
              street: 'Destination Street',
              number: '1',
              city: body.city || 'Mumbai',
              state: 'MH',
              country: 'IN',
              postalCode: pincode
            },
            packages: [{
              content: 'ODD Luxury Perfume Fragrance',
              amount: 1,
              type: 'box',
              weight: 0.4,
              weightUnit: 'KG',
              lengthUnit: 'CM',
              dimensions: { length: 15, width: 10, height: 8 },
              declaredValue: Number(body.totalAmount) || 899
            }],
            shipment: { type: 1, carrier }
          });

          const r = https.request({
            hostname: 'api.envia.com',
            path: '/ship/rate/',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 6000
          }, resp => {
            let data = '';
            resp.on('data', c => data += c);
            resp.on('end', () => {
              try {
                const j = JSON.parse(data);
                resolve(Array.isArray(j.data) ? j.data : []);
              } catch (_) { resolve([]); }
            });
          });
          r.on('error', () => resolve([]));
          r.write(payload);
          r.end();
        }));

        const results = await Promise.all(ratePromises);
        const quotes = results.flat().map(q => ({
          carrier: q.carrier,
          carrierName: q.carrier ? q.carrier.charAt(0).toUpperCase() + q.carrier.slice(1) : '',
          service: q.service,
          serviceName: q.serviceDescription || q.service,
          totalPrice: Number(q.totalPrice) || 0,
          currency: q.currency || 'INR',
          estimate: q.deliveryEstimate || '2-4 days',
          deliveryDate: q.deliveryDate?.date || null
        })).sort((a, b) => a.totalPrice - b.totalPrice);

        return sendJson(res, 200, { success: true, count: quotes.length, rates: quotes });
      }

      if (pathname === '/api/shipping/envia/webhook' && method === 'POST') {
        const body = await parseJsonBody(req);
        const trackingNumber = String(body.trackingNumber || body.tracking_number || body.data?.tracking_number || '').trim();
        const rawStatus = String(body.status || body.data?.status || '').trim();
        const orderId = String(body.orderData?.orderNumber || body.orderData?.orderIdentifier || body.orderNumber || '').trim();

        if (!trackingNumber && !orderId) {
          return sendJson(res, 200, { success: false, message: 'No tracking or order ID' });
        }

        let order = null;
        if (trackingNumber) {
          order = db.prepare('SELECT * FROM orders WHERE tracking_number = ?').get(trackingNumber);
        }
        if (!order && orderId) {
          order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        }

        if (order) {
          const sLower = rawStatus.toLowerCase();
          let targetStatus = null;
          if (sLower.includes('deliver')) {
            targetStatus = 'Delivered';
            db.prepare("UPDATE orders SET status = 'Delivered', payment_status = 'Paid', delivered_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(order.id);
          } else if (sLower.includes('out for delivery')) {
            targetStatus = 'Out for Delivery';
            db.prepare("UPDATE orders SET status = 'Out for Delivery', updated_at = datetime('now') WHERE id = ?").run(order.id);
          } else if (sLower.includes('transit') || sLower.includes('picked up') || sLower.includes('shipped')) {
            targetStatus = 'Dispatched';
            db.prepare("UPDATE orders SET status = 'Dispatched', updated_at = datetime('now') WHERE id = ?").run(order.id);
          } else if (sLower.includes('return') || sLower.includes('exception') || sLower.includes('fail')) {
            targetStatus = 'Exception';
            db.prepare("UPDATE orders SET status = 'Exception', updated_at = datetime('now') WHERE id = ?").run(order.id);
          }

          return sendJson(res, 200, { success: true, matched: true, orderId: order.id, updatedStatus: targetStatus || rawStatus });
        }

        return sendJson(res, 200, { success: true, matched: false, message: 'Acknowledged' });
      }

      // --- 8. Barcodes & Warehouse Scanner (/api/barcodes & /api/scans) ---
      if (pathname === '/api/barcodes/batch' && method === 'POST') {
        const session = requireStaffAuth(req, res, 'barcodes');
        if (!session) return;

        const body = await parseJsonBody(req);
        const productsList = Array.isArray(body.products) ? body.products : [];
        const lot = String(body.lot || '01').trim();
        const mfg = String(body.mfg || new Date().toISOString().slice(0, 10));
        const shelfLife = Number(body.shelfLife) || 36;
        const mrp = Number(body.mrp) || 899;
        const startSerialParam = body.startSerial != null && body.startSerial !== '' ? Math.max(1, Number(body.startSerial)) : null;

        const mfgDate = new Date(mfg);
        mfgDate.setMonth(mfgDate.getMonth() + shelfLife);
        const expiry = mfgDate.toISOString().slice(0, 10);

        const SKU_NAMES = {
          'ODD-FM-002': 'ODD FIRST MOVE',
          'ODD-LC-003': 'ODD LUCID',
          'ODD-PH-001': 'ODD PHANTOM'
        };

        const generatedLabels = [];
        db.exec('BEGIN IMMEDIATE TRANSACTION;');
        try {
          const insertBarcode = db.prepare(`
            INSERT INTO barcodes (serial, sku, product_name, lot_number, mfg_date, expiry_date, mrp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(serial) DO UPDATE SET
              product_name = excluded.product_name,
              lot_number = excluded.lot_number,
              mfg_date = excluded.mfg_date,
              expiry_date = excluded.expiry_date,
              mrp = excluded.mrp
          `);

          const SHORT_SKUS = {
            'ODD-FM-002': 'ODD-FM',
            'ODD-LC-003': 'ODD-LC',
            'ODD-PH-001': 'ODD-PH'
          };

          for (const item of productsList) {
            const sku = item.sku;
            const count = Math.min(5000, Math.max(1, Number(item.qty) || 1));
            const name = SKU_NAMES[sku] || sku;
            const prefix = SHORT_SKUS[sku] || (sku.startsWith('ODD-') ? sku.slice(0, 6) : `ODD-${sku}`);
            const batchNum = (lot.match(/(\d{1,2})$/) || [null, '01'])[1].padStart(2, '0');

            // Find current highest index for this lot
            const existingCount = db.prepare('SELECT COUNT(*) as c FROM barcodes WHERE sku = ? AND lot_number = ?').get(sku, lot).c;
            const startIdx = startSerialParam !== null ? startSerialParam : (existingCount + 1);

            for (let i = 0; i < count; i++) {
              const currentNum = startIdx + i;
              const serialIndex = String(currentNum).padStart(2, '0');
              const serial = `${prefix}-${batchNum}-${serialIndex}`;

              insertBarcode.run(serial, sku, name, lot, mfg, expiry, mrp);
              generatedLabels.push({
                sku,
                name,
                barcode: serial,
                serial,
                lot,
                mfg,
                expiry,
                mrp
              });
            }
          }
          db.exec('COMMIT;');
        } catch (err) {
          db.exec('ROLLBACK;');
          throw err;
        }

        return sendJson(res, 200, { success: true, labels: generatedLabels, expiry });
      }

      if (pathname === '/api/scans' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'scans');
        if (!session) return;

        const scans = db.prepare('SELECT id, code, sku, item_name as name, mode, delta, stock_after as newStock, staff_name as staff, details, created_at as time FROM scans ORDER BY id DESC LIMIT 50').all();
        return sendJson(res, 200, { scans });
      }

      if (pathname === '/api/scans' && method === 'DELETE') {
        const session = requireStaffAuth(req, res, 'scans');
        if (!session) return;

        db.prepare('DELETE FROM scans').run();
        return sendJson(res, 200, { success: true, scans: [] });
      }

      if (pathname === '/api/scans' && method === 'POST') {
        const session = requireStaffAuth(req, res, 'scans');
        if (!session) return;

        const body = await parseJsonBody(req);
        const rawCode = String(body.code || '').trim().toUpperCase();
        const mode = body.mode === 'dispatch' ? 'dispatch' : 'receive';

        if (!rawCode) {
          return sendJson(res, 400, { error: 'Scan code cannot be empty.' });
        }

        db.exec('BEGIN IMMEDIATE TRANSACTION;');
        try {
          // Check if code matches an Order ID (e.g. ODD-123456 or 123456)
          const order = db.prepare("SELECT * FROM orders WHERE id = ? OR replace(id, 'ODD-', '') = ?").get(rawCode, rawCode.replace('ODD-', ''));

          if (order) {
            const alreadyDispatched = order.status === 'Dispatched' || order.status === 'Delivered';
            const deductedSummary = [];
            let totalDeducted = 0;

            if (!order.stock_deducted) {
              const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
              for (const it of items) {
                db.prepare("UPDATE products SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = ?").run(it.quantity, it.product_id);
                const p = db.prepare('SELECT stock, sku, name FROM products WHERE id = ?').get(it.product_id);
                db.prepare(`
                  INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, order_id, staff_name)
                  VALUES (?, ?, ?, ?, 'Order Dispatched via Scanner', ?, ?)
                `).run(p.sku, it.product_id, -it.quantity, p.stock, order.id, session.name);
                deductedSummary.push(`${p.name} (-${it.quantity})`);
                totalDeducted += it.quantity;
              }
            }

            db.prepare("UPDATE orders SET status = 'Dispatched', dispatched_at = datetime('now'), stock_deducted = 1, updated_at = datetime('now') WHERE id = ?").run(order.id);

            db.prepare(`
              INSERT INTO scans (code, sku, item_name, mode, delta, stock_after, staff_name, details)
              VALUES (?, 'ORDER-DISPATCH', ?, 'dispatch', ?, 'Dispatched', ?, ?)
            `).run(order.id, `Order ${order.id}`, -totalDeducted, session.name, deductedSummary.join(', ') || 'Order Dispatched');

            db.exec('COMMIT;');

            return sendJson(res, 200, {
              success: true,
              isOrder: true,
              code: order.id,
              name: `Order ${order.id}`,
              message: alreadyDispatched
                ? `Order ${order.id} was already marked dispatched.`
                : `Order ${order.id} dispatched! Stock updated: ${deductedSummary.join(', ') || 'items verified'}.`
            });
          }

          // Otherwise code is SKU or barcode serial
          let matchedProduct = null;
          if (rawCode.includes('FM') || rawCode.includes('FIRST-MOVE') || rawCode.includes('MOVE')) {
            matchedProduct = db.prepare("SELECT * FROM products WHERE sku = 'ODD-FM-002'").get();
          } else if (rawCode.includes('LC') || rawCode.includes('LUCID')) {
            matchedProduct = db.prepare("SELECT * FROM products WHERE sku = 'ODD-LC-003'").get();
          } else if (rawCode.includes('PH') || rawCode.includes('PHANTOM')) {
            matchedProduct = db.prepare("SELECT * FROM products WHERE sku = 'ODD-PH-001'").get();
          } else {
            matchedProduct = db.prepare('SELECT * FROM products WHERE sku = ?').get(rawCode);
          }

          if (!matchedProduct) {
            db.exec('ROLLBACK;');
            const isLikelyOrder = /^ODD-?\d+$/i.test(rawCode) || /^\d{5,}$/.test(rawCode);
            const errMsg = isLikelyOrder
              ? `Order ${rawCode} was not found in the database. Please verify the order number.`
              : `Unrecognized product or barcode: ${rawCode}`;
            return sendJson(res, 404, { error: errMsg });
          }

          if (mode === 'dispatch' && matchedProduct.stock <= 0) {
            db.exec('ROLLBACK;');
            return sendJson(res, 400, {
              error: `Cannot dispatch ${matchedProduct.name}: Stock is currently 0. Switch to Receive mode (+1) to add stock.`
            });
          }

          const delta = mode === 'receive' ? 1 : -1;
          const newStock = Math.max(0, matchedProduct.stock + delta);

          db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?").run(newStock, matchedProduct.id);

          db.prepare(`
            INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(matchedProduct.sku, matchedProduct.id, delta, newStock, `Warehouse Scanner ${mode.toUpperCase()}`, session.name);

          db.prepare(`
            INSERT INTO scans (code, sku, item_name, mode, delta, stock_after, staff_name, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(rawCode, matchedProduct.sku, matchedProduct.name, mode, delta, String(newStock), session.name, `Stock adjusted to ${newStock}`);

          db.exec('COMMIT;');

          return sendJson(res, 200, {
            success: true,
            isOrder: false,
            sku: matchedProduct.sku,
            name: matchedProduct.name,
            stock: newStock,
            delta
          });
        } catch (err) {
          db.exec('ROLLBACK;');
          throw err;
        }
      }

      // --- 9. Staff Management (/api/staff) ---
      if (pathname === '/api/staff' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'admin');
        if (!session) return;

        const staff = db.prepare('SELECT id, name, email, role, active, last_login as lastLogin, created_at as createdAt FROM staff ORDER BY id').all();
        return sendJson(res, 200, { staff });
      }

      if (pathname === '/api/staff' && method === 'POST') {
        const session = requireStaffAuth(req, res, 'admin');
        if (!session) return;

        const body = await parseJsonBody(req);
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const role = String(body.role || 'warehouse').toLowerCase();

        if (!name || !email || !password) {
          return sendJson(res, 400, { error: 'Please enter name, email, and password.' });
        }

        try {
          const passHash = hashPassword(password);
          db.prepare(`
            INSERT INTO staff (name, email, password_hash, role, active)
            VALUES (?, ?, ?, ?, 1)
          `).run(name, email, passHash, role);

          return sendJson(res, 201, { success: true, message: `Staff member ${name} created.` });
        } catch (err) {
          if (err.message.includes('UNIQUE')) {
            return sendJson(res, 400, { error: `Account with email ${email} already exists.` });
          }
          throw err;
        }
      }

      if (pathname.startsWith('/api/staff/') && method === 'PATCH') {
        const session = requireStaffAuth(req, res, 'admin');
        if (!session) return;

        const staffId = Number(pathname.replace('/api/staff/', ''));
        const body = await parseJsonBody(req);

        // Prevent disabling the last active admin
        if (body.active === false) {
          const target = db.prepare('SELECT * FROM staff WHERE id = ?').get(staffId);
          if (target && target.role === 'admin') {
            const activeAdmins = db.prepare("SELECT COUNT(*) as c FROM staff WHERE role = 'admin' AND active = 1").get().c;
            if (activeAdmins <= 1) {
              return sendJson(res, 400, { error: 'Cannot disable the last active administrator account.' });
            }
          }
        }

        if (body.active !== undefined) {
          db.prepare('UPDATE staff SET active = ? WHERE id = ?').run(body.active ? 1 : 0, staffId);
        }
        if (body.role) {
          db.prepare('UPDATE staff SET role = ? WHERE id = ?').run(body.role, staffId);
        }

        return sendJson(res, 200, { success: true });
      }

      // --- 10. Store Settings (/api/settings) ---
      if (pathname.startsWith('/api/settings/') && method === 'GET') {
        const key = pathname.replace('/api/settings/', '');
        const setting = db.prepare('SELECT value_json FROM settings WHERE key_name = ?').get(key);
        return sendJson(res, 200, setting ? JSON.parse(setting.value_json) : {});
      }

      if (pathname.startsWith('/api/settings/') && (method === 'POST' || method === 'PUT')) {
        const key = pathname.replace('/api/settings/', '');
        if (!['shipping', 'envia'].includes(key)) {
          const requiredPermission = key === 'banner' ? 'marketing' : 'admin';
          const session = requireStaffAuth(req, res, requiredPermission);
          if (!session) return;
        }

        const body = await parseJsonBody(req);

        db.prepare(`
          INSERT INTO settings (key_name, value_json, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(key_name) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
        `).run(key, JSON.stringify(body));

        // Update active in-memory Razorpay config if key is razorpay
        if (key === 'razorpay') {
          if (body.keyId) RAZORPAY_CONFIG.keyId = body.keyId;
          if (body.keySecret) RAZORPAY_CONFIG.keySecret = body.keySecret;
          if (body.enabled !== undefined) RAZORPAY_CONFIG.enabled = body.enabled;
        }

        return sendJson(res, 200, { success: true, message: `${key} settings updated.` });
      }

      // --- 11. Customer Account (/api/customer) ---
      if (pathname === '/api/customer/register' && method === 'POST') {
        const body = await parseJsonBody(req);
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const phone = String(body.phone || '').trim();
        const password = String(body.password || '');

        if (!name || !email || !password) {
          return sendJson(res, 400, { error: 'Please provide full name, email, and password.' });
        }

        try {
          const custId = 'cust-' + Math.floor(10000 + Math.random() * 90000);
          const passHash = hashPassword(password);
          db.prepare(`
            INSERT INTO customers (id, name, email, phone, password_hash)
            VALUES (?, ?, ?, ?, ?)
          `).run(custId, name, email, phone, passHash);

          const sessionId = generateSecureToken(32);
          const csrfToken = generateSecureToken(24);
          const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

          db.prepare(`
            INSERT INTO sessions (id, user_type, user_id, role, csrf_token, ip_address, expires_at)
            VALUES (?, 'customer', ?, 'customer', ?, ?, ?)
          `).run(sessionId, custId, csrfToken, clientIp, expiresAt);

          setCookie(res, 'odd_customer_session', sessionId, 30 * 86400);

          return sendJson(res, 201, {
            authenticated: true,
            customer: { id: custId, name, email, phone },
            csrfToken
          });
        } catch (err) {
          if (err.message.includes('UNIQUE')) {
            return sendJson(res, 400, { error: 'An account with this email address already exists.' });
          }
          throw err;
        }
      }

      if (pathname === '/api/customer/login' && method === 'POST') {
        const body = await parseJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
        if (!customer || !verifyPassword(password, customer.password_hash)) {
          return sendJson(res, 401, { error: 'Invalid email or password.' });
        }

        const sessionId = generateSecureToken(32);
        const csrfToken = generateSecureToken(24);
        const expiresAt = new Date(Date.now() + 30 * 86400 * 1000).toISOString();

        db.prepare(`
          INSERT INTO sessions (id, user_type, user_id, role, csrf_token, ip_address, expires_at)
          VALUES (?, 'customer', ?, 'customer', ?, ?, ?)
        `).run(sessionId, customer.id, csrfToken, clientIp, expiresAt);

        setCookie(res, 'odd_customer_session', sessionId, 30 * 86400);

        return sendJson(res, 200, {
          authenticated: true,
          customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
          csrfToken
        });
      }

      if (pathname === '/api/customer/logout' && method === 'POST') {
        const cookies = parseCookies(req);
        const sessionId = cookies['odd_customer_session'];
        if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
        clearCookie(res, 'odd_customer_session');
        return sendJson(res, 200, { success: true });
      }

      if (pathname === '/api/customer/session' && method === 'GET') {
        const session = getCustomerSession(req);
        if (!session) return sendJson(res, 200, { authenticated: false });

        const addresses = db.prepare('SELECT id, label, name, phone, address_line as address, city, pincode, is_default as isDefault FROM customer_addresses WHERE customer_id = ?').all(session.user_id);
        return sendJson(res, 200, {
          authenticated: true,
          customer: { id: session.user_id, name: session.name, email: session.email, phone: session.phone },
          addresses,
          csrfToken: session.csrf_token
        });
      }

      if (pathname === '/api/customer/orders' && method === 'GET') {
        const session = getCustomerSession(req);
        if (!session) return sendJson(res, 401, { error: 'Please log in to view orders.' });

        const orders = db.prepare(`
          SELECT id, total_amount as amount, status, payment_status as paymentStatus, payment_method as paymentMethod, created_at as date
          FROM orders
          WHERE customer_email = ?
          ORDER BY datetime(created_at) DESC
        `).all(session.email);

        const getItems = db.prepare('SELECT name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?');
        for (const o of orders) {
          o.items = getItems.all(o.id);
        }

        return sendJson(res, 200, { orders });
      }

      if (pathname === '/api/customer/address' && method === 'POST') {
        const session = getCustomerSession(req);
        if (!session) return sendJson(res, 401, { error: 'Unauthorized.' });

        const body = await parseJsonBody(req);
        const { label, name, phone, address, city, pincode } = body;

        db.prepare(`
          INSERT INTO customer_addresses (customer_id, label, name, phone, address_line, city, pincode, is_default)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(session.user_id, label || 'Home', name, phone, address, city, pincode);

        return sendJson(res, 201, { success: true });
      }

      // Route not found
      return sendJson(res, 404, { error: `Endpoint not found: ${pathname}` });
    }

    /* ========================================================================
       STATIC FILE SERVING (HTML, CSS, JS, Assets)
       ======================================================================== */
    let filePath = pathname === '/' ? path.join(ROOT_DIR, 'index.html') : path.join(ROOT_DIR, pathname);

    // Prevent directory traversal
    const safePath = path.normalize(filePath);
    if (!safePath.startsWith(ROOT_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Access Denied');
    }

    // Never serve sensitive files or directories
    if (safePath.includes('storage') || safePath.includes('.git') || safePath.endsWith('.sqlite') || safePath.endsWith('.env')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Access Denied');
    }

    fs.stat(safePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<h1>404 Not Found</h1><p>The requested file does not exist.</p><a href="/">Back to Home</a>');
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=86400'
      });

      fs.createReadStream(safePath).pipe(res);
    });

  } catch (error) {
    console.error('Server error handling request:', error);
    sendJson(res, 500, { error: 'Internal Server Error', message: error.message });
  }
});

// Start Server
if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`====================================================`);
    console.log(`ODD Perfumes Production Server online:`);
    console.log(`URL: http://${HOST}:${PORT}/`);
    console.log(`Staff Portal: http://${HOST}:${PORT}/admin-login.html`);
    console.log(`Authoritative Database: ${DB_PATH}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`====================================================`);
  });
}

module.exports = { server, db, hashPassword, verifyPassword };
