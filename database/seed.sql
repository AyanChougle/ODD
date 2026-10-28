-- ============================================================================
-- ODD PERFUMES — INITIAL SEED DATA
-- Note: First Move starts at ZERO stock, adhering strictly to the documented rule.
-- ============================================================================

-- Products
INSERT INTO products (id, sku, name, price, original_price, stock, active, tagline, notes) VALUES
('phantom', 'ODD-PH-001', 'ODD Phantom', 899, 1199, 240, 1, 'Unseen. Unforgotten. Dominant.', 'Oud · Amber · Smoky Woods'),
('lucid', 'ODD-LC-003', 'ODD Lucid', 899, 1199, 180, 1, 'Clear Mind. Sharp Presence.', 'Citrus · Black Tea · Clean Woods'),
('first-move', 'ODD-FM-002', 'ODD First Move', 899, 1199, 0, 1, 'Start First. Stay Ahead.', 'Pineapple · Woods · Smoky Musk')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Initial Inventory Movements (Audit Baseline)
INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name) VALUES
('ODD-PH-001', 'phantom', 240, 240, 'Initial inventory receipt from Mumbai facility', 'Admin'),
('ODD-LC-003', 'lucid', 180, 180, 'Initial inventory receipt from Mumbai facility', 'Admin'),
('ODD-FM-002', 'first-move', 0, 0, 'Zero stock baseline (production awaiting packaging batch)', 'Admin');

-- Coupons
INSERT INTO coupons (code, discount_percent, min_spend, max_discount, max_uses, used_count, per_user_limit, active) VALUES
('LAUNCH20', 20, 0, 500, 500, 0, 1, 1),
('ODD10', 10, 0, 300, 1000, 0, 1, 1),
('WELCOME15', 15, 0, 400, 1000, 0, 1, 1),
('ODDSPOT10', 10, 0, 300, 1000, 0, 1, 1)
ON DUPLICATE KEY UPDATE discount_percent=VALUES(discount_percent);

-- Settings
INSERT INTO settings (key_name, value_json) VALUES
('shipping', '{"standardRate":50,"freeThreshold":0,"enabled":true}'),
('banner', '{"active":true,"code":"LAUNCH20","text":"WE''RE LIVE. Take 20% OFF your first order with code LAUNCH20","timerEnds":"2026-11-30T23:59:59Z"}'),
('razorpay', '{"enabled":true,"env":"live","keyId":"rzp_live_Ti8AffHarb3tai","brandName":"ODD Perfume","themeColor":"#E86B32","simulate":false}')
ON DUPLICATE KEY UPDATE value_json=VALUES(value_json);
