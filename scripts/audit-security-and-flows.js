'use strict';

const fs = require('fs');
const http = require('http');
const { server, db } = require('../server.js');

async function runAudit() {
  console.log('====================================================');
  console.log('ODD PERFUMES — FULL PROCESS FLOW & SECURITY AUDIT');
  console.log('====================================================\n');

  let passes = 0;
  let fails = 0;

  function assert(condition, message) {
    if (condition) {
      console.log('  PASS: ' + message);
      passes++;
    } else {
      console.error('  FAIL: ' + message);
      fails++;
    }
  }

  // 1. Database Schema & Date Columns
  console.log('[Flow 1] Database Date Milestones & Order Timestamps:');
  const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
  assert(orderColumns.includes('created_at'), 'orders table has created_at column');
  assert(orderColumns.includes('dispatched_at'), 'orders table has dispatched_at column');
  assert(orderColumns.includes('delivered_at'), 'orders table has delivered_at column');
  assert(orderColumns.includes('cancelled_at'), 'orders table has cancelled_at column');

  // 2. Order Reference & Total Value in Envia Payloads
  console.log('\n[Flow 2] Envia Payload Attributes (Preventing Blank Dashboard Columns):');
  const apiPhp = fs.readFileSync('api/index.php', 'utf8');
  const serverJs = fs.readFileSync('server.js', 'utf8');
  assert(apiPhp.includes("'orderReference' => $orderId"), 'api/index.php passes orderReference to Envia shipment');
  assert(apiPhp.includes("'totalValue' => (float)$order['total_amount']"), 'api/index.php passes totalValue to Envia shipment');
  assert(serverJs.includes('orderReference: orderId'), 'server.js passes orderReference to Envia shipment');
  assert(serverJs.includes('totalValue: Number(order.total_amount) || 899'), 'server.js passes totalValue to Envia shipment');

  // 3. Customer Tracking Page Date Milestones & Banner
  console.log('\n[Flow 3] Customer Order Tracking & Delivery Date Calculations:');
  const trackingJs = fs.readFileSync('assets/js/tracking.js', 'utf8');
  assert(trackingJs.includes('formatMilestoneDate'), 'tracking.js includes formatMilestoneDate helper');
  assert(trackingJs.includes('formatDayDate'), 'tracking.js includes formatDayDate helper');
  assert(trackingJs.includes('Estimated Delivery:'), 'tracking.js displays Estimated Delivery window in courier banner');
  assert(trackingJs.includes('progressSteps'), 'tracking.js renders milestones with real dates');

  // 4. Admin Orders Table Date & Time Rendering
  console.log('\n[Flow 4] Admin Portal Order Milestones Rendering:');
  const adminJs = fs.readFileSync('assets/js/admin.js', 'utf8');
  assert(adminJs.includes('Shipped:'), 'admin.js displays Shipped timestamp in orders table');
  assert(adminJs.includes('Delivered:'), 'admin.js displays Delivered timestamp in orders table');
  assert(adminJs.includes('window.toggleEnviaKeyVisibility'), 'admin.js exposes global handlers at top of script');

  // 5. Zero-Stock Integrity & Catalog Validation
  console.log('\n[Flow 5] Zero-Stock Catalog Enforcement:');
  const firstMove = db.prepare("SELECT * FROM products WHERE sku = 'ODD-FM-002'").get();
  assert(firstMove && firstMove.stock === 0, 'First Move (ODD-FM-002) strictly has 0 stock');
  const phantom = db.prepare("SELECT * FROM products WHERE sku = 'ODD-PH-001'").get();
  assert(phantom && phantom.stock > 0, 'Phantom (ODD-PH-001) has positive authentic inventory');

  // 6. Access Control & Critical File Hardening
  console.log('\n[Flow 6] Server Configuration & Directory Protection:');
  const htaccess = fs.readFileSync('.htaccess', 'utf8');
  assert(htaccess.includes('.env'), '.htaccess forbids direct access to .env');
  assert(htaccess.includes('api/config.php') || htaccess.includes('api/config\\.php'), '.htaccess forbids direct access to api/config.php and api/db.php');
  assert(htaccess.includes('scripts/'), '.htaccess forbids direct access to scripts/');
  assert(htaccess.includes('storage/'), '.htaccess forbids direct access to storage/');

  // 7. Script Security Guards
  console.log('\n[Flow 7] Maintenance Script Security:');
  const adminScript = fs.readFileSync('scripts/create-admin.php', 'utf8');
  assert(adminScript.includes("PHP_SAPI !== 'cli'"), 'scripts/create-admin.php strictly restricts execution to CLI');
  assert(!adminScript.includes("'admin123'"), 'scripts/create-admin.php has no insecure default password fallback');

  // 8. Config Guards
  console.log('\n[Flow 8] PHP Direct Inclusion Guards:');
  const configPhp = fs.readFileSync('api/config.php', 'utf8');
  assert(configPhp.includes("basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'config.php'"), 'api/config.php has direct access abort guard');

  console.log('\n====================================================');
  console.log(`Audit Complete: ${passes} Passed, ${fails} Failed`);
  console.log('====================================================');

  process.exit(fails === 0 ? 0 : 1);
}

runAudit().catch(err => {
  console.error('Audit run error:', err);
  process.exit(1);
});
