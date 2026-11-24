'use strict';

/**
 * ODD Perfumes — Automated Verification & Integration Test Suite
 * Validates:
 * 1. Server initialization & DB schema
 * 2. Authentic Catalogue & Zero-Stock rule for First Move
 * 3. Secure Staff Authentication & Session/CSRF management
 * 4. RBAC Permission enforcement
 * 5. Out-of-Stock Checkout Rejection & Atomic Stock Deduction
 * 6. Order Cancellation & Atomic Stock Restoration
 * 7. Coupon validation, usage restrictions & discount calculation
 * 8. Order Tracking & PII protection
 * 9. Barcode unique serial generation & scanner operations
 * 10. Payment Dashboard reconciliation
 */

process.env.NODE_ENV = 'test';
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const EventEmitter = require('node:events');
const { server, db } = require('../server.js');

const TEST_PORT = 5599;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) { json = body; }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('Starting ODD Perfumes Automated Test Suite');
  console.log('====================================================');

  await new Promise(res => server.listen(TEST_PORT, '127.0.0.1', res));

  try {
    // 1. Catalogue & Zero Stock Rule
    console.log('\n[1] Testing Product Catalogue & Documented Zero-Stock Rule:');
    const prodRes = await request('/api/products');
    assert(prodRes.status === 200, 'GET /api/products returns HTTP 200');
    assert(Array.isArray(prodRes.data.products), 'Products array returned');
    const firstMove = prodRes.data.products.find(p => p.sku === 'ODD-FM-002');
    assert(firstMove && firstMove.stock === 0, 'First Move strictly has 0 stock (zero-stock rule verified)');
    const phantom = prodRes.data.products.find(p => p.sku === 'ODD-PH-001');
    assert(phantom && phantom.stock > 0, 'Phantom has authentic positive inventory');

    // 2. Authentication & Security
    console.log('\n[2] Testing Staff Authentication, Passwords & Sessions:');
    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@oddperfume.com', password: 'WrongPassword123' }
    });
    assert(badLogin.status === 401, 'Invalid password rejected with HTTP 401');

    const goodLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@oddperfume.com', password: 'ODDAdmin2026!Secure' }
    });
    assert(goodLogin.status === 200, 'Valid credentials authenticate successfully with HTTP 200');
    assert(goodLogin.data.authenticated === true, 'Returns authenticated: true');
    assert(goodLogin.data.csrfToken, 'Issues cryptographic CSRF token');

    const cookieHeader = goodLogin.headers['set-cookie'];
    assert(cookieHeader && cookieHeader[0].includes('odd_admin_session'), 'Sets HttpOnly session cookie');
    const sessionCookie = cookieHeader[0].split(';')[0];
    const csrfToken = goodLogin.data.csrfToken;

    // Check session route
    const sessionCheck = await request('/api/auth/session', {
      headers: { Cookie: sessionCookie }
    });
    assert(sessionCheck.status === 200 && sessionCheck.data.user.role === 'admin', 'GET /api/auth/session returns active staff profile');

    // 3. RBAC & CSRF Protection
    console.log('\n[3] Testing CSRF & RBAC Permissions:');
    const writeWithoutCsrf = await request('/api/coupons', {
      method: 'POST',
      headers: { Cookie: sessionCookie },
      body: { code: 'TESTCSRF', discount: 10 }
    });
    assert(writeWithoutCsrf.status === 403, 'POST /api/coupons rejected with HTTP 403 when CSRF token is missing');

    const unauthInventory = await request('/api/inventory');
    assert(unauthInventory.status === 401, 'Unauthenticated access to /api/inventory rejected with HTTP 401');

    // Test Warehouse role isolation: settings and shipping APIs are strictly admin-only
    const crypto = require('node:crypto');
    const whSalt = crypto.randomBytes(16).toString('hex');
    const whScrypt = crypto.scryptSync('WarehousePass123!', whSalt, 64).toString('hex');
    const warehouseHash = `${whSalt}:${whScrypt}`;
    try {
      db.prepare(`
        INSERT INTO staff (name, email, password_hash, role, active)
        VALUES ('Warehouse Operator', 'warehouse.tester@oddperfume.com', ?, 'warehouse', 1)
        ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'warehouse', active = 1
      `).run(warehouseHash);
    } catch (_) {}

    const whLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'warehouse.tester@oddperfume.com', password: 'WarehousePass123!' }
    });
    assert(whLogin.status === 200, 'Warehouse staff authenticates with HTTP 200');
    const whCookie = whLogin.headers['set-cookie'] ? whLogin.headers['set-cookie'][0].split(';')[0] : '';
    const whCsrf = whLogin.data.csrfToken;

    const whInventory = await request('/api/inventory', {
      headers: { Cookie: whCookie }
    });
    assert(whInventory.status === 200, 'Warehouse staff role can read inventory (HTTP 200)');

    const whSettingsShiprocket = await request('/api/settings/shiprocket', {
      headers: { Cookie: whCookie }
    });
    assert(whSettingsShiprocket.status === 403, 'Warehouse staff blocked from reading Shiprocket settings (HTTP 403)');

    const whSettingsSmtp = await request('/api/settings/smtp', {
      headers: { Cookie: whCookie }
    });
    assert(whSettingsSmtp.status === 403, 'Warehouse staff blocked from reading SMTP settings (HTTP 403)');

    const whSettingsRazorpay = await request('/api/settings/razorpay', {
      headers: { Cookie: whCookie }
    });
    assert(whSettingsRazorpay.status === 403, 'Warehouse staff blocked from reading Razorpay settings (HTTP 403)');

    const whCreateLabel = await request('/api/shipping/shiprocket/create-label', {
      method: 'POST',
      headers: { Cookie: whCookie, 'X-CSRF-Token': whCsrf },
      body: { orderId: 'ODD-00001' }
    });
    assert(whCreateLabel.status === 403, 'Warehouse staff blocked from Shiprocket label creation API (HTTP 403)');

    const whSaveBanner = await request('/api/settings/banner', {
      method: 'POST',
      headers: { Cookie: whCookie, 'X-CSRF-Token': whCsrf },
      body: { active: true, text: 'Hacked' }
    });
    assert(whSaveBanner.status === 403, 'Warehouse staff blocked from modifying Settings & Marketing banner (HTTP 403)');

    // 4. Coupon Validation & Checkout Calculation
    console.log('\n[4] Testing Coupon Validation & Server-Side Calculations:');
    const couponVal = await request('/api/coupons/validate', {
      method: 'POST',
      body: { code: 'LAUNCH20', subtotal: 1000 }
    });
    assert(couponVal.status === 200 && couponVal.data.valid === true, 'Coupon LAUNCH20 is valid');
    assert(couponVal.data.discountAmount === 200, 'Calculates exact 20% discount (₹200 on ₹1000)');

    const badCoupon = await request('/api/coupons/validate', {
      method: 'POST',
      body: { code: 'NONEXISTENT99', subtotal: 1000 }
    });
    assert(badCoupon.status === 400 && badCoupon.data.valid === false, 'Invalid coupon rejected');

    // 5. Checkout Out-of-Stock Prevention
    console.log('\n[5] Testing Out-of-Stock Order Rejection:');
    const oosOrder = await request('/api/orders', {
      method: 'POST',
      body: {
        customer: 'Ayan Tester',
        email: 'ayan@oddperfume.com',
        phone: '+91 98200 11223',
        address: 'Bandra West, Mumbai',
        items: [{ sku: 'ODD-FM-002', qty: 1 }],
        paymentMethod: 'Cash on Delivery (COD)'
      }
    });
    assert(oosOrder.status === 400, 'Checkout of out-of-stock First Move rejected with HTTP 400');
    assert(oosOrder.data.error.includes('out of stock'), 'Error message clearly specifies product is out of stock');

    // 6. Successful Order Placement & Atomic Stock Deduction
    console.log('\n[6] Testing Atomic Order Creation & Inventory Deduction:');
    const initialPhantomStock = phantom.stock;
    const validOrder = await request('/api/orders', {
      method: 'POST',
      body: {
        customer: 'Rohan Sharma',
        email: 'rohan.sharma@gmail.com',
        phone: '+91 99887 76655',
        address: 'Flat 402, Sea Green Apartments, Worli, Mumbai - 400018',
        items: [{ sku: 'ODD-PH-001', qty: 2 }],
        couponCode: 'LAUNCH20',
        paymentMethod: 'Cash on Delivery (COD)'
      }
    });
    assert(validOrder.status === 201, 'Valid COD order created successfully with HTTP 201');
    assert(typeof validOrder.data.mailDispatched === 'boolean', 'Checkout isolates transactional email dispatch and returns mailDispatched flag');
    const createdOrderId = validOrder.data.orderId;
    const trackingToken = validOrder.data.trackingToken;
    assert(createdOrderId && createdOrderId.startsWith('ODD-'), 'Order assigned unique reference ID: ' + createdOrderId);

    // Verify stock deducted
    const checkStock = await request('/api/products');
    const updatedPhantom = checkStock.data.products.find(p => p.sku === 'ODD-PH-001');
    assert(updatedPhantom.stock === initialPhantomStock - 2, `Phantom stock reduced by 2 (${initialPhantomStock} -> ${updatedPhantom.stock})`);

    // 7. Order Tracking
    console.log('\n[7] Testing Order Tracking & PII Protection:');
    const trackByPhone = await request(`/api/orders/track?order=${createdOrderId}&phone=%2B919988776655`);
    assert(trackByPhone.status === 200, 'Order tracking by ID + Phone succeeds with HTTP 200');
    assert(trackByPhone.data.id === createdOrderId, 'Tracking returns correct order ID');
    assert(trackByPhone.data.password === undefined, 'Does not expose sensitive credentials');

    const trackByToken = await request(`/api/orders/track?token=${trackingToken}`);
    assert(trackByToken.status === 200 && trackByToken.data.id === createdOrderId, 'Tracking by secure token succeeds');

    // 8. Order Cancellation & Stock Restoration
    console.log('\n[8] Testing Order Cancellation & Atomic Stock Restoration:');
    const cancelRes = await request(`/api/orders/${createdOrderId}`, {
      method: 'PATCH',
      headers: {
        Cookie: sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: { status: 'Cancelled' }
    });
    assert(cancelRes.status === 200, 'Order cancellation succeeds with HTTP 200');

    const stockAfterCancel = await request('/api/products');
    const restoredPhantom = stockAfterCancel.data.products.find(p => p.sku === 'ODD-PH-001');
    assert(restoredPhantom.stock === initialPhantomStock, `Phantom stock accurately restored (${initialPhantomStock - 2} -> ${restoredPhantom.stock})`);

    // 9. Barcode Batch & Warehouse Scans
    console.log('\n[9] Testing Barcode Serials & Warehouse Scanner:');
    const testLot = '0001';
    const barcodeBatch = await request('/api/barcodes/batch', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: {
        products: [{ sku: 'ODD-LC-003', qty: 3 }],
        lot: testLot,
        mfg: '2026-10-14'
      }
    });
    assert(barcodeBatch.status === 200, 'Barcode batch generation succeeds');
    assert(barcodeBatch.data.labels.length === 3, 'Generates exactly requested 3 labels');
    const firstBarcode = barcodeBatch.data.labels[0].barcode;
    const expectedBatch = (testLot.match(/(\d{1,4})$/) || [null, '0001'])[1].padStart(4, '0');
    assert(firstBarcode === `ODD${expectedBatch}-LC`, 'Formatted to specification: ' + firstBarcode);

    // Test warehouse scan in receive mode (+1)
    const initialLucidStock = db.prepare("SELECT stock FROM products WHERE sku = 'ODD-LC-003'").get().stock;
    const scanReceive = await request('/api/scans', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: { code: firstBarcode, mode: 'receive' }
    });
    assert(scanReceive.status === 200, 'Warehouse scan in receive mode succeeds');
    assert(scanReceive.data.isBarcode === true, 'Scanner identifies registered barcode serial');
    assert(scanReceive.data.serial === firstBarcode, 'Scanner returns exact scanned serial number');
    assert(scanReceive.data.lot != null, 'Scanner returns batch lot number');
    assert(scanReceive.data.expiry != null, 'Scanner returns batch expiry date');

    const stockAfterScan = db.prepare("SELECT stock FROM products WHERE sku = 'ODD-LC-003'").get().stock;
    assert(stockAfterScan === initialLucidStock + 1, `Lucid stock incremented by 1 (${initialLucidStock} -> ${stockAfterScan})`);

    // Test warehouse dispatch scan on the same serial (decrements stock by 1)
    const scanDispatch = await request('/api/scans', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: { code: firstBarcode, mode: 'dispatch' }
    });
    assert(scanDispatch.status === 200, 'Warehouse scan in dispatch mode succeeds');
    assert(scanDispatch.data.serial === firstBarcode, 'Dispatch scanner returns matching serial number');
    const stockAfterDispatch = db.prepare("SELECT stock FROM products WHERE sku = 'ODD-LC-003'").get().stock;
    assert(stockAfterDispatch === initialLucidStock, `Lucid stock decremented back to baseline (${stockAfterScan} -> ${stockAfterDispatch})`);

    // Verify GET /api/barcodes endpoint
    const barcodesList = await request('/api/barcodes', {
      headers: { Cookie: sessionCookie }
    });
    assert(barcodesList.status === 200, 'GET /api/barcodes returns HTTP 200');
    assert(Array.isArray(barcodesList.data.barcodes) && barcodesList.data.barcodes.length > 0, 'GET /api/barcodes returns registered retail barcodes list');

    // Test warehouse dispatch scan on 0-stock item (First Move) returns informative 400
    const fmStock = db.prepare("SELECT stock FROM products WHERE sku = 'ODD-FM-002'").get().stock;
    if (fmStock === 0) {
      const scanDispatchZero = await request('/api/scans', {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'X-CSRF-Token': csrfToken
        },
        body: { code: 'ODD-FM-002', mode: 'dispatch' }
      });
      assert(scanDispatchZero.status === 400, 'Dispatch scan on 0-stock item rejected with HTTP 400');
      assert(scanDispatchZero.data.error.includes('Stock is currently 0'), 'Returns clear guidance to switch to Receive mode');
    }

    // Test scan on unknown order ID
    const scanUnknownOrder = await request('/api/scans', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: { code: 'ODD-739182', mode: 'dispatch' }
    });
    assert(scanUnknownOrder.status === 404, 'Scan of non-existent order returns HTTP 404');
    assert(scanUnknownOrder.data.error.includes('not found in the database'), 'Returns specific order not found message');

    // 10. Payment Dashboard Summary
    console.log('\n[10] Testing Payment Dashboard Reconciliation:');
    const paySummary = await request('/api/payments/summary', {
      headers: { Cookie: sessionCookie }
    });
    assert(paySummary.status === 200, 'GET /api/payments/summary succeeds');
    assert(typeof paySummary.data.totalOrders === 'number', 'Reports total orders count');
    assert(Array.isArray(paySummary.data.recentOrders), 'Returns recent transactions list for dashboard table');

    // 11. Testing Hardened Security Controls
    console.log('\n[11] Testing Hardened Security Controls:');
    const unauthLabel = await request('/api/shipping/shiprocket/create-label', {
      method: 'POST',
      body: { orderId: 'ODD-00001' }
    });
    assert(unauthLabel.status === 401, 'Unauthenticated Shiprocket create-label rejected with HTTP 401');

    const unauthGetShiprocket = await request('/api/settings/shiprocket');
    assert(unauthGetShiprocket.status === 401, 'Unauthenticated GET /api/settings/shiprocket rejected with HTTP 401');

    const unauthPostShiprocket = await request('/api/settings/shiprocket', {
      method: 'POST',
      body: { password: 'hacked' }
    });
    assert(unauthPostShiprocket.status === 401, 'Unauthenticated POST /api/settings/shiprocket rejected with HTTP 401');

    const unauthPostShipping = await request('/api/settings/shipping', {
      method: 'POST',
      body: { standardRate: 0 }
    });
    assert(unauthPostShipping.status === 401, 'Unauthenticated POST /api/settings/shipping rejected with HTTP 401');

    const enumOrder = await request('/api/orders/track?order=ODD-00001');
    assert(enumOrder.status === 404, 'Public order tracking by ID alone without phone rejected with HTTP 404');

    // 12. Testing Dynamic Customer & Coupons API
    console.log('\n[12] Testing Dynamic Customer & Coupons API:');
    const pubCoupons = await request('/api/coupons/active');
    assert(pubCoupons.status === 200, 'GET /api/coupons/active succeeds with HTTP 200');
    assert(Array.isArray(pubCoupons.data.coupons), 'Returns active coupons array from database');
    assert(pubCoupons.data.coupons.some(c => c.code === 'LAUNCH20'), 'Active coupons list contains LAUNCH20');

    const custOrders = await request('/api/customer/orders?email=rahul.verma@example.com');
    assert(custOrders.status === 200, 'GET /api/customer/orders succeeds with HTTP 200');
    assert(Array.isArray(custOrders.data.orders), 'Returns customer orders array');

    const emptyCustOrders = await request('/api/customer/orders?email=nonexistent@example.com');
    assert(emptyCustOrders.status === 200, 'GET /api/customer/orders for unknown user returns HTTP 200');
    assert(Array.isArray(emptyCustOrders.data.orders) && emptyCustOrders.data.orders.length === 0, 'Returns clean empty orders array when no database records match');

    // 13. Testing Customer Authentication & Delivery Addresses API
    console.log('\n[13] Testing Customer Accounts & Database Addresses API:');
    const custEmail = `cust_${Date.now()}@oddperfume.com`;
    const regRes = await request('/api/customer/register', {
      method: 'POST',
      body: {
        name: 'Ayan Perfumer',
        email: custEmail,
        phone: '9930458591',
        password: 'SecureCustomerPass123!'
      }
    });
    assert(regRes.status === 201, 'POST /api/customer/register creates account with HTTP 201');
    assert(regRes.data.authenticated === true || regRes.data.success === true, 'Registration returns authenticated customer payload');
    
    const custSetCookie = regRes.headers['set-cookie'];
    assert(custSetCookie && custSetCookie[0].includes('odd_customer_session'), 'Registration issues persistent odd_customer_session cookie');
    const custCookie = custSetCookie ? custSetCookie[0].split(';')[0] : '';

    const addAddrRes = await request('/api/customer/addresses', {
      method: 'POST',
      headers: { Cookie: custCookie },
      body: {
        name: 'Ayan Perfumer',
        street: '76A, Edu Manzil, Shop No 1, Near Paradise Cinemas',
        city: 'Mumbai',
        pin: '400016',
        phone: '9930458591'
      }
    });
    assert(addAddrRes.status === 201, 'POST /api/customer/addresses persists address with HTTP 201');

    const getAddrsRes = await request('/api/customer/addresses', {
      headers: { Cookie: custCookie }
    });
    assert(getAddrsRes.status === 200, 'GET /api/customer/addresses returns HTTP 200');
    assert(Array.isArray(getAddrsRes.data.addresses) && getAddrsRes.data.addresses.length >= 1, 'Returns saved addresses list from database');
    assert(getAddrsRes.data.addresses[0].city === 'Mumbai', 'Saved address maintains exact data attributes');

    const custSessRes = await request('/api/customer/session', {
      headers: { Cookie: custCookie }
    });
    assert(custSessRes.status === 200, 'GET /api/customer/session succeeds with HTTP 200');
    assert(custSessRes.data.authenticated === true, 'Session is verified as authenticated customer');
    assert(custSessRes.data.customer.email === custEmail, 'Session belongs to registered customer');

    const custLogoutRes = await request('/api/customer/logout', {
      method: 'POST',
      headers: { Cookie: custCookie }
    });
    assert(custLogoutRes.status === 200, 'POST /api/customer/logout clears session with HTTP 200');

    // 14. Testing Dynamic Customer Order Retrieval & Formatted Phone Queries (R3)
    console.log('\n[14] Testing Dynamic Customer Order History & Phone Queries (R3):');
    const custOrdersByEmail = await request('/api/customer/orders?email=rohan.sharma@gmail.com');
    assert(custOrdersByEmail.status === 200, 'GET /api/customer/orders?email returns HTTP 200');
    assert(Array.isArray(custOrdersByEmail.data.orders) && custOrdersByEmail.data.orders.length > 0, 'Retrieves authentic database orders for Rohan Sharma');

    // Contract parity verification
    const sampleOrder = custOrdersByEmail.data.orders[0];
    assert(sampleOrder.orderId && sampleOrder.order_id, 'Order payload contains both camelCase (orderId) and snake_case (order_id)');
    assert(sampleOrder.totalAmount !== undefined && sampleOrder.total_amount !== undefined, 'Order payload contains both totalAmount and total_amount');
    assert(sampleOrder.customerPhone !== undefined && sampleOrder.customer_phone !== undefined, 'Order payload contains both customerPhone and customer_phone');
    assert(sampleOrder.shippingAddress !== undefined && sampleOrder.shipping_address !== undefined, 'Order payload contains both shippingAddress and shipping_address');
    assert(sampleOrder.paymentMethod !== undefined && sampleOrder.payment_method !== undefined, 'Order payload contains both paymentMethod and payment_method');
    assert(Array.isArray(sampleOrder.items) && sampleOrder.items.length > 0, 'Order contains populated line items');
    assert(sampleOrder.items[0].productName && sampleOrder.items[0].product_name, 'Line items contain both productName and product_name');
    assert(sampleOrder.items[0].itemTotal !== undefined && sampleOrder.items[0].item_total !== undefined, 'Line items contain both itemTotal and item_total');

    // Phone queries with diverse formatting: +91-99887-76655, (998) 877-6655, spaces, raw 10 digits
    const custOrdersByFormattedPhone = await request('/api/customer/orders?phone=%2B91-99887-76655');
    assert(custOrdersByFormattedPhone.status === 200, 'GET /api/customer/orders?phone=+91-99887-76655 returns HTTP 200');
    assert(Array.isArray(custOrdersByFormattedPhone.data.orders) && custOrdersByFormattedPhone.data.orders.length > 0, 'Retrieves orders matching formatted phone (+91-99887-76655)');

    const custOrdersByParenPhone = await request('/api/customer/orders?phone=%28998%29%20877-6655');
    assert(custOrdersByParenPhone.status === 200, 'GET /api/customer/orders?phone=(998) 877-6655 returns HTTP 200');
    assert(Array.isArray(custOrdersByParenPhone.data.orders) && custOrdersByParenPhone.data.orders.length > 0, 'Retrieves orders matching formatted phone with parentheses ((998) 877-6655)');

    const custOrdersByRawPhone = await request('/api/customer/orders?phone=9988776655');
    assert(custOrdersByRawPhone.status === 200, 'GET /api/customer/orders?phone=9988776655 returns HTTP 200');
    assert(Array.isArray(custOrdersByRawPhone.data.orders) && custOrdersByRawPhone.data.orders.length > 0, 'Retrieves orders matching 10-digit phone (9988776655)');

    const custOrdersMismatchPhone = await request('/api/customer/orders?phone=1112223333');
    assert(custOrdersMismatchPhone.status === 200, 'GET /api/customer/orders?phone=1112223333 returns HTTP 200');
    assert(Array.isArray(custOrdersMismatchPhone.data.orders) && custOrdersMismatchPhone.data.orders.length === 0, 'Returns clean empty orders array for non-existent phone');

    // 15. Testing SMTP Configuration, Mail Logging & Contact Inquiries (R2)
    console.log('\n[15] Testing SMTP Settings, Mail Logging & Contact Dispatch (R2):');
    const getSmtpRes = await request('/api/settings/smtp', {
      headers: { Cookie: sessionCookie }
    });
    assert(getSmtpRes.status === 200, 'GET /api/settings/smtp returns HTTP 200');
    assert(getSmtpRes.data && getSmtpRes.data.smtp !== undefined, 'Returns SMTP configuration payload from database');

    // Test contact message dispatch with backup inquiry JSON and logging
    const contactRes = await request('/api/contact', {
      method: 'POST',
      body: {
        name: 'Ayan Verification',
        email: 'ayan.audit@oddperfume.com',
        phone: '+91 99304 58591',
        subject: 'Wholesale Fragrance Inquiry',
        message: 'Requesting verification of transactional mail dispatch subsystem and inquiry archival.'
      }
    });
    assert(contactRes.status === 200, 'POST /api/contact succeeds with HTTP 200');
    assert(contactRes.data.success === true, 'Contact submission returns success: true');
    assert(typeof contactRes.data.mailDispatched === 'boolean', 'Contact submission returns authentic mailDispatched boolean flag');

    // Verify storage/inquiries backup directory and files
    const inquiriesDir = path.join(__dirname, '../storage/inquiries');
    assert(fs.existsSync(inquiriesDir), 'Inquiries storage directory exists (storage/inquiries)');
    const inquiryFiles = fs.readdirSync(inquiriesDir);
    assert(inquiryFiles.length > 0, 'Inquiry JSON backup created in storage/inquiries');

    // Verify storage/logs/mail.log exists and contains log entries
    const mailLogPath = path.join(__dirname, '../storage/logs/mail.log');
    assert(fs.existsSync(mailLogPath), 'Mail operation log exists (storage/logs/mail.log)');
    const mailLogContent = fs.readFileSync(mailLogPath, 'utf8');
    assert(mailLogContent.includes('INFO') || mailLogContent.includes('WARN') || mailLogContent.includes('ERROR'), 'Mail log contains structured log entries');

    // Test SMTP test email endpoint
    const testSmtpRes = await request('/api/settings/smtp/test', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: {
        to: 'audit@oddperfume.com'
      }
    });
    assert(typeof testSmtpRes.data.success === 'boolean', 'POST /api/settings/smtp/test reports honest success/error boolean without crashing');

    // 16. Testing Shiprocket Order Integration, Wallet Error Detection & Retry Logic (R1)
    console.log('\n[16] Testing Shiprocket Order Integration & Error Detection (R1):');
    const adminOrdersRes = await request('/api/orders', {
      headers: { Cookie: sessionCookie }
    });
    assert(adminOrdersRes.status === 200, 'GET /api/orders returns HTTP 200');
    assert(Array.isArray(adminOrdersRes.data.orders), 'Returns orders array for admin management');
    const adminOrder = adminOrdersRes.data.orders[0];
    assert('shiprocket_order_id' in adminOrder && 'shiprocketOrderId' in adminOrder, 'Admin order model includes shiprocket_order_id and camelCase alias');
    assert('shiprocket_shipment_id' in adminOrder && 'shiprocketShipmentId' in adminOrder, 'Admin order model includes shiprocket_shipment_id and camelCase alias');
    assert('shiprocket_status' in adminOrder && 'shiprocketStatus' in adminOrder, 'Admin order model includes shiprocket_status and camelCase alias');

    // Intercept https.request for Shiprocket API simulations
    const originalHttpsRequest = https.request;
    const originalSrToken = process.env.SHIPROCKET_TOKEN;
    process.env.SHIPROCKET_TOKEN = 'mock-shiprocket-jwt-token';
    let createAdhocCalledCount = 0;
    let assignAwbCalledCount = 0;
    let simulateWalletError = true;

    https.request = function(opts, cb) {
      const hostname = (typeof opts === 'string' ? new URL(opts).hostname : opts?.hostname) || '';
      if (hostname === 'apiv2.shiprocket.in') {
        const req = new EventEmitter();
        req.write = () => {};
        req.destroy = () => {};
        req.setTimeout = () => {};
        req.end = () => {
          process.nextTick(() => {
            const res = new EventEmitter();
            res.statusCode = 200;
            res.headers = { 'content-type': 'application/json' };
            if (cb) cb(res);
            process.nextTick(() => {
              const pathStr = opts.path || '';
              if (pathStr.includes('/auth/login')) {
                res.emit('data', JSON.stringify({ token: 'mock-shiprocket-jwt-token' }));
              } else if (pathStr.includes('/orders/create/adhoc')) {
                createAdhocCalledCount++;
                res.emit('data', JSON.stringify({
                  order_id: 88776655,
                  shipment_id: 44332211,
                  status: 'NEW',
                  status_code: 1
                }));
              } else if (pathStr.includes('/courier/assign/awb')) {
                assignAwbCalledCount++;
                if (simulateWalletError) {
                  res.emit('data', JSON.stringify({
                    response: {
                      data: {
                        awb_assign_error: 'Insufficient balance in wallet. Minimum recharge of Rs 500 required.'
                      }
                    }
                  }));
                } else {
                  res.emit('data', JSON.stringify({
                    response: {
                      data: {
                        awb_code: 'SR-AWB-99887711',
                        courier_name: 'Blue Dart Surface'
                      }
                    }
                  }));
                }
              } else if (pathStr.includes('/courier/generate/label')) {
                res.emit('data', JSON.stringify({
                  label_created: 1,
                  label_url: 'https://shiprocket.co/labels/audit-label.pdf'
                }));
              } else {
                res.emit('data', JSON.stringify({}));
              }
              res.emit('end');
            });
          });
        };
        return req;
      }
      return originalHttpsRequest.apply(https, arguments);
    };

    try {
      // Create a dedicated order for Shiprocket integration test
      const srTestOrder = await request('/api/orders', {
        method: 'POST',
        body: {
          customer: 'Shiprocket Test User',
          email: 'sr.test@example.com',
          phone: '+91 99887 76655',
          address: 'Shop 1, Khar West, Mumbai - 400052',
          items: [{ sku: 'ODD-PH-001', qty: 1 }],
          paymentMethod: 'Cash on Delivery (COD)'
        }
      });
      assert(srTestOrder.status === 201, 'Creates dedicated test order for Shiprocket workflow');
      const srOrderId = srTestOrder.data.orderId;

      // Attempt 1: Shiprocket label creation encountering wallet recharge requirement
      simulateWalletError = true;
      const srAttempt1 = await request('/api/shipping/shiprocket/create-label', {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'X-CSRF-Token': csrfToken
        },
        body: { orderId: srOrderId }
      });

      assert(srAttempt1.status === 400, 'Shiprocket wallet recharge requirement returns HTTP 400');
      assert(srAttempt1.data.wallet_recharge_required === true, 'Response contains wallet_recharge_required: true flag');
      assert(srAttempt1.data.error.includes('wallet recharge required') || srAttempt1.data.error.includes('insufficient wallet balance'), 'Descriptive error guides admin to recharge Shiprocket wallet');
      assert(createAdhocCalledCount === 1, 'Shiprocket orders/create/adhoc was executed exactly once');

      // Verify immediate persistence of shiprocket_order_id, shiprocket_shipment_id, and AWB_PENDING
      const checkPendingOrder = db.prepare('SELECT shiprocket_order_id, shiprocket_shipment_id, shiprocket_status FROM orders WHERE id = ?').get(srOrderId);
      assert(checkPendingOrder.shiprocket_order_id === '88776655', 'Persisted shiprocket_order_id (88776655) immediately upon adhoc creation');
      assert(checkPendingOrder.shiprocket_shipment_id === '44332211', 'Persisted shiprocket_shipment_id (44332211) immediately');
      assert(checkPendingOrder.shiprocket_status === 'AWB_PENDING', 'Persisted shiprocket_status as AWB_PENDING');

      // Attempt 2: Retry with wallet funded - verify orders/create/adhoc is SKIPPED (idempotent shipment reuse)
      simulateWalletError = false;
      const srAttempt2 = await request('/api/shipping/shiprocket/create-label', {
        method: 'POST',
        headers: {
          Cookie: sessionCookie,
          'X-CSRF-Token': csrfToken
        },
        body: { orderId: srOrderId }
      });

      assert(srAttempt2.status === 200, 'Retry after wallet recharge succeeds with HTTP 200');
      assert(srAttempt2.data.success === true, 'Returns success: true upon AWB assignment & label generation');
      assert(srAttempt2.data.trackingNumber === 'SR-AWB-99887711', 'Assigns courier AWB tracking code');
      assert(createAdhocCalledCount === 1, 'Shiprocket orders/create/adhoc was NOT re-called on retry (shipment ID reused)');
      assert(assignAwbCalledCount === 2, 'Proceeded directly to AWB assignment on retry');

      // Verify order status updated to Dispatched in DB
      const checkDispatchedOrder = db.prepare('SELECT status, shiprocket_status, tracking_number FROM orders WHERE id = ?').get(srOrderId);
      assert(checkDispatchedOrder.status === 'Dispatched', 'Order status updated to Dispatched');
      assert(['DISPATCHED', 'AWB_ASSIGNED'].includes(checkDispatchedOrder.shiprocket_status), 'Shiprocket status updated to DISPATCHED / AWB_ASSIGNED');
      assert(checkDispatchedOrder.tracking_number === 'SR-AWB-99887711', 'Tracking number persisted in database');

    } finally {
      // Restore original https.request and env
      https.request = originalHttpsRequest;
      if (originalSrToken) {
        process.env.SHIPROCKET_TOKEN = originalSrToken;
      } else {
        delete process.env.SHIPROCKET_TOKEN;
      }
    }

    // 17. Testing Schema Parity & Backend Response Models (R4)
    console.log('\n[17] Testing Schema Parity & Backend Response Contracts (R4):');
    const tableColumns = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
    const requiredColumns = [
      'courier_name',
      'tracking_number',
      'tracking_url',
      'label_url',
      'shiprocket_order_id',
      'shiprocket_shipment_id',
      'shiprocket_status'
    ];
    for (const col of requiredColumns) {
      assert(tableColumns.includes(col), `SQLite orders table contains required column: ${col}`);
    }

    // Parity of customer session response
    assert(regRes.data.authenticated === true, 'Customer registration response guarantees authenticated: true');
    assert(custSessRes.data.authenticated === true, 'Customer session response guarantees authenticated: true');

    // Parity of customer address fields (street/address_line and pin/pincode)
    const checkAddr = getAddrsRes.data.addresses[0];
    assert(checkAddr.street && checkAddr.address_line, 'Customer address payload contains both street and address_line aliases');
    assert(checkAddr.pin && checkAddr.pincode, 'Customer address payload contains both pin and pincode aliases');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
    console.log('\n====================================================');
    console.log(`Test Suite Completed: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');
    if (failed > 0) process.exit(1);
  }
}

runTests();
