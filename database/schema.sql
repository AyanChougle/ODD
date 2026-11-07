-- ============================================================================
-- ODD PERFUMES — PRODUCTION DATABASE SCHEMA (MySQL / MariaDB for Hostinger)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS scans;
DROP TABLE IF EXISTS barcodes;
DROP TABLE IF EXISTS customer_addresses;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS coupon_usages;
DROP TABLE IF EXISTS coupons;
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS products;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Products Catalogue
CREATE TABLE products (
  id VARCHAR(64) PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  price INT NOT NULL DEFAULT 1599,
  original_price INT NULL DEFAULT NULL,
  stock INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  tagline VARCHAR(255),
  notes VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Auditable Inventory Movements
CREATE TABLE inventory_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  delta INT NOT NULL,
  stock_after INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  staff_name VARCHAR(128) DEFAULT 'System',
  order_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_movements_sku (sku),
  INDEX idx_movements_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Coupons Management
CREATE TABLE coupons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  discount_percent INT NOT NULL,
  min_spend INT NOT NULL DEFAULT 0,
  max_discount INT NOT NULL DEFAULT 0,
  max_uses INT NOT NULL DEFAULT 0,
  used_count INT NOT NULL DEFAULT 0,
  per_user_limit INT NOT NULL DEFAULT 1,
  start_date DATETIME NULL,
  expiry_date DATETIME NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coupons_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Coupon Usages
CREATE TABLE coupon_usages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  coupon_code VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_email VARCHAR(191) NOT NULL,
  customer_phone VARCHAR(32) DEFAULT '',
  discount_amount INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usage_email (customer_email, coupon_code),
  INDEX idx_usage_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Orders
CREATE TABLE orders (
  id VARCHAR(64) PRIMARY KEY,
  tracking_token VARCHAR(96) NOT NULL UNIQUE,
  customer_name VARCHAR(191) NOT NULL,
  customer_email VARCHAR(191) NOT NULL,
  customer_phone VARCHAR(32) NOT NULL,
  shipping_address TEXT NOT NULL,
  subtotal INT NOT NULL,
  discount_amount INT NOT NULL DEFAULT 0,
  coupon_code VARCHAR(64) DEFAULT NULL,
  shipping_fee INT NOT NULL DEFAULT 0,
  total_amount INT NOT NULL,
  payment_method VARCHAR(64) NOT NULL,
  payment_status ENUM('Pending', 'Paid', 'Failed', 'Refunded') NOT NULL DEFAULT 'Pending',
  status ENUM('Confirmed', 'Processing', 'Packed', 'Dispatched', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Confirmed',
  gateway VARCHAR(64) NOT NULL,
  razorpay_order_id VARCHAR(128) DEFAULT NULL,
  razorpay_payment_id VARCHAR(128) DEFAULT NULL,
  stock_deducted TINYINT(1) NOT NULL DEFAULT 1,
  dispatched_at DATETIME NULL,
  delivered_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_email (customer_email),
  INDEX idx_orders_phone (customer_phone),
  INDEX idx_orders_status (status),
  INDEX idx_orders_payment (payment_status),
  INDEX idx_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Order Items
CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  price INT NOT NULL,
  quantity INT NOT NULL,
  line_total INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_items_order (order_id),
  INDEX idx_items_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Registered Customers
CREATE TABLE customers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  phone VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Customer Saved Addresses
CREATE TABLE customer_addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(64) NOT NULL,
  label VARCHAR(64) NOT NULL DEFAULT 'Home',
  name VARCHAR(191) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  address_line TEXT NOT NULL,
  city VARCHAR(128) NOT NULL,
  pincode VARCHAR(16) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Staff Accounts & RBAC
CREATE TABLE staff (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'warehouse', 'orders', 'finance', 'marketing') NOT NULL DEFAULT 'warehouse',
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_staff_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Server-Side Sessions (HttpOnly Cookie bound)
CREATE TABLE sessions (
  id VARCHAR(128) PRIMARY KEY,
  user_type ENUM('staff', 'customer') NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role VARCHAR(64) NOT NULL,
  csrf_token VARCHAR(128) NOT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Barcode Labels (Uniqueness Constraint)
CREATE TABLE barcodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  serial VARCHAR(96) NOT NULL UNIQUE,
  sku VARCHAR(64) NOT NULL,
  product_name VARCHAR(128) NOT NULL,
  lot_number VARCHAR(64) NOT NULL,
  mfg_date VARCHAR(32) NOT NULL,
  expiry_date VARCHAR(32) NOT NULL,
  mrp INT NOT NULL DEFAULT 1599,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_barcodes_sku (sku),
  INDEX idx_barcodes_serial (serial)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Warehouse Scanner Events
CREATE TABLE scans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(128) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  item_name VARCHAR(128) NOT NULL,
  mode ENUM('receive', 'dispatch') NOT NULL,
  delta INT NOT NULL,
  stock_after VARCHAR(64) NOT NULL,
  staff_name VARCHAR(128) NOT NULL,
  details TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scans_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. System Settings
CREATE TABLE settings (
  key_name VARCHAR(64) PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Auditable Staff Actions Log
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor VARCHAR(128) NOT NULL,
  action VARCHAR(128) NOT NULL,
  details TEXT DEFAULT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
