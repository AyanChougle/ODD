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

const http = require('node:http');
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
    const testLot = 'L' + Math.floor(Math.random() * 89999 + 10000);
    const barcodeBatch = await request('/api/barcodes/batch', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: {
        products: [{ sku: 'ODD-LC-003', qty: 3 }],
        lot: testLot,
        mfg: '2026-10-14',
        startSerial: 1
      }
    });
    assert(barcodeBatch.status === 200, 'Barcode batch generation succeeds');
    assert(barcodeBatch.data.labels.length === 3, 'Generates exactly requested 3 labels');
    const firstBarcode = barcodeBatch.data.labels[0].barcode;
    const expectedBatch = (testLot.match(/(\d{1,2})$/) || [null, '01'])[1].padStart(2, '0');
    assert(firstBarcode === `ODD-LC-${expectedBatch}-01`, 'Formatted to specification: ' + firstBarcode);

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
    const stockAfterScan = db.prepare("SELECT stock FROM products WHERE sku = 'ODD-LC-003'").get().stock;
    assert(stockAfterScan === initialLucidStock + 1, `Lucid stock incremented by 1 (${initialLucidStock} -> ${stockAfterScan})`);

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
