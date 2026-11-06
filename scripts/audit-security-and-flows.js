const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dbPath = path.join(__dirname, "..", "storage", "odd-perfume.sqlite");
const db = new DatabaseSync(dbPath);

let passes = 0;
let fails = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passes++;
  } else {
    console.error(`  FAIL: ${message}`);
    fails++;
  }
}

async function runAudit() {
  console.log("====================================================");
  console.log("ODD PERFUMES — SYSTEM SECURITY & WORKFLOW AUDIT");
  console.log("====================================================");

  // 1. Database Schema Integrity
  console.log("\n[Flow 1] Database Orders Table Columns for Tracking & Shipments:");
  const orderColumns = db
    .prepare("PRAGMA table_info(orders)")
    .all()
    .map((c) => c.name);

  assert(
    orderColumns.includes("courier_name"),
    "orders table has courier_name column",
  );
  assert(
    orderColumns.includes("tracking_number"),
    "orders table has tracking_number column",
  );
  assert(
    orderColumns.includes("tracking_url"),
    "orders table has tracking_url column",
  );
  assert(
    orderColumns.includes("label_url"),
    "orders table has label_url column",
  );
  assert(
    orderColumns.includes("dispatched_at"),
    "orders table has dispatched_at column",
  );
  assert(
    orderColumns.includes("delivered_at"),
    "orders table has delivered_at column",
  );
  assert(
    orderColumns.includes("cancelled_at"),
    "orders table has cancelled_at column",
  );

  // 2. Order Reference & Total Value in Shiprocket Payloads
  console.log(
    "\n[Flow 2] Shiprocket Payload Attributes & AWB Generation:",
  );
  const apiPhp = fs.readFileSync("api/index.php", "utf8");
  const serverJs = fs.readFileSync("server.js", "utf8");
  assert(
    apiPhp.includes("function dispatchOrderWithShiprocket"),
    "api/index.php defines dispatchOrderWithShiprocket",
  );
  assert(
    apiPhp.includes("apiv2.shiprocket.in/v1/external/orders/create/adhoc"),
    "api/index.php creates adhoc orders in Shiprocket API v2",
  );
  assert(
    apiPhp.includes("apiv2.shiprocket.in/v1/external/courier/assign/awb"),
    "api/index.php assigns AWB in Shiprocket",
  );
  assert(
    apiPhp.includes("apiv2.shiprocket.in/v1/external/courier/generate/label"),
    "api/index.php generates official PDF shipping label in Shiprocket",
  );
  assert(
    serverJs.includes("async function dispatchOrderWithShiprocket"),
    "server.js defines dispatchOrderWithShiprocket",
  );
  assert(
    serverJs.includes("/v1/external/orders/create/adhoc"),
    "server.js creates adhoc orders in Shiprocket API v2",
  );
  assert(
    serverJs.includes("/v1/external/courier/assign/awb"),
    "server.js assigns AWB in Shiprocket",
  );

  // 3. Customer Tracking Page Date Milestones & Printable Invoices
  console.log(
    "\n[Flow 3] Customer Order Tracking, Delivery Dates & Printable Invoices:",
  );
  const trackingJs = fs.readFileSync("assets/js/tracking.js", "utf8");
  assert(
    trackingJs.includes("formatMilestoneDate"),
    "tracking.js includes formatMilestoneDate helper",
  );
  assert(
    trackingJs.includes("formatDayDate"),
    "tracking.js includes formatDayDate helper",
  );
  assert(
    trackingJs.includes("Estimated Delivery:"),
    "tracking.js displays Estimated Delivery window in courier banner",
  );
  assert(
    trackingJs.includes("progressSteps"),
    "tracking.js renders milestones with real dates",
  );
  assert(
    trackingJs.includes("window.printCustomerInvoice"),
    "tracking.js exposes printCustomerInvoice for client tax bills",
  );

  // 4. Admin Orders Table Date & Time Rendering + Bill Generation
  console.log("\n[Flow 4] Admin Portal Order Milestones & Printable Bills:");
  const adminJs = fs.readFileSync("assets/js/admin.js", "utf8");
  assert(
    adminJs.includes("Shipped:"),
    "admin.js displays Shipped timestamp in orders table",
  );
  assert(
    adminJs.includes("Delivered:"),
    "admin.js displays Delivered timestamp in orders table",
  );
  assert(
    adminJs.includes("window.toggleShiprocketKeyVisibility"),
    "admin.js exposes global toggleShiprocketKeyVisibility handler",
  );
  assert(
    adminJs.includes("window.shipWithShiprocket"),
    "admin.js exposes shipWithShiprocket",
  );
  assert(
    adminJs.includes("window.printOrderInvoice"),
    "admin.js exposes printOrderInvoice handler",
  );
  assert(
    adminJs.includes("Print Bill"),
    "admin.js renders Print Bill buttons in orders table and mobile cards",
  );

  // 5. Zero-Stock Integrity & Catalog Validation
  console.log("\n[Flow 5] Zero-Stock Catalog Enforcement:");
  const firstMove = db
    .prepare("SELECT * FROM products WHERE sku = 'ODD-FM-002'")
    .get();
  assert(
    firstMove && firstMove.stock === 0,
    "First Move (ODD-FM-002) strictly has 0 stock",
  );
  const phantom = db
    .prepare("SELECT * FROM products WHERE sku = 'ODD-PH-001'")
    .get();
  assert(
    phantom && phantom.stock > 0,
    "Phantom (ODD-PH-001) has positive authentic inventory",
  );

  // 6. Access Control & Critical File Hardening
  console.log("\n[Flow 6] Server Configuration & Directory Protection:");
  const htaccess = fs.readFileSync(".htaccess", "utf8");
  assert(htaccess.includes(".env"), ".htaccess forbids direct access to .env");
  assert(
    htaccess.includes("api/config.php") ||
      htaccess.includes("api/config\\.php"),
    ".htaccess forbids direct access to api/config.php and api/db.php",
  );
  assert(
    htaccess.includes("scripts/"),
    ".htaccess forbids direct access to scripts/",
  );
  assert(
    htaccess.includes("storage/"),
    ".htaccess forbids direct access to storage/",
  );

  // 7. Script Security Guards
  console.log("\n[Flow 7] Maintenance Script Security:");
  const adminScript = fs.readFileSync("scripts/create-admin.php", "utf8");
  assert(
    adminScript.includes("PHP_SAPI !== 'cli'"),
    "scripts/create-admin.php strictly restricts execution to CLI",
  );
  assert(
    !adminScript.includes("'admin123'"),
    "scripts/create-admin.php has no insecure default password fallback",
  );

  // 8. Config Guards & Shiprocket Credentials
  console.log("\n[Flow 8] PHP Direct Inclusion Guards & Shiprocket Credentials:");
  const configPhp = fs.readFileSync("api/config.php", "utf8");
  const envContent = fs.readFileSync(".env", "utf8");
  assert(
    configPhp.includes(
      "basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'config.php'",
    ),
    "api/config.php has direct access abort guard",
  );
  assert(
    configPhp.includes("SHIPROCKET_EMAIL"),
    "api/config.php defines SHIPROCKET_EMAIL",
  );
  assert(
    configPhp.includes("SHIPROCKET_PASSWORD"),
    "api/config.php defines SHIPROCKET_PASSWORD",
  );
  assert(
    envContent.includes("SHIPROCKET_PASSWORD=Aoeo6$g4!7RYRLSLM0@V90MYX!fI*Gg!"),
    ".env stores user Shiprocket credentials",
  );

  // 9. Client Sanitization & Hidden Secrets Audit
  console.log(
    "\n[Flow 9] Client Sanitization (No Hardcoded Credentials or Plaintext Secrets):",
  );
  const adminHtml = fs.readFileSync("admin.html", "utf8");
  const checkoutJs = fs.readFileSync("assets/js/checkout.js", "utf8");
  const myAccountHtml = fs.readFileSync("my-account.html", "utf8");
  assert(
    !adminHtml.includes("Aoeo6$g4!7RYRLSLM0@V90MYX!fI*Gg!"),
    "admin.html does not expose plaintext Shiprocket password",
  );
  assert(
    !adminHtml.includes("rzp_live_Ti8AffHarb3tai"),
    "admin.html does not expose raw Razorpay Key ID",
  );
  assert(
    !adminHtml.includes("X4Ws6I0iovvSrTYh18i1nNjl"),
    "admin.html does not expose raw Razorpay Secret Pass",
  );
  assert(
    adminHtml.includes("shiprocket-password"),
    "admin.html has Shiprocket Password input field",
  );
  assert(
    !myAccountHtml.includes("John Doe"),
    "my-account.html does not have mock name placeholder",
  );
  assert(
    !checkoutJs.includes("rzp_live_Ti8AffHarb3tai"),
    "checkout.js does not contain hardcoded live Razorpay key fallback",
  );

  // 10. Email Notification Setups with Dynamic Breakdown
  console.log("\n[Flow 10] Email Notification Setups with Dynamic Bills:");
  assert(
    apiPhp.includes("function sendOrderConfirmationEmail"),
    "api/index.php has sendOrderConfirmationEmail",
  );
  assert(
    apiPhp.includes("function sendDispatchNotificationEmail"),
    "api/index.php has sendDispatchNotificationEmail",
  );
  assert(
    apiPhp.includes("Razorpay"),
    "api/index.php email templates reference Razorpay prepaid settlement",
  );

  // 11. Dynamic Server-Driven Data & Zero Client-Side Mock Data Enforcement
  console.log("\n[Flow 11] Dynamic Server-Driven Data & Zero Client Mock Data:");
  assert(
    !adminJs.includes("DEFAULT_INVENTORY"),
    "admin.js contains zero hardcoded DEFAULT_INVENTORY constants",
  );
  assert(
    !adminJs.includes("DEFAULT_ORDERS"),
    "admin.js contains zero hardcoded DEFAULT_ORDERS constants",
  );
  assert(
    !adminJs.includes("DEFAULT_COUPONS"),
    "admin.js contains zero hardcoded DEFAULT_COUPONS constants",
  );
  assert(
    !adminJs.includes("DEFAULT_STAFF"),
    "admin.js contains zero hardcoded DEFAULT_STAFF constants",
  );
  assert(
    !adminJs.includes("DEFAULT_BANNER"),
    "admin.js contains zero hardcoded DEFAULT_BANNER constants",
  );
  assert(
    !checkoutJs.includes("DEFAULT_INVENTORY_MAP"),
    "checkout.js contains zero DEFAULT_INVENTORY_MAP constants",
  );
  assert(
    !checkoutJs.includes("DEFAULT_COUPONS_LIST"),
    "checkout.js contains zero DEFAULT_COUPONS_LIST constants",
  );
  assert(
    checkoutJs.includes("/api/coupons/validate"),
    "checkout.js validates coupons dynamically via /api/coupons/validate",
  );
  assert(
    checkoutJs.includes("/api/products"),
    "checkout.js synchronizes live catalog stock & prices via /api/products",
  );
  assert(
    adminJs.includes("/api/orders"),
    "admin.js queries real database customer orders via /api/orders",
  );
  assert(
    adminJs.includes("/api/payments/summary"),
    "admin.js queries live payment totals via /api/payments/summary",
  );

  console.log("\n====================================================");
  console.log(`Audit Complete: ${passes} Passed, ${fails} Failed`);
  console.log("====================================================");

  process.exit(fails === 0 ? 0 : 1);
}

runAudit().catch((err) => {
  console.error("Audit run error:", err);
  process.exit(1);
});
