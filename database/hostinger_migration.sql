-- ============================================================================
-- ODD PERFUMES — HOSTINGER PRODUCTION DATABASE COMPLETE SETUP & SEED
-- Target Database: u303154098_uNV1v
-- Safe to run in phpMyAdmin SQL tab (Idempotent / IF NOT EXISTS)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Order Items (Critical for Cart & Order Line Items)
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `sku` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `price` INT NOT NULL,
  `quantity` INT NOT NULL,
  `line_total` INT NOT NULL,
  INDEX `idx_items_order` (`order_id`),
  INDEX `idx_items_sku` (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. System Settings (Shipping Rates, Banner Announcement, Gateway Config)
CREATE TABLE IF NOT EXISTS `settings` (
  `key_name` VARCHAR(64) PRIMARY KEY,
  `value_json` TEXT NOT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Warehouse Barcode Batch Labels
CREATE TABLE IF NOT EXISTS `barcodes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `serial` VARCHAR(96) NOT NULL UNIQUE,
  `sku` VARCHAR(64) NOT NULL,
  `product_name` VARCHAR(128) NOT NULL,
  `lot_number` VARCHAR(64) NOT NULL,
  `mfg_date` VARCHAR(32) NOT NULL,
  `expiry_date` VARCHAR(32) NOT NULL,
  `mrp` INT NOT NULL DEFAULT 899,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_barcodes_sku` (`sku`),
  INDEX `idx_barcodes_serial` (`serial`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Warehouse Barcode Scanner Log
CREATE TABLE IF NOT EXISTS `scans` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(128) NOT NULL,
  `sku` VARCHAR(64) NOT NULL,
  `item_name` VARCHAR(128) NOT NULL,
  `mode` ENUM('receive', 'dispatch') NOT NULL,
  `delta` INT NOT NULL,
  `stock_after` VARCHAR(64) NOT NULL,
  `staff_name` VARCHAR(128) NOT NULL,
  `details` TEXT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_scans_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Customer Saved Addresses
CREATE TABLE IF NOT EXISTS `customer_addresses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` VARCHAR(64) NOT NULL,
  `label` VARCHAR(64) NOT NULL DEFAULT 'Home',
  `name` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `address_line` TEXT NOT NULL,
  `city` VARCHAR(128) NOT NULL,
  `pincode` VARCHAR(16) NOT NULL,
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  INDEX `idx_addresses_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5B. Customer & Studio Inquiries
CREATE TABLE IF NOT EXISTS `inquiries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL,
  `email` VARCHAR(128) NOT NULL,
  `subject` VARCHAR(128) NOT NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('new', 'read', 'replied') DEFAULT 'new',
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_inquiries_created` (`created_at`),
  INDEX `idx_inquiries_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Audit Logs
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `actor` VARCHAR(128) NOT NULL,
  `action` VARCHAR(128) NOT NULL,
  `details` TEXT DEFAULT NULL,
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Ensure sessions Table Exists
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` VARCHAR(128) PRIMARY KEY,
  `user_type` ENUM('staff', 'customer') NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `role` VARCHAR(64) NOT NULL,
  `csrf_token` VARCHAR(128) NOT NULL,
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  INDEX `idx_sessions_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Ensure staff Table Exists
CREATE TABLE IF NOT EXISTS `staff` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'warehouse', 'orders', 'finance', 'marketing') NOT NULL DEFAULT 'warehouse',
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login` DATETIME NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_staff_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Seed Active Administrator Account
-- Email: admin@oddperfume.com
-- Password: ODDAdmin2026!Secure
INSERT INTO `staff` (`name`, `email`, `password_hash`, `role`, `active`) VALUES
('Store Administrator', 'admin@oddperfume.com', '$2b$10$hrFesidrsQMYhJIueWeDC.b/Tr876Hn0ixWxpHOFe6J3MMdS6CSXa', 'admin', 1)
ON DUPLICATE KEY UPDATE `password_hash`=VALUES(`password_hash`), `role`='admin', `active`=1;

-- Also seed into staff_accounts if present
INSERT INTO `staff_accounts` (`name`, `email`, `password_hash`, `role`, `status`) VALUES
('Store Administrator', 'admin@oddperfume.com', '$2b$10$hrFesidrsQMYhJIueWeDC.b/Tr876Hn0ixWxpHOFe6J3MMdS6CSXa', 'admin', 'active')
ON DUPLICATE KEY UPDATE `password_hash`=VALUES(`password_hash`), `role`='admin', `status`='active';

-- 10. Seed Authentic Products (Strict Zero-Stock Rule for First Move)
INSERT INTO `products` (`id`, `sku`, `name`, `price`, `original_price`, `stock`, `active`, `tagline`, `notes`) VALUES
('phantom', 'ODD-PH-001', 'ODD Phantom', 1599, NULL, 240, 1, 'Unseen. Unforgotten. Dominant.', 'Oud · Amber · Smoky Woods'),
('lucid', 'ODD-LC-003', 'ODD Lucid', 1599, NULL, 180, 1, 'Clear Mind. Sharp Presence.', 'Citrus · Black Tea · Clean Woods'),
('first-move', 'ODD-FM-002', 'ODD First Move', 1599, NULL, 0, 1, 'Start First. Stay Ahead.', 'Pineapple · Woods · Smoky Musk')
ON DUPLICATE KEY UPDATE 
  `name`=VALUES(`name`), 
  `price`=VALUES(`price`), 
  `original_price`=VALUES(`original_price`),
  `stock`=VALUES(`stock`);

-- 11. Seed Initial Stock Movement Audit Records
INSERT INTO `inventory_movements` (`sku`, `product_id`, `delta`, `stock_after`, `reason`, `staff_name`) VALUES
('ODD-PH-001', 'phantom', 240, 240, 'Initial inventory batch receipt from Mumbai laboratory', 'Admin'),
('ODD-LC-003', 'lucid', 180, 180, 'Initial inventory batch receipt from Mumbai laboratory', 'Admin'),
('ODD-FM-002', 'first-move', 0, 0, 'Zero stock baseline (production awaiting packaging batch)', 'Admin');

-- 12. Seed Baseline Coupons
INSERT INTO `coupons` (`code`, `discount_percent`, `min_spend`, `max_discount`, `max_uses`, `used_count`, `per_user_limit`, `active`) VALUES
('LAUNCH20', 20, 0, 500, 500, 0, 1, 1),
('ODD10', 10, 0, 300, 1000, 0, 1, 1),
('WELCOME15', 15, 0, 400, 1000, 0, 1, 1),
('ODDSPOT10', 10, 0, 300, 1000, 0, 1, 1)
ON DUPLICATE KEY UPDATE `discount_percent`=VALUES(`discount_percent`), `active`=VALUES(`active`);

-- 13. Seed Store Settings (Shipping, Banner Announcement, Razorpay Online Gateway, Shiprocket)
INSERT INTO `settings` (`key_name`, `value_json`) VALUES
('shipping', '{\"enabled\":true,\"standardRate\":50,\"freeThreshold\":1000,\"expressRate\":120,\"timeline\":\"3–5 Business Days Across India\"}'),
('banner', '{\"active\":true,\"text\":\"WE\'RE LIVE. Take 20% OFF your first order with code LAUNCH20\",\"code\":\"LAUNCH20\"}'),
('razorpay', '{\"enabled\":true,\"env\":\"live\",\"keyId\":\"rzp_live_Ti8AffHarb3tai\",\"keySecret\":\"X4Ws6I0iovvSrTYh18i1nNjl\",\"brandName\":\"ODD Perfume\",\"themeColor\":\"#E86B32\",\"simulate\":false}'),
('shiprocket', '{\"email\":\"oddperfumesocial@gmail.com\",\"password\":\"Ks^U&iCv5zET!Bse*c4Ubln9y!ZkHw&o\",\"pickupLocation\":\"Primary\",\"carrier\":\"automatic\",\"autoDispatch\":false,\"origin\":{\"name\":\"ODD Perfume Fulfillment\",\"phone\":\"+919876543210\",\"street\":\"Plot 42, Perfume Studio, Industrial Area\",\"city\":\"Mumbai\",\"state\":\"MH\",\"postalCode\":\"400001\",\"country\":\"IN\"}}'),
('smtp', '{\"host\":\"smtp.hostinger.com\",\"port\":465,\"encryption\":\"ssl\",\"username\":\"hello@oddperfume.com\",\"password\":\"\",\"fromEmail\":\"hello@oddperfume.com\",\"fromName\":\"ODD Perfumes Studio\"}')
ON DUPLICATE KEY UPDATE `value_json`=VALUES(`value_json`);

SET FOREIGN_KEY_CHECKS = 1;
