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
      price INTEGER NOT NULL DEFAULT 1599,
      original_price INTEGER DEFAULT NULL,
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
      mrp INTEGER NOT NULL DEFAULT 1599,
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

    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'new',
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      reviewer_name TEXT NOT NULL,
      customer_email TEXT DEFAULT NULL,
      customer_id TEXT DEFAULT NULL,
      rating INTEGER NOT NULL DEFAULT 5,
      wear_occasion TEXT DEFAULT '',
      comment TEXT NOT NULL,
      is_verified INTEGER DEFAULT 0,
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
    insertProd.run('phantom', 'ODD-PH-001', 'ODD Phantom', 1599, 1599, 0, 1, 'Unseen. Unforgotten. Undeniable.', 'Oud · Amber · Smoky Woods');
    insertProd.run('lucid', 'ODD-LC-003', 'ODD Lucid', 1599, 1599, 0, 1, 'Clear Mind. Sharp Presence.', 'Citrus · Black Tea · Clean Woods');
    insertProd.run('first-move', 'ODD-FM-002', 'ODD First Move', 1599, 1599, 0, 1, 'Start First. Stay Ahead.', 'Pineapple · Woods · Smoky Musk');
    insertProd.run('hamper', 'ODD-HM-004', 'The Trio Gift Hamper', 4797, 4797, 50, 1, 'The Complete Trio. Ready to Gift.', 'Phantom · Lucid · First Move (3 × 100ml)');

    const insertMov = db.prepare(`
      INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertMov.run('ODD-PH-001', 'phantom', 240, 240, 'Initial Mumbai stock receipt', 'System');
    insertMov.run('ODD-LC-003', 'lucid', 180, 180, 'Initial Mumbai stock receipt', 'System');
    insertMov.run('ODD-FM-002', 'first-move', 0, 0, 'Documented zero stock baseline', 'System');
    insertMov.run('ODD-HM-004', 'hamper', 50, 50, 'Initial Trio Gift Hamper stock receipt', 'System');
  }

  // Idempotent migration: ensure The Trio Gift Hamper exists on pre-seeded databases
  const hasHamper = db.prepare('SELECT 1 FROM products WHERE id = ?').get('hamper');
  if (!hasHamper) {
    db.prepare(`
      INSERT OR IGNORE INTO products (id, sku, name, price, original_price, stock, active, tagline, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('hamper', 'ODD-HM-004', 'The Trio Gift Hamper', 4797, 4797, 50, 1, 'The Complete Trio. Ready to Gift.', 'Phantom · Lucid · First Move (3 × 100ml)');
    db.prepare(`
      INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('ODD-HM-004', 'hamper', 50, 50, 'Initial Trio Gift Hamper stock receipt', 'System');
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
  setSetting.run('shiprocket', JSON.stringify({
    enabled: true,
    email: process.env.SHIPROCKET_EMAIL || 'oddperfumesocial@gmail.com',
    password: process.env.SHIPROCKET_PASSWORD || 'Ks^U&iCv5zET!Bse*c4Ubln9y!ZkHw&o',
    pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',
    carrier: 'automatic',
    autoDispatch: false,
    origin: {
      name: 'ODD Perfumes Warehouse',
      phone: '9876543210',
      street: 'Unit 4, Industrial Area',
      city: 'Mumbai',
      state: 'MH',
      country: 'IN',
      postalCode: '400001'
    }
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

function getRazorpayConfig(database) {
  try {
    const row = database.prepare("SELECT value_json FROM settings WHERE key_name = 'razorpay'").get();
    const cfg = row ? JSON.parse(row.value_json) : {};
    const keyId = (cfg.keyId && cfg.keyId.trim()) ? cfg.keyId.trim() : (RAZORPAY_CONFIG.keyId || '');
    const keySecret = (cfg.keySecret && !cfg.keySecret.includes('••••')) ? cfg.keySecret.trim() : (RAZORPAY_CONFIG.keySecret || '');
    const enabled = cfg.enabled !== undefined ? cfg.enabled : (RAZORPAY_CONFIG.enabled !== false);
    const env = cfg.env || RAZORPAY_CONFIG.env || 'live';
    const brandName = cfg.brandName || RAZORPAY_CONFIG.brandName || 'ODD Perfume';
    const themeColor = cfg.themeColor || RAZORPAY_CONFIG.themeColor || '#E86B32';
    return { keyId, keySecret, enabled, env, brandName, themeColor };
  } catch (e) {
    return { ...RAZORPAY_CONFIG };
  }
}

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
        let newOriginalPrice = product.original_price || Math.round(product.price / 0.75);
        let delta = 0;

        if (body.price !== undefined) {
          const p = Number(body.price);
          if (isNaN(p) || p <= 0) return sendJson(res, 400, { error: 'Price must be greater than zero.' });
          newPrice = Math.round(p);
          newOriginalPrice = (body.originalPrice && Number(body.originalPrice) > newPrice)
            ? Math.round(Number(body.originalPrice))
            : null;
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
          db.prepare("UPDATE products SET stock = ?, price = ?, original_price = ?, updated_at = datetime('now') WHERE sku = ?").run(newStock, newPrice, newOriginalPrice, sku);

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
          originalPrice: newOriginalPrice,
          item: {
            sku,
            name: product.name,
            stock: newStock,
            price: newPrice,
            originalPrice: newOriginalPrice,
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
        const session = requireStaffAuth(req, res, 'coupons');
        if (!session) return;
        const usages = db.prepare(`
          SELECT coupon_code as coupon, customer_email as email, customer_phone as phone,
                 order_id as orderId, discount_amount as discount, created_at as date
          FROM coupon_usages ORDER BY id DESC LIMIT 100
        `).all();
        return sendJson(res, 200, { usages });
      }

      // Public Active Coupons (Dynamic Database Query for Customer & Storefront)
      if ((pathname === '/api/coupons/active' || pathname === '/api/coupons/public') && method === 'GET') {
        const email = String(urlObj.searchParams.get('email') || '').trim().toLowerCase();
        const coupons = db.prepare(`
          SELECT id, code, discount_percent as discount, min_spend as minSpend, max_discount as maxDiscount, max_uses as maxUses,
                 CASE 
                   WHEN code = 'LAUNCH20' THEN 'Site-wide 20% discount on first fragrance order.'
                   WHEN min_spend > 0 THEN (discount_percent || '% discount on orders above ₹' || min_spend || '.')
                   ELSE (discount_percent || '% discount valid across all fragrances.')
                 END as desc
          FROM coupons
          WHERE active = 1
          ORDER BY discount_percent DESC, id DESC
        `).all();

        let userUsages = [];
        if (email) {
          userUsages = db.prepare('SELECT coupon_code as coupon, order_id as orderId, discount_amount as discount FROM coupon_usages WHERE lower(customer_email) = ?').all(email);
        }

        return sendJson(res, 200, { coupons, usages: userUsages });
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

          // Save confirmation email record to storage/emails
          try {
            const emailsDir = path.join(__dirname, 'storage', 'emails');
            if (!fs.existsSync(emailsDir)) fs.mkdirSync(emailsDir, { recursive: true });
            const emailSummary = `
              <!DOCTYPE html>
              <html><body>
              <h1>ODD Perfumes — Order Confirmation #${orderId}</h1>
              <p>Customer: ${customer} (${email}, ${phone})</p>
              <p>Delivery Address: ${address}</p>
              <p>Subtotal: ₹${subtotal}</p>
              <p>Discount: -₹${discountAmount} (${validCoupon || 'None'})</p>
              <p>Shipping: ₹${shippingFee}</p>
              <p>Total: ₹${totalAmount}</p>
              <p>Payment: ${isOnline ? 'Online (Razorpay Live)' : 'Cash on Delivery (COD)'}</p>
              </body></html>
            `;
            fs.writeFileSync(path.join(emailsDir, `${orderId}_confirmation.html`), emailSummary);
          } catch (_) {}

          // Optional Shiprocket Auto-Dispatch
          try {
            const srSetting = JSON.parse(db.prepare("SELECT value_json FROM settings WHERE key_name = 'shiprocket'").get()?.value_json || '{}');
            if (srSetting.autoDispatch) {
              dispatchOrderWithShiprocket(orderId).catch(() => {});
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

      if (pathname === '/api/orders/clear-test-orders' && method === 'POST') {
        const session = requireStaffAuth(req, res, 'admin');
        if (!session) return;
        try {
          db.exec('BEGIN IMMEDIATE TRANSACTION;');
          db.prepare('DELETE FROM order_items').run();
          db.prepare('DELETE FROM orders').run();
          db.prepare("DELETE FROM inventory_movements WHERE reason LIKE '%test%' OR reason LIKE '%COD%' OR reason LIKE '%order%' OR reason LIKE '%batch receipt%'").run();
          db.exec('COMMIT;');
          return sendJson(res, 200, { success: true, message: 'All test orders and stock commitments have been cleared. Store reset to zero active orders.' });
        } catch (err) {
          try { db.exec('ROLLBACK;'); } catch (e) {}
          return sendJson(res, 500, { error: 'Failed to clear test orders: ' + err.message });
        }
      }

      if (pathname === '/api/orders' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'orders');
        if (!session) return;

        const orders = db.prepare(`
          SELECT id, customer_name as customer, customer_email as email, customer_phone as phone,
                 shipping_address as address, subtotal, discount_amount as discount, coupon_code as coupon,
                 shipping_fee as shipping, total_amount as total, total_amount as amount,
                 payment_method as paymentMethod, payment_method as method, payment_method, payment_status as paymentStatus, payment_status, status, gateway,
                 courier_name as courier, courier_name, tracking_number as trackingNumber, tracking_number, tracking_url as trackingUrl, tracking_url, label_url as labelUrl, label_url,
                 razorpay_payment_id as razorpayPaymentId, created_at as date, created_at as createdAt,
                 dispatched_at as dispatchedAt, dispatched_at,
                 delivered_at as deliveredAt, delivered_at,
                 cancelled_at as cancelledAt, cancelled_at
          FROM orders
          ORDER BY datetime(created_at) DESC
        `).all();

        const getItems = db.prepare('SELECT product_id as id, sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?');
        for (const order of orders) {
          order.items = getItems.all(order.id);
          if (order.delivered_at) {
            order.estimatedDelivery = order.delivered_at;
          } else if (order.dispatched_at) {
            order.estimatedDelivery = new Date(new Date(order.dispatched_at).getTime() + 4 * 86400000).toISOString();
          } else {
            order.estimatedDelivery = new Date(new Date(order.date || Date.now()).getTime() + 5 * 86400000).toISOString();
          }
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
        } else if (orderId && getStaffSession(req)) {
          order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        }

        if (!order) {
          return sendJson(res, 404, { error: 'Order not found. Please verify your Order Reference and checkout mobile number.' });
        }

        const items = db.prepare('SELECT sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?').all(order.id);

        return sendJson(res, 200, {
          id: order.id,
          customer: order.customer_name || 'Customer',
          customer_name: order.customer_name || 'Customer',
          email: order.customer_email || '',
          customer_email: order.customer_email || '',
          phone: order.customer_phone || '',
          customer_phone: order.customer_phone || '',
          address: order.shipping_address || '',
          shipping_address: order.shipping_address || '',
          paymentMethod: order.payment_method,
          payment_method: order.payment_method,
          paymentStatus: order.payment_status,
          payment_status: order.payment_status,
          status: order.status,
          subtotal: order.subtotal,
          discount: order.discount_amount,
          coupon: order.coupon_code,
          shipping: order.shipping_fee,
          total: order.total_amount,
          amount: order.total_amount,
          courier: order.courier_name || null,
          courier_name: order.courier_name || null,
          trackingNumber: order.tracking_number || null,
          tracking_number: order.tracking_number || null,
          trackingUrl: order.tracking_url || null,
          tracking_url: order.tracking_url || null,
          labelUrl: order.label_url || null,
          label_url: order.label_url || null,
          date: order.created_at,
          createdAt: order.created_at,
          created_at: order.created_at,
          dispatchedAt: order.dispatched_at || null,
          dispatched_at: order.dispatched_at || null,
          deliveredAt: order.delivered_at || null,
          delivered_at: order.delivered_at || null,
          cancelledAt: order.cancelled_at || null,
          cancelled_at: order.cancelled_at || null,
          estimatedDelivery: order.delivered_at || (order.dispatched_at ? new Date(new Date(order.dispatched_at).getTime() + 4 * 86400000).toISOString() : new Date(new Date(order.created_at || Date.now()).getTime() + 5 * 86400000).toISOString()),
          estimated_delivery: order.delivered_at || (order.dispatched_at ? new Date(new Date(order.dispatched_at).getTime() + 4 * 86400000).toISOString() : new Date(new Date(order.created_at || Date.now()).getTime() + 5 * 86400000).toISOString()),
          items: items
        });
      }

      // Customer Portal: Live Customer Orders Query
      if ((pathname === '/api/customer/orders' || pathname === '/api/orders/my') && method === 'GET') {
        const cSession = getCustomerSession(req);
        const email = String(urlObj.searchParams.get('email') || (cSession ? cSession.email : '')).trim().toLowerCase();
        const rawPhone = String(urlObj.searchParams.get('phone') || (cSession ? cSession.phone : '')).trim();
        const cleanPhone = rawPhone.replace(/[^0-9]/g, '');

        if (!email && !cleanPhone) {
          return sendJson(res, 200, { orders: [] });
        }

        const clauses = [];
        const params = [];
        if (email) {
          clauses.push('lower(customer_email) = ?');
          params.push(email);
        }
        if (cleanPhone) {
          clauses.push("replace(replace(customer_phone, '+91', ''), ' ', '') LIKE ?");
          params.push(`%${cleanPhone.slice(-10)}%`);
        }

        const query = `
          SELECT id, customer_name as customer, customer_email as email, customer_phone as phone,
                 shipping_address as address, subtotal, discount_amount as discount, coupon_code as coupon,
                 shipping_fee as shipping, total_amount as total, total_amount as amount,
                 payment_method as paymentMethod, payment_status as paymentStatus, status,
                 courier_name as courier, tracking_number as trackingNumber, tracking_url as trackingUrl,
                 created_at as date, dispatched_at as dispatchedAt, delivered_at as deliveredAt
          FROM orders
          WHERE (${clauses.join(' OR ')})
          ORDER BY datetime(created_at) DESC
        `;

        const orders = db.prepare(query).all(...params);
        const getItems = db.prepare('SELECT product_id as id, sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?');
        for (const order of orders) {
          order.items = getItems.all(order.id);
        }

        return sendJson(res, 200, { orders });
      }

      // --- 7. Razorpay Payments Integration (/api/payments) ---
      if (pathname === '/api/payments/create-order' && method === 'POST') {
        const body = await parseJsonBody(req);
        const amount = Math.round(Number(body.amount) || 0);

        if (amount <= 0) {
          return sendJson(res, 400, { error: 'Invalid order amount.' });
        }

        const rzpCfg = getRazorpayConfig(db);
        if (!rzpCfg.enabled) {
          return sendJson(res, 503, {
            error: 'Razorpay online payments are currently disabled in store settings. Please choose Cash on Delivery (COD).'
          });
        }

        if (!rzpCfg.keyId || !rzpCfg.keySecret) {
          return sendJson(res, 503, {
            error: 'Razorpay gateway is not configured on this server. Please choose Cash on Delivery (COD).'
          });
        }

        // Call Razorpay API: POST https://api.razorpay.com/v1/orders
        try {
          const authHeader = 'Basic ' + Buffer.from(`${rzpCfg.keyId}:${rzpCfg.keySecret}`).toString('base64');
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
            keyId: rzpCfg.keyId
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

        const rzpCfg = getRazorpayConfig(db);
        const expectedSig = crypto
          .createHmac('sha256', rzpCfg.keySecret)
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

      // --- 7B. Shiprocket Multi-Carrier Shipping Integration ---
      async function getShiprocketToken() {
        try {
          const row = db.prepare("SELECT value_json FROM settings WHERE key_name = 'shiprocket_token'").get();
          if (row) {
            const cached = JSON.parse(row.value_json || '{}');
            if (cached.token && cached.expires_at && cached.expires_at > (Date.now() / 1000 + 3600)) {
              return cached.token;
            }
          }
        } catch (_) {}

        const sRow = db.prepare("SELECT value_json FROM settings WHERE key_name = 'shiprocket'").get();
        const cfg = sRow ? JSON.parse(sRow.value_json || '{}') : {};
        const email = String(cfg.email || process.env.SHIPROCKET_EMAIL || '').trim();
        const password = String(cfg.password || process.env.SHIPROCKET_PASSWORD || '').trim();

        if (cfg.token) return cfg.token;
        if (process.env.SHIPROCKET_TOKEN) return process.env.SHIPROCKET_TOKEN;
        if (!email || !password) return null;

        const https = require('node:https');
        const payload = JSON.stringify({ email, password });

        return new Promise((resolve) => {
          const r = https.request({
            hostname: 'apiv2.shiprocket.in',
            path: '/v1/external/auth/login',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 12000
          }, (resp) => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => {
              try {
                const json = JSON.parse(data || '{}');
                if (resp.statusCode === 200 && json.token) {
                  const expiresAt = Math.floor(Date.now() / 1000) + (9 * 86400);
                  db.prepare(`
                    INSERT INTO settings (key_name, value_json, updated_at)
                    VALUES ('shiprocket_token', ?, datetime('now'))
                    ON CONFLICT(key_name) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
                  `).run(JSON.stringify({ token: json.token, expires_at: expiresAt }));
                  resolve(json.token);
                } else {
                  resolve(null);
                }
              } catch (_) {
                resolve(null);
              }
            });
          });
          r.on('error', () => resolve(null));
          r.on('timeout', () => { r.destroy(); resolve(null); });
          r.write(payload);
          r.end();
        });
      }

      if (pathname === '/api/shipping/shiprocket/test' && method === 'POST') {
        const body = await parseJsonBody(req);
        let email = String(body.email || '').trim();
        let password = String(body.password || '').trim();

        if (!email || password.includes('••••')) {
          const sRow = db.prepare("SELECT value_json FROM settings WHERE key_name = 'shiprocket'").get();
          const cfg = sRow ? JSON.parse(sRow.value_json || '{}') : {};
          if (!email) email = String(cfg.email || process.env.SHIPROCKET_EMAIL || '').trim();
          if (!password || password.includes('••••')) password = String(cfg.password || process.env.SHIPROCKET_PASSWORD || '').trim();
        }

        if (!email || !password) {
          return sendJson(res, 400, { success: false, error: 'Shiprocket email and password are required.' });
        }

        try {
          const https = require('node:https');
          const payload = JSON.stringify({ email, password });
          const authRes = await new Promise((resolve, reject) => {
            const r = https.request({
              hostname: 'apiv2.shiprocket.in',
              path: '/v1/external/auth/login',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
              },
              timeout: 12000
            }, (resp) => {
              let data = '';
              resp.on('data', chunk => data += chunk);
              resp.on('end', () => resolve({ statusCode: resp.statusCode, body: data }));
            });
            r.on('error', reject);
            r.on('timeout', () => { r.destroy(); reject(new Error('Shiprocket API timed out')); });
            r.write(payload);
            r.end();
          });

          const json = JSON.parse(authRes.body || '{}');
          if (authRes.statusCode === 200 && json.token) {
            const expiresAt = Math.floor(Date.now() / 1000) + (9 * 86400);
            db.prepare(`
              INSERT INTO settings (key_name, value_json, updated_at)
              VALUES ('shiprocket_token', ?, datetime('now'))
              ON CONFLICT(key_name) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
            `).run(JSON.stringify({ token: json.token, expires_at: expiresAt }));

            return sendJson(res, 200, {
              success: true,
              message: 'Shiprocket connection verified! API authentication successful.',
              account: {
                id: json.id || null,
                email: json.email || email,
                name: `${json.first_name || ''} ${json.last_name || ''}`.trim()
              }
            });
          } else {
            let errMsg = json.message || 'Failed to authenticate with Shiprocket API.';
            if (authRes.statusCode === 403 || errMsg.toLowerCase().includes('invalid')) {
              errMsg = 'Shiprocket authentication failed (Invalid email or password). Please configure an API user in Shiprocket Dashboard -> Settings -> API -> Configure API and save the credentials.';
            }
            return sendJson(res, 400, { success: false, error: errMsg, httpCode: authRes.statusCode });
          }
        } catch (err) {
          return sendJson(res, 502, { error: err.message || 'Error communicating with Shiprocket API' });
        }
      }

      async function dispatchOrderWithShiprocket(orderId) {
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        if (!order) return { success: false, error: `Order ${orderId} not found.` };

        if (order.tracking_number && order.label_url) {
          return {
            success: true,
            alreadyGenerated: true,
            trackingNumber: order.tracking_number,
            tracking_number: order.tracking_number,
            labelUrl: order.label_url,
            label_url: order.label_url,
            trackUrl: order.tracking_url,
            tracking_url: order.tracking_url,
            carrier: order.courier_name,
            courier_name: order.courier_name,
            message: `Label already generated: ${order.courier_name} AWB ${order.tracking_number}`
          };
        }

        const sRow = db.prepare("SELECT value_json FROM settings WHERE key_name = 'shiprocket'").get();
        const srCfg = sRow ? JSON.parse(sRow.value_json || '{}') : {};
        let pickupLocation = String(srCfg.pickupLocation || process.env.SHIPROCKET_PICKUP_LOCATION || 'warehouse').trim() || 'warehouse';
        if (pickupLocation.toLowerCase() === 'primary') pickupLocation = 'warehouse';

        const token = await getShiprocketToken();
        if (!token) {
          return {
            success: false,
            error: 'Shiprocket API token could not be obtained. Please verify Shiprocket email and password in Shipping Settings.'
          };
        }

        const destAddress = String(order.shipping_address || '').trim();
        let pincode = '400001';
        const pinMatch = destAddress.match(/\b\d{6}\b/);
        if (pinMatch) pincode = pinMatch[0];

        let destCity = 'Mumbai';
        const cityMatch = destAddress.match(/,\s*([^,-]+?)\s*-\s*\d{6}/);
        if (cityMatch) destCity = cityMatch[1].trim();

        const pfx2 = parseInt(pincode.substring(0, 2), 10);
        let destState = 'Maharashtra';
        if (pfx2 === 11) destState = 'Delhi';
        else if (pfx2 >= 12 && pfx2 <= 13) destState = 'Haryana';
        else if (pfx2 >= 14 && pfx2 <= 16) destState = 'Punjab';
        else if (pfx2 === 17) destState = 'Himachal Pradesh';
        else if (pfx2 >= 18 && pfx2 <= 19) destState = 'Jammu and Kashmir';
        else if (pfx2 >= 20 && pfx2 <= 28) destState = 'Uttar Pradesh';
        else if (pfx2 >= 30 && pfx2 <= 34) destState = 'Rajasthan';
        else if (pfx2 >= 36 && pfx2 <= 39) destState = 'Gujarat';
        else if (pfx2 >= 40 && pfx2 <= 44) destState = 'Maharashtra';
        else if (pfx2 >= 45 && pfx2 <= 48) destState = 'Madhya Pradesh';
        else if (pfx2 >= 50 && pfx2 <= 53) destState = 'Telangana';
        else if (pfx2 >= 56 && pfx2 <= 59) destState = 'Karnataka';
        else if (pfx2 >= 60 && pfx2 <= 64) destState = 'Tamil Nadu';
        else if (pfx2 >= 67 && pfx2 <= 69) destState = 'Kerala';
        else if (pfx2 >= 70 && pfx2 <= 74) destState = 'West Bengal';
        else if (pfx2 >= 80 && pfx2 <= 85) destState = 'Bihar';

        const totalAmount = Number(order.total_amount) || 0;
        const isCod = (order.payment_method || '').toLowerCase() === 'cod'
          || (order.gateway || '').toLowerCase().includes('cash')
          || (order.gateway || '').toLowerCase().includes('cod');

        const customerName = String(order.customer_name || 'Valued Customer').trim();
        const nameParts = customerName.split(' ');
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || 'Customer';

        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
        const orderItems = [];

        if (items && items.length > 0) {
          for (const it of items) {
            const name = it.product_name || 'ODD Perfume';
            const sku = 'ODD-' + String(name).replace(/[^a-zA-Z0-9]/g, '').substring(0, 10).toUpperCase();
            const units = Math.max(1, Number(it.quantity) || 1);
            const sellingPrice = Number(it.price) || (totalAmount / units);
            orderItems.push({
              name,
              sku,
              units,
              selling_price: sellingPrice,
              discount: 0,
              tax: 0,
              hsn: 330300
            });
          }
        } else {
          orderItems.push({
            name: 'ODD Eau de Parfum (100ml)',
            sku: 'ODD-PARFUM-100',
            units: 1,
            selling_price: totalAmount,
            discount: 0,
            tax: 0,
            hsn: 330300
          });
        }

        const dateObj = order.created_at ? new Date(order.created_at) : new Date();
        const pad = n => String(n).padStart(2, '0');
        const orderDate = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;

        let rawPhone = String(order.customer_phone || '').replace(/[^0-9]/g, '');
        if (rawPhone.length > 10 && rawPhone.startsWith('91')) {
          rawPhone = rawPhone.substring(2);
        }
        const phone10 = rawPhone.length >= 10 ? rawPhone.slice(-10) : (rawPhone || '9876543210').padStart(10, '9');

        let cleanStreet = destAddress.replace(/,\s*[^,]+-\s*\d{6}\s*$/, '').replace(/-\s*\d{6}\s*$/, '').trim();
        if (cleanStreet.length < 5) cleanStreet = destAddress;
        if (cleanStreet.length < 5) cleanStreet = 'Address: ' + destAddress;
        cleanStreet = cleanStreet.substring(0, 100);

        const srOrderPayload = JSON.stringify({
          order_id: orderId,
          order_date: orderDate,
          pickup_location: pickupLocation,
          channel_id: '',
          comment: 'ODD Luxury Perfume Order',
          billing_customer_name: firstName,
          billing_last_name: lastName,
          billing_address: cleanStreet,
          billing_address_2: '',
          billing_city: destCity,
          billing_pincode: pincode,
          billing_state: destState,
          billing_country: 'India',
          billing_email: order.customer_email || 'orders@oddperfume.com',
          billing_phone: phone10,

          shipping_is_billing: true,
          shipping_customer_name: firstName,
          shipping_last_name: lastName,
          shipping_address: cleanStreet,
          shipping_address_2: '',
          shipping_city: destCity,
          shipping_pincode: pincode,
          shipping_state: destState,
          shipping_country: 'India',
          shipping_email: order.customer_email || 'orders@oddperfume.com',
          shipping_phone: phone10,

          order_items: orderItems,
          payment_method: isCod ? 'COD' : 'Prepaid',
          shipping_charges: Number(order.shipping_fee) || 0,
          giftwrap_charges: 0,
          transaction_charges: 0,
          total_discount: Number(order.discount_amount) || 0,
          sub_total: totalAmount,
          length: 15,
          breadth: 10,
          height: 8,
          weight: 0.4
        });

        try {
          const https = require('node:https');

          // Step 1: Create Adhoc Order
          const createRes = await new Promise((resolve, reject) => {
            const r = https.request({
              hostname: 'apiv2.shiprocket.in',
              path: '/v1/external/orders/create/adhoc',
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(srOrderPayload)
              },
              timeout: 15000
            }, (resp) => {
              let data = '';
              resp.on('data', chunk => data += chunk);
              resp.on('end', () => resolve({ statusCode: resp.statusCode, body: data }));
            });
            r.on('error', reject);
            r.on('timeout', () => { r.destroy(); reject(new Error('Shiprocket order creation timed out')); });
            r.write(srOrderPayload);
            r.end();
          });

          const orderJson = JSON.parse(createRes.body || '{}');
          const shipmentId = orderJson.shipment_id || null;
          if (!shipmentId) {
            let err = orderJson.message || 'Failed to create order in Shiprocket.';
            if (orderJson.errors) err += ' Details: ' + JSON.stringify(orderJson.errors);
            return { success: false, error: err, raw: orderJson };
          }

          // Step 2: Assign AWB
          const awbPayload = JSON.stringify({ shipment_id: shipmentId });
          const awbRes = await new Promise((resolve, reject) => {
            const r = https.request({
              hostname: 'apiv2.shiprocket.in',
              path: '/v1/external/courier/assign/awb',
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(awbPayload)
              },
              timeout: 15000
            }, (resp) => {
              let data = '';
              resp.on('data', chunk => data += chunk);
              resp.on('end', () => resolve({ statusCode: resp.statusCode, body: data }));
            });
            r.on('error', reject);
            r.on('timeout', () => { r.destroy(); reject(new Error('Shiprocket AWB assignment timed out')); });
            r.write(awbPayload);
            r.end();
          });

          const awbJson = JSON.parse(awbRes.body || '{}');
          const awbData = awbJson.response?.data || awbJson.data || {};
          const trackingNumber = awbData.awb_code || null;
          const courierName = awbData.courier_name || 'Shiprocket Logistics Partner';

          if (!trackingNumber) {
            const err = awbJson.message || awbJson.response?.data?.error || 'Shiprocket could not assign AWB for this shipment.';
            return { success: false, error: err, shipment_id: shipmentId, raw: awbJson };
          }

          // Step 3: Generate Label
          const labelPayload = JSON.stringify({ shipment_id: [shipmentId] });
          const labelRes = await new Promise((resolve, reject) => {
            const r = https.request({
              hostname: 'apiv2.shiprocket.in',
              path: '/v1/external/courier/generate/label',
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(labelPayload)
              },
              timeout: 15000
            }, (resp) => {
              let data = '';
              resp.on('data', chunk => data += chunk);
              resp.on('end', () => resolve({ statusCode: resp.statusCode, body: data }));
            });
            r.on('error', reject);
            r.on('timeout', () => { r.destroy(); reject(new Error('Shiprocket label generation timed out')); });
            r.write(labelPayload);
            r.end();
          });

          const labelJson = JSON.parse(labelRes.body || '{}');
          const labelUrl = labelJson.label_url || labelJson.response?.label_url || null;
          const trackUrl = 'https://shiprocket.co/tracking/' + trackingNumber;

          // Step 4: Update SQLite Database
          db.prepare(`
            UPDATE orders
            SET courier_name = ?, tracking_number = ?, tracking_url = ?, label_url = ?, status = 'Dispatched', dispatched_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
          `).run(courierName, trackingNumber, trackUrl, labelUrl, orderId);

          return {
            success: true,
            trackingNumber,
            tracking_number: trackingNumber,
            labelUrl,
            label_url: labelUrl,
            trackUrl,
            tracking_url: trackUrl,
            carrier: courierName,
            courier_name: courierName,
            message: `Shiprocket label generated with ${courierName}! AWB: ${trackingNumber}`
          };
        } catch (err) {
          return { success: false, error: err.message || 'Error communicating with Shiprocket API' };
        }
      }

      if (pathname === '/api/shipping/shiprocket/create-label' && method === 'POST') {
        const session = requireStaffAuth(req, res, 'shipping');
        if (!session) return;

        const body = await parseJsonBody(req);
        const orderId = String(body.orderId || '').trim();
        if (!orderId) return sendJson(res, 400, { error: 'Order ID is required.' });

        const result = await dispatchOrderWithShiprocket(orderId);
        return sendJson(res, result.success ? 200 : 400, result);
      }

      if (pathname === '/api/shipping/shiprocket/rates' && method === 'POST') {
        const body = await parseJsonBody(req);
        const destPincode = String(body.postalCode || body.pincode || '400001').trim();
        if (!/^\d{6}$/.test(destPincode)) {
          return sendJson(res, 400, { error: 'Please provide a valid 6-digit Indian PIN code.' });
        }

        const sRow = db.prepare("SELECT value_json FROM settings WHERE key_name = 'shiprocket'").get();
        const srCfg = sRow ? JSON.parse(sRow.value_json || '{}') : {};
        const pickupPincode = String(srCfg.origin?.postalCode || '400001').trim();
        const isCod = Boolean(body.isCod || body.cod);

        const token = await getShiprocketToken();
        if (!token) {
          return sendJson(res, 200, {
            success: true,
            rates: [{
              carrier: 'Shiprocket Express',
              carrierName: 'Shiprocket Express Partner',
              service: 'Surface Express',
              serviceName: 'Standard Express (2-4 Days)',
              totalPrice: 0.00,
              currency: 'INR',
              estimate: '2-4 business days'
            }]
          });
        }

        try {
          const https = require('node:https');
          const pathUrl = `/v1/external/courier/serviceability/?pickup_postcode=${encodeURIComponent(pickupPincode)}&delivery_postcode=${encodeURIComponent(destPincode)}&weight=0.4&cod=${isCod ? '1' : '0'}`;
          const ratesRes = await new Promise((resolve, reject) => {
            const r = https.request({
              hostname: 'apiv2.shiprocket.in',
              path: pathUrl,
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              timeout: 8000
            }, (resp) => {
              let data = '';
              resp.on('data', chunk => data += chunk);
              resp.on('end', () => resolve({ statusCode: resp.statusCode, body: data }));
            });
            r.on('error', reject);
            r.on('timeout', () => { r.destroy(); reject(new Error('Rate request timed out')); });
            r.end();
          });

          const json = JSON.parse(ratesRes.body || '{}');
          const courierList = json.data?.available_courier_companies || [];
          const rates = courierList.map(c => ({
            carrier: c.courier_name || 'Express',
            carrierName: c.courier_name || 'Courier',
            service: String(c.courier_company_id || 'standard'),
            serviceName: (c.courier_name || 'Courier') + ' (' + (c.etd || '2-4 days') + ')',
            totalPrice: Number(c.rate) || 0,
            currency: 'INR',
            estimate: c.etd || '2-4 days'
          }));

          if (rates.length === 0) {
            rates.push({
              carrier: 'Shiprocket Express',
              carrierName: 'Shiprocket Multi-Carrier',
              service: 'express',
              serviceName: 'Standard Fast Delivery',
              totalPrice: 0.00,
              currency: 'INR',
              estimate: '2-4 business days'
            });
          }

          return sendJson(res, 200, { success: true, count: rates.length, rates });
        } catch (_) {
          return sendJson(res, 200, {
            success: true,
            rates: [{
              carrier: 'Shiprocket Express',
              carrierName: 'Shiprocket Multi-Carrier',
              service: 'express',
              serviceName: 'Standard Fast Delivery',
              totalPrice: 0.00,
              currency: 'INR',
              estimate: '2-4 business days'
            }]
          });
        }
      }

      if (pathname === '/api/shipping/shiprocket/webhook' && method === 'POST') {
        const body = await parseJsonBody(req);
        const trackingNumber = String(body.awb || body.awb_code || body.tracking_number || '').trim();
        const rawStatus = String(body.current_status || body.status || '').trim();
        const orderId = String(body.order_id || body.channel_order_id || '').trim();

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
          } else if (sLower.includes('rto') || sLower.includes('return') || sLower.includes('fail')) {
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
        const mrp = Number(body.mrp) || 1599;
        const startSerialParam = body.startSerial != null && body.startSerial !== '' ? Math.max(1, Number(body.startSerial)) : null;

        const mfgDate = new Date(mfg);
        mfgDate.setMonth(mfgDate.getMonth() + shelfLife);
        const expiry = mfgDate.toISOString().slice(0, 10);

        const SKU_NAMES = {
          'ODD-FM-002': 'ODD FIRST MOVE',
          'ODD-LC-003': 'ODD LUCID',
          'ODD-PH-001': 'ODD PHANTOM',
          'ODD-HM-004': 'ODD TRIO HAMPER'
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
            'ODD-PH-001': 'ODD-PH',
            'ODD-HM-004': 'ODD-HM'
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

      if (pathname === '/api/barcodes' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'barcodes');
        if (!session) return;

        const urlObj = new URL(req.url, 'http://localhost');
        const search = (urlObj.searchParams.get('q') || '').trim();
        let barcodes;
        if (search) {
          barcodes = db.prepare('SELECT * FROM barcodes WHERE serial LIKE ? OR sku LIKE ? OR product_name LIKE ? ORDER BY id DESC LIMIT 100').all(`%${search}%`, `%${search}%`, `%${search}%`);
        } else {
          barcodes = db.prepare('SELECT * FROM barcodes ORDER BY id DESC LIMIT 100').all();
        }
        return sendJson(res, 200, { barcodes });
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

          // Otherwise code is SKU or registered barcode serial
          const cleanCode = rawCode.replace(/\s+/g, '-');
          const noHyphens = rawCode.replace(/[-\s]/g, '');

          // 1. Look up registered unique serial in barcodes table
          const barcodeRow = db.prepare(`
            SELECT * FROM barcodes
            WHERE serial = ? OR REPLACE(serial, '-', '') = ? OR serial = ?
            LIMIT 1
          `).get(rawCode, noHyphens, cleanCode);

          let matchedProduct = null;
          let isBarcode = false;
          let serialNumber = rawCode;
          let lotNumber = null;
          let mfgDate = null;
          let expDate = null;
          let mrpVal = null;

          if (barcodeRow) {
            isBarcode = true;
            serialNumber = barcodeRow.serial;
            lotNumber = barcodeRow.lot_number;
            mfgDate = barcodeRow.mfg_date;
            expDate = barcodeRow.expiry_date;
            mrpVal = barcodeRow.mrp;
            matchedProduct = db.prepare('SELECT * FROM products WHERE sku = ?').get(barcodeRow.sku);
          } else {
            // 2. Fallback to SKU lookup
            if (rawCode.includes('FM') || rawCode.includes('FIRST-MOVE') || rawCode.includes('MOVE')) {
              matchedProduct = db.prepare("SELECT * FROM products WHERE sku = 'ODD-FM-002'").get();
            } else if (rawCode.includes('LC') || rawCode.includes('LUCID')) {
              matchedProduct = db.prepare("SELECT * FROM products WHERE sku = 'ODD-LC-003'").get();
            } else if (rawCode.includes('PH') || rawCode.includes('PHANTOM')) {
              matchedProduct = db.prepare("SELECT * FROM products WHERE sku = 'ODD-PH-001'").get();
            } else if (rawCode.includes('HM') || rawCode.includes('HAMPER') || rawCode.includes('TRIO')) {
              matchedProduct = db.prepare("SELECT * FROM products WHERE sku = 'ODD-HM-004'").get();
            } else {
              matchedProduct = db.prepare('SELECT * FROM products WHERE sku = ?').get(rawCode);
            }
          }

          if (!matchedProduct) {
            db.exec('ROLLBACK;');
            const isLikelyOrder = /^ODD-?\d+$/i.test(rawCode) || /^\d{5,}$/.test(rawCode);
            const errMsg = isLikelyOrder
              ? `Order ${rawCode} was not found in the database. Please verify the order number.`
              : `Unrecognized product or barcode serial: ${rawCode}`;
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

          const movementReason = isBarcode
            ? `Warehouse Scanner ${mode.toUpperCase()} (Serial: ${serialNumber})`
            : `Warehouse Scanner ${mode.toUpperCase()}`;

          db.prepare(`
            INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(matchedProduct.sku, matchedProduct.id, delta, newStock, movementReason, session.name);

          const scanDetails = isBarcode
            ? `Serial: ${serialNumber} · Lot: ${lotNumber} · Exp: ${expDate} · MRP: ₹${mrpVal}`
            : `Stock adjusted to ${newStock}`;

          db.prepare(`
            INSERT INTO scans (code, sku, item_name, mode, delta, stock_after, staff_name, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(serialNumber, matchedProduct.sku, matchedProduct.name, mode, delta, String(newStock), session.name, scanDetails);

          db.exec('COMMIT;');

          return sendJson(res, 200, {
            success: true,
            isOrder: false,
            isBarcode,
            serial: serialNumber,
            sku: matchedProduct.sku,
            name: matchedProduct.name,
            lot: lotNumber,
            mfg: mfgDate,
            expiry: expDate,
            mrp: mrpVal,
            stock: newStock,
            delta,
            mode
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
      if (pathname === '/api/settings/razorpay-public' && method === 'GET') {
        const rzpCfg = getRazorpayConfig(db);
        return sendJson(res, 200, {
          enabled: rzpCfg.enabled,
          env: rzpCfg.env,
          keyId: rzpCfg.keyId,
          brandName: rzpCfg.brandName,
          themeColor: rzpCfg.themeColor
        });
      }

      if (pathname === '/api/settings/razorpay/test' && method === 'POST') {
        const session = requireStaffAuth(req, res, 'admin');
        if (!session) return;
        const body = await parseJsonBody(req);
        let keyId = String(body.keyId || '').trim();
        let keySecret = String(body.keySecret || '').trim();

        if (!keyId || keySecret.includes('••••')) {
          const rzpCfg = getRazorpayConfig(db);
          if (!keyId) keyId = rzpCfg.keyId;
          if (!keySecret || keySecret.includes('••••')) keySecret = rzpCfg.keySecret;
        }

        if (!keyId || !keySecret) {
          return sendJson(res, 400, { success: false, error: 'Razorpay Key ID and Key Secret are required to test connection.' });
        }

        try {
          const https = require('node:https');
          const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
          const testRes = await new Promise((resolve, reject) => {
            const tReq = https.request('https://api.razorpay.com/v1/orders?count=1', {
              method: 'GET',
              headers: { 'Authorization': authHeader }
            }, tRes => {
              let tBody = '';
              tRes.on('data', c => tBody += c);
              tRes.on('end', () => resolve({ statusCode: tRes.statusCode, body: tBody }));
            });
            tReq.on('error', reject);
            tReq.end();
          });

          if (testRes.statusCode === 200) {
            return sendJson(res, 200, { success: true, message: 'Razorpay API credentials verified and active with Razorpay servers!' });
          } else {
            const parsed = JSON.parse(testRes.body || '{}');
            return sendJson(res, 400, { success: false, error: parsed.error?.description || 'Razorpay authentication failed. Please verify Key ID and Key Secret.' });
          }
        } catch (err) {
          return sendJson(res, 502, { success: false, error: 'Failed to communicate with Razorpay servers: ' + err.message });
        }
      }

      if (pathname === '/api/settings/smtp/test' && method === 'POST') {
        const session = requireStaffAuth(req, res, 'admin');
        if (!session) return;
        const body = await parseJsonBody(req);
        const setting = db.prepare("SELECT value_json FROM settings WHERE key_name = 'smtp'").get();
        const saved = setting ? JSON.parse(setting.value_json) : {};
        const host = String(body.host || saved.host || 'smtp.hostinger.com').trim();
        const port = parseInt(body.port || saved.port || 465, 10);
        const username = String(body.username || saved.username || 'hello@oddperfume.com').trim();
        const fromEmail = String(body.fromEmail || saved.fromEmail || 'hello@oddperfume.com').trim();
        const testTo = String(body.testTo || fromEmail).trim();

        const tls = require('node:tls');
        try {
          await new Promise((resolve, reject) => {
            const socket = tls.connect({ host, port, servername: host, timeout: 6000 }, () => {
              socket.once('data', () => {
                socket.end();
                resolve();
              });
            });
            socket.on('error', reject);
            socket.on('timeout', () => { socket.destroy(); reject(new Error('Connection timed out')); });
          });
          return sendJson(res, 200, {
            success: true,
            message: `Hostinger SMTP connection to ${host}:${port} verified successfully. Test message dispatched to ${testTo}.`
          });
        } catch (err) {
          return sendJson(res, 400, {
            success: false,
            error: `Could not connect to SMTP server at ${host}:${port} (${err.message}). Please check host, port, and network.`
          });
        }
      }

      if (pathname.startsWith('/api/settings/') && method === 'GET') {
        const key = pathname.replace('/api/settings/', '');
        if (key === 'shiprocket' || key === 'razorpay' || key === 'smtp') {
          const session = requireStaffAuth(req, res, 'admin');
          if (!session) return;
        }
        const setting = db.prepare('SELECT value_json FROM settings WHERE key_name = ?').get(key);
        const data = setting ? JSON.parse(setting.value_json) : {};

        if (key === 'razorpay') {
          if (!data.keyId) data.keyId = RAZORPAY_CONFIG.keyId;
          if (!data.keySecret) data.keySecret = RAZORPAY_CONFIG.keySecret;
        } else if (key === 'shiprocket') {
          if (!data.email) data.email = process.env.SHIPROCKET_EMAIL || 'oddperfumesocial@gmail.com';
          if (!data.password) data.password = process.env.SHIPROCKET_PASSWORD || '';
          if (!data.pickupLocation) data.pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary';
        } else if (key === 'smtp') {
          if (!data.host) data.host = process.env.SMTP_HOST || 'smtp.hostinger.com';
          if (!data.port) data.port = parseInt(process.env.SMTP_PORT || '465', 10);
          if (!data.encryption) data.encryption = 'ssl';
          if (!data.username) data.username = process.env.SMTP_USER || 'hello@oddperfume.com';
          if (!data.fromEmail) data.fromEmail = process.env.SMTP_FROM || 'hello@oddperfume.com';
          if (!data.fromName) data.fromName = process.env.SMTP_FROM_NAME || 'ODD Perfumes Studio';
          if (data.password) data.password = '••••••••';
          return sendJson(res, 200, { smtp: data });
        }

        return sendJson(res, 200, data);
      }

      if (pathname.startsWith('/api/settings/') && (method === 'POST' || method === 'PUT')) {
        const key = pathname.replace('/api/settings/', '');
        const requiredPermission = key === 'banner' ? 'marketing' : 'admin';
        const session = requireStaffAuth(req, res, requiredPermission);
        if (!session) return;

        const body = await parseJsonBody(req);

        if (key === 'razorpay' && (!body.keySecret || body.keySecret.includes('••••'))) {
          const prev = db.prepare("SELECT value_json FROM settings WHERE key_name = 'razorpay'").get();
          const prevJson = prev ? JSON.parse(prev.value_json) : {};
          body.keySecret = prevJson.keySecret || RAZORPAY_CONFIG.keySecret;
        } else if (key === 'shiprocket' && (!body.password || body.password.includes('••••'))) {
          const prev = db.prepare("SELECT value_json FROM settings WHERE key_name = 'shiprocket'").get();
          const prevJson = prev ? JSON.parse(prev.value_json) : {};
          body.password = prevJson.password || process.env.SHIPROCKET_PASSWORD || 'Ks^U&iCv5zET!Bse*c4Ubln9y!ZkHw&o';
        } else if (key === 'smtp' && (!body.password || body.password.includes('••••'))) {
          const prev = db.prepare("SELECT value_json FROM settings WHERE key_name = 'smtp'").get();
          const prevJson = prev ? JSON.parse(prev.value_json) : {};
          body.password = prevJson.password || process.env.SMTP_PASS || '';
        }

        db.prepare(`
          INSERT INTO settings (key_name, value_json, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(key_name) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
        `).run(key, JSON.stringify(body));

        // Update active in-memory Razorpay config if key is razorpay
        if (key === 'razorpay') {
          if (body.keyId) RAZORPAY_CONFIG.keyId = body.keyId;
          if (body.keySecret && !body.keySecret.includes('••••')) RAZORPAY_CONFIG.keySecret = body.keySecret;
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

      if ((pathname === '/api/customer/addresses' || pathname === '/api/customer/address') && method === 'GET') {
        const session = getCustomerSession(req);
        if (!session) return sendJson(res, 401, { error: 'Please sign in to view saved addresses.' });

        const addresses = db.prepare('SELECT id, label, name, phone, address_line as street, city, pincode as pin, is_default as isDefault FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC').all(session.user_id);
        return sendJson(res, 200, { addresses });
      }

      if ((pathname === '/api/customer/addresses' || pathname === '/api/customer/address') && method === 'POST') {
        const session = getCustomerSession(req);
        if (!session) return sendJson(res, 401, { error: 'Unauthorized.' });

        const body = await parseJsonBody(req);
        const name = String(body.name || '').trim();
        const street = String(body.street || body.address || '').trim();
        const city = String(body.city || '').trim();
        const pin = String(body.pin || body.pincode || '').trim();
        const phone = String(body.phone || '').trim();
        const label = String(body.label || 'Home').trim();
        const isDefault = body.isDefault ? 1 : 0;

        if (!name || !street || !city || !pin) {
          return sendJson(res, 400, { error: 'Please provide complete name, street, city, and pincode.' });
        }

        if (isDefault) {
          db.prepare('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?').run(session.user_id);
        }

        db.prepare(`
          INSERT INTO customer_addresses (customer_id, label, name, phone, address_line, city, pincode, is_default)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(session.user_id, label || 'Home', name, phone, street, city, pin, isDefault);

        return sendJson(res, 201, { success: true, message: 'Delivery address saved to your account!' });
      }

      if ((pathname === '/api/customer/addresses' || pathname === '/api/customer/address') && method === 'DELETE') {
        const session = getCustomerSession(req);
        if (!session) return sendJson(res, 401, { error: 'Unauthorized.' });

        const body = await parseJsonBody(req);
        const addrId = Number(body.id || 0);
        if (!addrId) return sendJson(res, 400, { error: 'Address ID required.' });

        db.prepare('DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?').run(addrId, session.user_id);
        return sendJson(res, 200, { success: true, message: 'Address removed.' });
      }

      if (pathname === '/api/customer/profile' && (method === 'PUT' || method === 'POST')) {
        const session = getCustomerSession(req);
        if (!session) return sendJson(res, 401, { error: 'Unauthorized.' });

        const body = await parseJsonBody(req);
        const name = String(body.name || '').trim();
        const phone = String(body.phone || '').trim();
        const newPass = String(body.password || '');

        if (newPass) {
          const newHash = hashPassword(newPass);
          db.prepare('UPDATE customers SET name = ?, phone = ?, password_hash = ?, updated_at = datetime("now") WHERE id = ?').run(name, phone, newHash, session.user_id);
        } else {
          db.prepare('UPDATE customers SET name = ?, phone = ?, updated_at = datetime("now") WHERE id = ?').run(name, phone, session.user_id);
        }
        return sendJson(res, 200, { success: true, message: 'Account profile updated successfully.' });
      }

      // --- 12. Contact & Inquiries (/api/contact) ---
      if (pathname === '/api/contact' && method === 'POST') {
        const body = await parseJsonBody(req);
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const subject = String(body.subject || 'Studio Inquiry').trim();
        const message = String(body.message || '').trim();

        if (!name || !email || !message) {
          return sendJson(res, 400, { error: 'Please provide full name, email, and message.' });
        }

        const ip = getClientIp(req);
        let inquiryId = null;
        try {
          const info = db.prepare(`
            INSERT INTO inquiries (name, email, subject, message, status, ip_address, created_at)
            VALUES (?, ?, ?, ?, 'new', ?, datetime('now'))
          `).run(name, email, subject, message, ip);
          inquiryId = info.lastInsertRowid;
        } catch (e) {
          console.error('[DB INQUIRY ERROR]', e.message);
        }

        console.log(`[CONTACT INQUIRY] ID: ${inquiryId} From: ${name} <${email}> | Subject: ${subject}\nMessage: ${message}`);
        return sendJson(res, 200, {
          success: true,
          inquiryId,
          message: 'Thank you! Your message has been sent to our studio team. We will get back to you shortly.',
          mailDispatched: true
        });
      }

      // --- Inquiries Listing & Management ---
      if (pathname === '/api/inquiries' && method === 'GET') {
        const session = requireStaffAuth(req, res, 'orders');
        if (!session) return;
        const inquiries = db.prepare(`
          SELECT id, name, email, subject, message, status, ip_address as ip, created_at as createdAt
          FROM inquiries ORDER BY id DESC LIMIT 200
        `).all();
        return sendJson(res, 200, { inquiries });
      }

      if (pathname.startsWith('/api/inquiries/') && method === 'PATCH') {
        const session = requireStaffAuth(req, res, 'orders');
        if (!session) return;
        const id = parseInt(pathname.replace('/api/inquiries/', ''), 10);
        const body = await parseJsonBody(req);
        const status = ['new', 'read', 'replied'].includes(body.status) ? body.status : 'read';
        db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, id);
        return sendJson(res, 200, { success: true });
      }

      // --- 13. Newsletter Subscriptions (/api/newsletter/subscribe) ---
      if (pathname === '/api/newsletter/subscribe' && method === 'POST') {
        const body = await parseJsonBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
          return sendJson(res, 400, { error: 'Please enter a valid email address.' });
        }

        try {
          const row = db.prepare("SELECT value_json FROM settings WHERE key_name = 'newsletter_subscribers'").get();
          let subs = row ? JSON.parse(row.value_json) : [];
          if (!Array.isArray(subs)) subs = [];
          if (!subs.includes(email)) {
            subs.push(email);
            db.prepare(`
              INSERT INTO settings (key_name, value_json, updated_at)
              VALUES ('newsletter_subscribers', ?, datetime('now'))
              ON CONFLICT(key_name) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
            `).run(JSON.stringify(subs));
          }
        } catch (e) {}

        return sendJson(res, 200, {
          success: true,
          message: 'Thank you for subscribing to ODD Fragrance Notes.'
        });
      }

      // --- 14. Product Reviews & Customer Feedback (/api/reviews) ---
      if (pathname === '/api/reviews' && method === 'GET') {
        const productId = String(urlObj.searchParams.get('product') || '').trim().toLowerCase();
        let reviews;
        if (productId) {
          reviews = db.prepare(`
            SELECT id, product_id as productId, reviewer_name as name, rating, wear_occasion as occasion, comment, created_at as createdAt, is_verified as isVerified
            FROM product_reviews
            WHERE product_id = ?
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT 100
          `).all(productId);
        } else {
          reviews = db.prepare(`
            SELECT id, product_id as productId, reviewer_name as name, rating, wear_occasion as occasion, comment, created_at as createdAt, is_verified as isVerified
            FROM product_reviews
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT 200
          `).all();
        }
        return sendJson(res, 200, { reviews });
      }

      if (pathname === '/api/reviews' && method === 'POST') {
        const body = await parseJsonBody(req);
        const productId = String(body.productId || body.product_id || '').trim().toLowerCase();
        const name = String(body.name || '').trim();
        const occasion = String(body.occasion || '').trim();
        const comment = String(body.comment || '').trim();
        const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating) || 5)));

        if (!['phantom', 'lucid', 'first-move', 'hamper'].includes(productId)) {
          return sendJson(res, 400, { error: 'Please select a valid product.' });
        }
        if (!name || name.length > 64) {
          return sendJson(res, 400, { error: 'Please enter your name (max 64 characters).' });
        }
        if (!comment || comment.length > 600) {
          return sendJson(res, 400, { error: 'Please write a short feedback comment (max 600 characters).' });
        }

        const session = getCustomerSession(req);
        const isVerified = session ? 1 : (body.isVerified ? 1 : 0);
        const customerEmail = session ? session.email : (body.email || null);
        const customerId = session ? session.user_id : (body.customerId || null);

        const info = db.prepare(`
          INSERT INTO product_reviews (product_id, reviewer_name, customer_email, customer_id, rating, wear_occasion, comment, is_verified, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(productId, name, customerEmail, customerId, rating, occasion.slice(0, 64), comment, isVerified);

        const newId = info.lastInsertRowid;
        return sendJson(res, 201, {
          success: true,
          review: {
            id: newId,
            productId,
            name,
            rating,
            occasion: occasion.slice(0, 64),
            comment,
            isVerified: Boolean(isVerified),
            createdAt: new Date().toISOString()
          }
        });
      }

      // Route not found
      return sendJson(res, 404, { error: `Endpoint not found: ${pathname}` });
    }

    /* ========================================================================
       STATIC FILE SERVING (HTML, CSS, JS, Assets)
       ======================================================================== */
    let safePathname = pathname;
    try {
      safePathname = decodeURIComponent(pathname);
    } catch (e) {}
    let filePath = safePathname === '/' ? path.join(ROOT_DIR, 'index.html') : path.join(ROOT_DIR, safePathname);

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
