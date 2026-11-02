<?php
/**
 * ODD Perfumes — REST API Engine (Hostinger / Apache / cPanel / LiteSpeed)
 * Authoritative Backend Routing & Business Rules
 */

declare(strict_types=1);

require_once __DIR__ . '/db.php';

// Security Headers
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store, no-cache, must-revalidate');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

// Strip prefix e.g. /api
$route = preg_replace('#^.*?/api/?#', '', $uri);
$route = trim($route, '/');

// Helpers
function sendJson(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function getStaffSession(): ?array {
    $sessionId = $_COOKIE['odd_admin_session'] ?? null;
    if (!$sessionId && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $sessionId = str_replace('Bearer ', '', $_SERVER['HTTP_AUTHORIZATION']);
    }
    if (!$sessionId) return null;

    $pdo = getDb();
    $stmt = $pdo->prepare('
        SELECT s.*, st.name, st.email, st.role, st.active
        FROM sessions s
        JOIN staff st ON s.user_id = st.id
        WHERE s.id = ? AND s.user_type = "staff" AND s.expires_at > NOW()
    ');
    $stmt->execute([$sessionId]);
    $session = $stmt->fetch();
    return ($session && $session['active']) ? $session : null;
}

function getCustomerSession(): ?array {
    $sessionId = $_COOKIE['odd_customer_session'] ?? null;
    if (!$sessionId) return null;

    $pdo = getDb();
    $stmt = $pdo->prepare('
        SELECT s.*, c.name, c.email, c.phone
        FROM sessions s
        JOIN customers c ON s.user_id = c.id
        WHERE s.id = ? AND s.user_type = "customer" AND s.expires_at > NOW()
    ');
    $stmt->execute([$sessionId]);
    return $stmt->fetch() ?: null;
}

const ROLE_PERMISSIONS = [
    'admin'     => ['*'],
    'warehouse' => ['inventory', 'scans', 'barcodes'],
    'orders'    => ['orders'],
    'finance'   => ['payments', 'orders'],
    'marketing' => ['coupons', 'banner']
];

function requireStaffAuth(?string $perm = null): array {
    $session = getStaffSession();
    if (!$session) {
        sendJson(401, ['error' => 'Authentication required. Please sign in to staff portal.']);
    }
    if ($perm) {
        $perms = ROLE_PERMISSIONS[$session['role']] ?? [];
        if (!in_array('*', $perms, true) && !in_array($perm, $perms, true)) {
            sendJson(403, ['error' => "Forbidden: Staff role '{$session['role']}' cannot access {$perm}."]);
        }
    }
    if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PATCH', 'PUT', 'DELETE'], true)) {
        $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!$csrf || $csrf !== $session['csrf_token']) {
            sendJson(403, ['error' => 'Invalid or missing CSRF token.']);
        }
    }
    return $session;
}

$pdo = getDb();

try {
    // --- 1. Staff Authentication ---
    if ($route === 'auth/login' && $method === 'POST') {
        $body = getJsonBody();
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');

        if (!$email || !$password) sendJson(400, ['error' => 'Please enter both email and password.']);

        $stmt = $pdo->prepare('SELECT * FROM staff WHERE email = ?');
        try {
            $stmt->execute([$email]);
            $staff = $stmt->fetch();
        } catch (Throwable $e) {
            $staff = null;
        }

        if (!$staff) {
            try {
                $stmt2 = $pdo->prepare('SELECT * FROM staff_accounts WHERE email = ?');
                $stmt2->execute([$email]);
                $staff = $stmt2->fetch();
            } catch (Throwable $e) {
                $staff = null;
            }
        }

        if (!$staff) {
            sendJson(401, ['error' => 'Invalid email or password.']);
        }

        $storedHash = (string)($staff['password_hash'] ?? '');
        $isValidPassword = false;

        // 1. Standard PHP bcrypt/argon2 hash verification
        if (password_verify($password, $storedHash)) {
            $isValidPassword = true;
        } 
        // 2. Fallback if plain text was entered directly into database
        elseif (hash_equals($storedHash, $password)) {
            $isValidPassword = true;
            // Automatically upgrade plain text to modern secure bcrypt hash
            $secureHash = password_hash($password, PASSWORD_DEFAULT);
            $pdo->prepare('UPDATE staff SET password_hash = ? WHERE id = ?')->execute([$secureHash, $staff['id']]);
            try {
                $pdo->prepare('UPDATE staff_accounts SET password_hash = ? WHERE id = ?')->execute([$secureHash, $staff['id']]);
            } catch (Throwable $t) {}
        }
        // 3. Salted format fallback (salt:hex)
        elseif (strpos($storedHash, ':') !== false) {
            [$salt, $key] = explode(':', $storedHash, 2);
            if (hash_equals($key, hash('sha256', $salt . $password))) {
                $isValidPassword = true;
            }
        }

        if (!$isValidPassword) {
            sendJson(401, ['error' => 'Invalid email or password.']);
        }
        $isActive = isset($staff['active']) ? (bool)$staff['active'] : (($staff['status'] ?? '') === 'active');
        if (!$isActive) sendJson(403, ['error' => 'Account disabled. Contact administrator.']);

        $sessionId = bin2hex(random_bytes(32));
        $csrfToken = bin2hex(random_bytes(24));
        $expiresAt = date('Y-m-d H:i:s', time() + SESSION_LIFETIME);

        $pdo->prepare('
            INSERT INTO sessions (id, user_type, user_id, role, csrf_token, ip_address, user_agent, expires_at)
            VALUES (?, "staff", ?, ?, ?, ?, ?, ?)
        ')->execute([$sessionId, (string)$staff['id'], $staff['role'], $csrfToken, $_SERVER['REMOTE_ADDR'] ?? '', $_SERVER['HTTP_USER_AGENT'] ?? '', $expiresAt]);

        $pdo->prepare('UPDATE staff SET last_login = NOW() WHERE id = ?')->execute([$staff['id']]);

        setcookie('odd_admin_session', $sessionId, [
            'expires'  => time() + SESSION_LIFETIME,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on'
        ]);

        sendJson(200, [
            'authenticated' => true,
            'user' => ['id' => $staff['id'], 'name' => $staff['name'], 'email' => $staff['email'], 'role' => $staff['role']],
            'csrfToken' => $csrfToken,
            'permissions' => ROLE_PERMISSIONS[$staff['role']] ?? []
        ]);
    }

    if ($route === 'auth/logout' && $method === 'POST') {
        $sessionId = $_COOKIE['odd_admin_session'] ?? null;
        if ($sessionId) {
            $pdo->prepare('DELETE FROM sessions WHERE id = ?')->execute([$sessionId]);
        }
        setcookie('odd_admin_session', '', ['expires' => 1, 'path' => '/']);
        sendJson(200, ['success' => true]);
    }

    if ($route === 'auth/session' && $method === 'GET') {
        $session = getStaffSession();
        if (!$session) sendJson(200, ['authenticated' => false]);
        sendJson(200, [
            'authenticated' => true,
            'user' => ['id' => $session['user_id'], 'name' => $session['name'], 'email' => $session['email'], 'role' => $session['role']],
            'csrfToken' => $session['csrf_token'],
            'permissions' => ROLE_PERMISSIONS[$session['role']] ?? []
        ]);
    }

    // --- 2. Products ---
    if ($route === 'products' && $method === 'GET') {
        $stmt = $pdo->query('SELECT id, sku, name, price, original_price as originalPrice, stock, active, tagline, notes FROM products WHERE active = 1');
        sendJson(200, ['products' => $stmt->fetchAll()]);
    }

    // --- 3. Inventory ---
    if ($route === 'inventory' && $method === 'GET') {
        requireStaffAuth('inventory');
        $stmt = $pdo->query('SELECT sku, name, stock, price, updated_at as updated FROM products ORDER BY id');
        sendJson(200, ['inventory' => $stmt->fetchAll()]);
    }

    if (strpos($route, 'inventory/') === 0 && ($method === 'PATCH' || $method === 'PUT')) {
        $session = requireStaffAuth('inventory');
        $sku = urldecode(substr($route, strlen('inventory/')));
        $body = getJsonBody();

        $stmt = $pdo->prepare('SELECT * FROM products WHERE sku = ?');
        $stmt->execute([$sku]);
        $prod = $stmt->fetch();
        if (!$prod) sendJson(404, ['error' => "Product '{$sku}' not found."]);

        $newPrice = isset($body['price']) ? max(1, (int)$body['price']) : (int)$prod['price'];
        // Per business rule: stock is managed authoritatively by QR/barcode scanner.
        // Direct inventory endpoint updates price. If stock was explicitly supplied with admin flag, allow it.
        $newStock = (int)$prod['stock'];
        if (isset($body['stock']) && isset($body['allow_manual_stock']) && $session['role'] === 'admin') {
            $newStock = max(0, (int)$body['stock']);
        }
        $delta = $newStock - (int)$prod['stock'];

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE products SET stock = ?, price = ?, updated_at = NOW() WHERE sku = ?')->execute([$newStock, $newPrice, $sku]);
        if ($delta !== 0) {
            $pdo->prepare('
                INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name)
                VALUES (?, ?, ?, ?, ?, ?)
            ')->execute([$sku, $prod['id'], $delta, $newStock, $body['reason'] ?? 'Manual staff adjustment', $session['name']]);
        }
        $pdo->commit();

        sendJson(200, [
            'success' => true,
            'sku' => $sku,
            'stock' => $newStock,
            'price' => $newPrice,
            'item' => [
                'sku' => $sku,
                'name' => $prod['name'],
                'stock' => $newStock,
                'price' => $newPrice,
                'updated' => date('Y-m-d H:i:s')
            ]
        ]);
    }

    // --- 4. Coupons ---
    if ($route === 'coupons' && $method === 'GET') {
        requireStaffAuth('coupons');
        $stmt = $pdo->query('SELECT id, code, discount_percent as discount, min_spend as minSpend, max_discount as maxDiscount, max_uses as maxUses, used_count as usedCount, per_user_limit as perUserLimit, active, created_at as createdAt FROM coupons ORDER BY id DESC');
        sendJson(200, ['coupons' => $stmt->fetchAll()]);
    }

    if ($route === 'coupons' && $method === 'POST') {
        requireStaffAuth('coupons');
        $body = getJsonBody();
        $code = strtoupper(trim((string)($body['code'] ?? '')));
        $discount = (int)($body['discount'] ?? $body['discount_percent'] ?? 0);

        if (!$code || $discount <= 0 || $discount > 100) sendJson(400, ['error' => 'Invalid code or discount percentage (1–100).']);

        try {
            $pdo->prepare('
                INSERT INTO coupons (code, discount_percent, min_spend, max_discount, max_uses, per_user_limit, active)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ')->execute([$code, $discount, (int)($body['minSpend'] ?? 0), (int)($body['maxDiscount'] ?? 0), (int)($body['maxUses'] ?? 0), (int)($body['perUserLimit'] ?? 1), isset($body['active']) && !$body['active'] ? 0 : 1]);
            sendJson(201, ['success' => true, 'message' => "Coupon {$code} created."]);
        } catch (PDOException $e) {
            sendJson(400, ['error' => "Coupon {$code} already exists."]);
        }
    }

    if (strpos($route, 'coupons/') === 0 && $method === 'PATCH') {
        requireStaffAuth('coupons');
        $target = trim(urldecode(substr($route, strlen('coupons/'))));
        $body = getJsonBody();
        if (isset($body['active'])) {
            $pdo->prepare('UPDATE coupons SET active = ? WHERE id = ? OR code = ?')->execute([$body['active'] ? 1 : 0, $target, $target]);
        }
        sendJson(200, ['success' => true]);
    }

    if (strpos($route, 'coupons/') === 0 && $method === 'DELETE') {
        requireStaffAuth('coupons');
        $target = trim(urldecode(substr($route, strlen('coupons/'))));
        $pdo->prepare('DELETE FROM coupons WHERE id = ? OR code = ?')->execute([$target, $target]);
        sendJson(200, ['success' => true]);
    }

    if ($route === 'coupons/usages' && $method === 'GET') {
        requireStaffAuth('coupons:read');
        $usages = $pdo->query('
            SELECT coupon_code as coupon, customer_email as email, customer_phone as phone,
                   order_id as orderId, discount_amount as discount, used_at as date
            FROM coupon_usages ORDER BY used_at DESC LIMIT 100
        ')->fetchAll();
        sendJson(200, ['usages' => $usages]);
    }

    if ($route === 'coupons/validate' && $method === 'POST') {
        $body = getJsonBody();
        $code = strtoupper(trim((string)($body['code'] ?? '')));
        $subtotal = (int)($body['subtotal'] ?? 0);
        $email = strtolower(trim((string)($body['email'] ?? '')));

        $stmt = $pdo->prepare('SELECT * FROM coupons WHERE code = ? AND active = 1');
        $stmt->execute([$code]);
        $c = $stmt->fetch();

        if (!$c) sendJson(400, ['valid' => false, 'error' => 'Invalid or inactive promo code.']);
        if ($c['min_spend'] > 0 && $subtotal < $c['min_spend']) sendJson(400, ['valid' => false, 'error' => "Minimum order of ₹{$c['min_spend']} required for {$code}."]);
        if ($c['max_uses'] > 0 && $c['used_count'] >= $c['max_uses']) sendJson(400, ['valid' => false, 'error' => "Promo code {$code} has reached maximum redemptions."]);

        if ($email && $c['per_user_limit'] > 0) {
            $uStmt = $pdo->prepare('SELECT COUNT(*) as c FROM coupon_usages WHERE coupon_code = ? AND customer_email = ?');
            $uStmt->execute([$code, $email]);
            if ((int)$uStmt->fetch()['c'] >= $c['per_user_limit']) sendJson(400, ['valid' => false, 'error' => "You have already redeemed {$code}."]);
        }

        $discount = (int)round($subtotal * ($c['discount_percent'] / 100));
        if ($c['max_discount'] > 0 && $discount > $c['max_discount']) $discount = (int)$c['max_discount'];

        sendJson(200, ['valid' => true, 'code' => $c['code'], 'discountPercent' => (int)$c['discount_percent'], 'discountAmount' => $discount]);
    }

    // --- 5. Checkout Calculation ---
    if ($route === 'checkout/calculate' && $method === 'POST') {
        $body = getJsonBody();
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];
        $couponCode = strtoupper(trim((string)($body['couponCode'] ?? '')));
        $email = strtolower(trim((string)($body['email'] ?? '')));

        $subtotal = 0;
        $validated = [];

        foreach ($items as $it) {
            $sku = trim((string)($it['sku'] ?? $it['id'] ?? ''));
            $qty = max(1, (int)($it['qty'] ?? $it['quantity'] ?? 1));

            $stmt = $pdo->prepare('SELECT * FROM products WHERE (sku = ? OR id = ?) AND active = 1');
            $stmt->execute([$sku, $sku]);
            $prod = $stmt->fetch();

            if (!$prod) sendJson(400, ['error' => "Product '{$sku}' is invalid."]);
            if ((int)$prod['stock'] <= 0) sendJson(400, ['error' => "{$prod['name']} is currently out of stock."]);
            if ($qty > (int)$prod['stock']) sendJson(400, ['error' => "Only {$prod['stock']} units available for {$prod['name']}."]);

            $lineTotal = (int)$prod['price'] * $qty;
            $subtotal += $lineTotal;
            $validated[] = ['id' => $prod['id'], 'sku' => $prod['sku'], 'name' => $prod['name'], 'price' => (int)$prod['price'], 'quantity' => $qty, 'lineTotal' => $lineTotal];
        }

        // Settings
        $sStmt = $pdo->query('SELECT value_json FROM settings WHERE key_name = "shipping"');
        $sRow = $sStmt->fetch();
        $shippingCfg = $sRow ? json_decode($sRow['value_json'], true) : [];
        $shippingFee = ($shippingCfg['enabled'] ?? true) ? (int)($shippingCfg['standardRate'] ?? 50) : 0;
        if (!empty($shippingCfg['freeThreshold']) && $subtotal >= (int)$shippingCfg['freeThreshold']) $shippingFee = 0;

        $discountAmount = 0;
        if ($couponCode) {
            $cStmt = $pdo->prepare('SELECT * FROM coupons WHERE code = ? AND active = 1');
            $cStmt->execute([$couponCode]);
            $c = $cStmt->fetch();
            if ($c) {
                $discountAmount = (int)round($subtotal * ($c['discount_percent'] / 100));
                if ($c['max_discount'] > 0 && $discountAmount > $c['max_discount']) $discountAmount = (int)$c['max_discount'];
            }
        }

        $totalAmount = max(0, $subtotal - $discountAmount + $shippingFee);
        sendJson(200, ['subtotal' => $subtotal, 'discountAmount' => $discountAmount, 'couponCode' => $discountAmount > 0 ? $couponCode : null, 'shippingFee' => $shippingFee, 'totalAmount' => $totalAmount, 'items' => $validated]);
    }

    // --- 6. Orders ---
    if ($route === 'orders' && $method === 'POST') {
        $body = getJsonBody();
        $customer = trim((string)($body['customer'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $phone = trim((string)($body['phone'] ?? ''));
        $address = trim((string)($body['address'] ?? ''));
        $items = is_array($body['items'] ?? null) ? $body['items'] : [];
        $paymentMethod = (string)($body['paymentMethod'] ?? 'Cash on Delivery (COD)');
        $couponCode = strtoupper(trim((string)($body['couponCode'] ?? '')));

        if (!$customer || !$email || !$phone || !$address || empty($items)) {
            sendJson(400, ['error' => 'Please provide complete name, email, phone, address and items.']);
        }

        $pdo->beginTransaction();
        try {
            // Generate clean sequential order ID: ODD-00001, ODD-00002, etc.
            $maxSeq = 0;
            $seqStmt = $pdo->query("SELECT id FROM orders WHERE id LIKE 'ODD-%'");
            if ($seqStmt) {
                while ($row = $seqStmt->fetch()) {
                    if (preg_match('/^ODD-(\d{1,5})$/', $row['id'], $m)) {
                        $num = (int)$m[1];
                        if ($num > $maxSeq) $maxSeq = $num;
                    }
                }
            }
            $nextNum = $maxSeq + 1;
            $orderId = 'ODD-' . str_pad((string)$nextNum, 5, '0', STR_PAD_LEFT);
            $trackingToken = bin2hex(random_bytes(24));
            $isOnline = stripos($paymentMethod, 'razorpay') !== false;
            $subtotal = 0;
            $itemsData = [];

            foreach ($items as $it) {
                $sku = trim((string)($it['sku'] ?? $it['id'] ?? ''));
                $qty = max(1, (int)($it['qty'] ?? $it['quantity'] ?? 1));

                $stmt = $pdo->prepare('SELECT * FROM products WHERE (sku = ? OR id = ?) AND active = 1 FOR UPDATE');
                $stmt->execute([$sku, $sku]);
                $prod = $stmt->fetch();

                if (!$prod) throw new Exception("Product '{$sku}' is unavailable.");
                if ((int)$prod['stock'] < $qty) {
                    throw new Exception((int)$prod['stock'] === 0 ? "{$prod['name']} is currently out of stock." : "Insufficient stock for {$prod['name']}. Available: {$prod['stock']}");
                }

                $pdo->prepare('UPDATE products SET stock = stock - ?, updated_at = NOW() WHERE id = ?')->execute([$qty, $prod['id']]);

                $newStock = (int)$prod['stock'] - $qty;
                $pdo->prepare('
                    INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, order_id, staff_name)
                    VALUES (?, ?, ?, ?, "Customer Order Placement", ?, "System")
                ')->execute([$prod['sku'], $prod['id'], -$qty, $newStock, $orderId]);

                $lineTotal = (int)$prod['price'] * $qty;
                $subtotal += $lineTotal;
                $itemsData[] = ['product_id' => $prod['id'], 'sku' => $prod['sku'], 'name' => $prod['name'], 'price' => (int)$prod['price'], 'quantity' => $qty, 'line_total' => $lineTotal];
            }

            // Shipping
            $sStmt = $pdo->query('SELECT value_json FROM settings WHERE key_name = "shipping"');
            $sRow = $sStmt->fetch();
            $shippingCfg = $sRow ? json_decode($sRow['value_json'], true) : [];
            $shippingFee = ($shippingCfg['enabled'] ?? true) ? (int)($shippingCfg['standardRate'] ?? 50) : 0;
            if (!empty($shippingCfg['freeThreshold']) && $subtotal >= (int)$shippingCfg['freeThreshold']) $shippingFee = 0;

            // Coupon
            $discountAmount = 0;
            $appliedCode = null;
            if ($couponCode) {
                $cStmt = $pdo->prepare('SELECT * FROM coupons WHERE code = ? AND active = 1 FOR UPDATE');
                $cStmt->execute([$couponCode]);
                $c = $cStmt->fetch();
                if ($c) {
                    $discountAmount = (int)round($subtotal * ($c['discount_percent'] / 100));
                    if ($c['max_discount'] > 0 && $discountAmount > $c['max_discount']) $discountAmount = (int)$c['max_discount'];
                    $appliedCode = $c['code'];

                    $pdo->prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?')->execute([$c['id']]);
                    $pdo->prepare('
                        INSERT INTO coupon_usages (coupon_code, order_id, customer_email, customer_phone, discount_amount)
                        VALUES (?, ?, ?, ?, ?)
                    ')->execute([$c['code'], $orderId, $email, $phone, $discountAmount]);
                }
            }

            $totalAmount = max(0, $subtotal - $discountAmount + $shippingFee);

            $pdo->prepare('
                INSERT INTO orders (
                    id, tracking_token, customer_name, customer_email, customer_phone, shipping_address,
                    subtotal, discount_amount, coupon_code, shipping_fee, total_amount,
                    payment_method, payment_status, status, gateway, razorpay_order_id, razorpay_payment_id, stock_deducted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "Confirmed", ?, ?, ?, 1)
            ')->execute([
                $orderId, $trackingToken, $customer, $email, $phone, $address,
                $subtotal, $discountAmount, $appliedCode, $shippingFee, $totalAmount,
                $paymentMethod, $isOnline ? 'Pending' : 'Pending', $isOnline ? 'Razorpay Live' : 'Cash on Delivery (COD)',
                $body['razorpayOrderId'] ?? null, $body['razorpayPaymentId'] ?? null
            ]);

            $iStmt = $pdo->prepare('
                INSERT INTO order_items (order_id, product_id, sku, name, price, quantity, line_total)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ');
            foreach ($itemsData as $it) {
                $iStmt->execute([$orderId, $it['product_id'], $it['sku'], $it['name'], $it['price'], $it['quantity'], $it['line_total']]);
            }

            $pdo->commit();
            sendJson(201, ['success' => true, 'orderId' => $orderId, 'trackingToken' => $trackingToken, 'totalAmount' => $totalAmount, 'status' => 'Confirmed']);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendJson(400, ['error' => $e->getMessage()]);
        }
    }

    if ($route === 'orders' && $method === 'GET') {
        requireStaffAuth('orders');
        $orders = $pdo->query('
            SELECT id, customer_name as customer, customer_email as email, customer_phone as phone,
                   shipping_address as address, subtotal, discount_amount as discount, coupon_code as coupon,
                   shipping_fee as shipping, total_amount as total, total_amount as amount,
                   payment_method as paymentMethod, payment_status as paymentStatus, status, gateway,
                   razorpay_payment_id as razorpayPaymentId, created_at as date
            FROM orders ORDER BY created_at DESC
        ')->fetchAll();

        $iStmt = $pdo->prepare('SELECT product_id as id, sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?');
        foreach ($orders as &$o) {
            $iStmt->execute([$o['id']]);
            $o['items'] = $iStmt->fetchAll();
        }
        sendJson(200, ['orders' => $orders]);
    }

    if (strpos($route, 'orders/') === 0 && $method === 'PATCH') {
        $session = requireStaffAuth('orders');
        $orderId = urldecode(substr($route, strlen('orders/')));
        $body = getJsonBody();

        $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
        $stmt->execute([$orderId]);
        $order = $stmt->fetch();
        if (!$order) sendJson(404, ['error' => "Order {$orderId} not found."]);

        $newStatus = $body['status'] ?? null;
        if ($newStatus === 'Cancelled' && $order['status'] !== 'Cancelled' && $order['stock_deducted']) {
            $pdo->beginTransaction();
            $items = $pdo->prepare('SELECT * FROM order_items WHERE order_id = ?');
            $items->execute([$orderId]);
            foreach ($items->fetchAll() as $it) {
                $pdo->prepare('UPDATE products SET stock = stock + ?, updated_at = NOW() WHERE id = ?')->execute([$it['quantity'], $it['product_id']]);
                $p = $pdo->prepare('SELECT stock, sku FROM products WHERE id = ?');
                $p->execute([$it['product_id']]);
                $prod = $p->fetch();
                $pdo->prepare('
                    INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, order_id, staff_name)
                    VALUES (?, ?, ?, ?, "Order Cancellation Stock Restored", ?, ?)
                ')->execute([$prod['sku'], $it['product_id'], $it['quantity'], $prod['stock'], $orderId, $session['name']]);
            }
            $pdo->prepare('UPDATE orders SET status = "Cancelled", stock_deducted = 0, cancelled_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([$orderId]);
            $pdo->commit();
        } elseif ($newStatus === 'Dispatched') {
            $pdo->prepare('UPDATE orders SET status = "Dispatched", dispatched_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([$orderId]);
        } elseif ($newStatus === 'Delivered') {
            $pdo->prepare('UPDATE orders SET status = "Delivered", payment_status = "Paid", delivered_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([$orderId]);
        } elseif ($newStatus) {
            $pdo->prepare('UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?')->execute([$newStatus, $orderId]);
        }

        $updated = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
        $updated->execute([$orderId]);
        sendJson(200, ['success' => true, 'order' => $updated->fetch()]);
    }

    if ($route === 'orders/track' && $method === 'GET') {
        $orderId = strtoupper(trim((string)($_GET['order'] ?? '')));
        $phone = trim((string)($_GET['phone'] ?? ''));
        $token = trim((string)($_GET['token'] ?? ''));

        $order = null;
        if ($token) {
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE tracking_token = ?');
            $stmt->execute([$token]);
            $order = $stmt->fetch();
        } elseif ($orderId && $phone) {
            $cleanPhone = preg_replace('/[^0-9]/', '', $phone);
            $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? AND REPLACE(REPLACE(customer_phone, '+91', ''), ' ', '') LIKE ?");
            $stmt->execute([$orderId, '%' . substr($cleanPhone, -10)]);
            $order = $stmt->fetch();
        } elseif ($orderId) {
            $stmt = $pdo->prepare('SELECT id, status, subtotal, discount_amount, coupon_code, shipping_fee, total_amount, created_at FROM orders WHERE id = ?');
            $stmt->execute([$orderId]);
            $order = $stmt->fetch();
        }

        if (!$order) sendJson(404, ['error' => 'Order not found. Check your Order ID and phone number.']);

        $iStmt = $pdo->prepare('SELECT sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?');
        $iStmt->execute([$order['id']]);

        sendJson(200, [
            'id' => $order['id'],
            'status' => $order['status'],
            'subtotal' => (int)$order['subtotal'],
            'discount' => (int)$order['discount_amount'],
            'coupon' => $order['coupon_code'],
            'shipping' => (int)$order['shipping_fee'],
            'total' => (int)$order['total_amount'],
            'amount' => (int)$order['total_amount'],
            'date' => $order['created_at'],
            'items' => $iStmt->fetchAll()
        ]);
    }

    // --- 7. Razorpay Payments ---
    if ($route === 'payments/create-order' && $method === 'POST') {
        $body = getJsonBody();
        $amount = (int)round((float)($body['amount'] ?? 0));
        if ($amount <= 0) sendJson(400, ['error' => 'Invalid amount.']);

        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            sendJson(503, ['error' => 'Razorpay gateway not configured. Please choose Cash on Delivery (COD).']);
        }

        $ch = curl_init('https://api.razorpay.com/v1/orders');
        curl_setopt($ch, CURLOPT_USERPWD, RAZORPAY_KEY_ID . ':' . RAZORPAY_KEY_SECRET);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'amount' => $amount * 100,
            'currency' => 'INR',
            'receipt' => $body['receipt'] ?? ('rcpt_' . time()),
            'payment_capture' => 1
        ]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $rzp = json_decode((string)$resp, true);
        if ($code >= 400) sendJson(400, ['error' => $rzp['error']['description'] ?? 'Failed to create Razorpay order.']);

        sendJson(200, ['orderId' => $rzp['id'], 'amount' => $rzp['amount'], 'currency' => $rzp['currency'], 'keyId' => RAZORPAY_KEY_ID]);
    }

    if ($route === 'payments/verify' && $method === 'POST') {
        $body = getJsonBody();
        $rOrderId = $body['razorpay_order_id'] ?? '';
        $rPayId = $body['razorpay_payment_id'] ?? '';
        $rSig = $body['razorpay_signature'] ?? '';
        $orderId = $body['order_id'] ?? '';

        if (!$rOrderId || !$rPayId || !$rSig) sendJson(400, ['error' => 'Missing signature components.']);

        $expected = hash_hmac('sha256', $rOrderId . '|' . $rPayId, RAZORPAY_KEY_SECRET);
        if (!hash_equals($expected, $rSig)) {
            sendJson(400, ['verified' => false, 'error' => 'Signature verification failed.']);
        }

        if ($orderId) {
            $pdo->prepare('UPDATE orders SET payment_status = "Paid", razorpay_order_id = ?, razorpay_payment_id = ?, updated_at = NOW() WHERE id = ?')->execute([$rOrderId, $rPayId, $orderId]);
        }
        sendJson(200, ['verified' => true, 'paymentId' => $rPayId]);
    }

    if ($route === 'payments/summary' && $method === 'GET') {
        requireStaffAuth('payments');

        $totalOrders = (int)$pdo->query('SELECT COUNT(*) as c FROM orders')->fetch()['c'];
        $confirmed = $pdo->query('SELECT COALESCE(SUM(total_amount), 0) as s, COUNT(*) as c FROM orders WHERE payment_status = "Paid" AND status != "Cancelled"')->fetch();
        $cod = $pdo->query('SELECT COALESCE(SUM(total_amount), 0) as s, COUNT(*) as c FROM orders WHERE gateway LIKE "%Cash on Delivery%" AND payment_status != "Paid" AND status != "Cancelled"')->fetch();
        $pending = $pdo->query('SELECT COALESCE(SUM(total_amount), 0) as s, COUNT(*) as c FROM orders WHERE payment_status = "Pending" AND gateway NOT LIKE "%Cash on Delivery%" AND status != "Cancelled"')->fetch();

        $recent = $pdo->query('
            SELECT id, customer_name as customer, customer_phone as phone, total_amount as amount, gateway, payment_status as paymentStatus, status, created_at as date, razorpay_payment_id as razorpayPaymentId
            FROM orders ORDER BY created_at DESC LIMIT 10
        ')->fetchAll();

        $iStmt = $pdo->prepare('SELECT name, quantity as qty FROM order_items WHERE order_id = ?');
        foreach ($recent as &$r) {
            $iStmt->execute([$r['id']]);
            $r['items'] = $iStmt->fetchAll();
        }

        sendJson(200, [
            'totalOrders' => $totalOrders,
            'confirmedRevenue' => (int)$confirmed['s'],
            'paidCount' => (int)$confirmed['c'],
            'codRevenue' => (int)$cod['s'],
            'codCount' => (int)$cod['c'],
            'pendingRevenue' => (int)$pending['s'],
            'pendingCount' => (int)$pending['c'],
            'recentOrders' => $recent
        ]);
    }

    // --- 8. Barcodes & Scans ---
    if ($route === 'barcodes/batch' && $method === 'POST') {
        requireStaffAuth('barcodes');
        $body = getJsonBody();
        $prods = is_array($body['products'] ?? null) ? $body['products'] : [];
        $lot = trim((string)($body['lot'] ?? '77750'));
        $mfg = (string)($body['mfg'] ?? date('Y-m-d'));
        $shelfLife = (int)($body['shelfLife'] ?? 36);
        $mrp = (int)($body['mrp'] ?? 899);

        $expiry = date('Y-m-d', strtotime("+{$shelfLife} months", strtotime($mfg)));
        $labels = [];

        $pdo->beginTransaction();
        $bStmt = $pdo->prepare('INSERT INTO barcodes (serial, sku, product_name, lot_number, mfg_date, expiry_date, mrp) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $countStmt = $pdo->prepare('SELECT COUNT(*) as c FROM barcodes WHERE sku = ? AND lot_number = ?');

        $skuCodes = [
            'ODD-FM-002' => 'ODD-FM',
            'ODD-LC-003' => 'ODD-LC',
            'ODD-PH-001' => 'ODD-PH'
        ];
        $skuNames = [
            'ODD-FM-002' => 'ODD FIRST MOVE',
            'ODD-LC-003' => 'ODD LUCID',
            'ODD-PH-001' => 'ODD PHANTOM'
        ];

        foreach ($prods as $p) {
            $sku = $p['sku'];
            $pName = $skuNames[$sku] ?? $sku;
            $prefix = $skuCodes[$sku] ?? (strpos($sku, 'ODD-') === 0 ? substr($sku, 0, 6) : "ODD-{$sku}");
            $qty = min(100, max(1, (int)($p['qty'] ?? 1)));
            $countStmt->execute([$sku, $lot]);
            $existing = (int)$countStmt->fetch()['c'];

            $batchNum = preg_match('/(\d{1,2})$/', $lot, $m) ? str_pad($m[1], 2, '0', STR_PAD_LEFT) : '01';

            for ($i = 1; $i <= $qty; $i++) {
                $idx = str_pad((string)($existing + $i), 2, '0', STR_PAD_LEFT);
                $serial = "{$prefix}-{$batchNum}-{$idx}";
                $bStmt->execute([$serial, $sku, $pName, $lot, $mfg, $expiry, $mrp]);
                $labels[] = ['sku' => $sku, 'name' => $pName, 'barcode' => $serial, 'serial' => $serial, 'lot' => $lot, 'mfg' => $mfg, 'expiry' => $expiry, 'mrp' => $mrp];
            }
        }
        $pdo->commit();
        sendJson(200, ['success' => true, 'labels' => $labels, 'expiry' => $expiry]);
    }

    if ($route === 'scans' && $method === 'GET') {
        requireStaffAuth('scans');
        $stmt = $pdo->query('SELECT id, code, sku, item_name as name, mode, delta, stock_after as newStock, staff_name as staff, details, created_at as time FROM scans ORDER BY id DESC LIMIT 50');
        sendJson(200, ['scans' => $stmt->fetchAll()]);
    }

    if ($route === 'scans' && $method === 'DELETE') {
        requireStaffAuth('scans');
        $pdo->exec('DELETE FROM scans');
        sendJson(200, ['success' => true, 'scans' => []]);
    }

    if ($route === 'scans' && $method === 'POST') {
        $session = requireStaffAuth('scans');
        $body = getJsonBody();
        $rawCode = strtoupper(trim((string)($body['code'] ?? '')));
        $mode = ($body['mode'] ?? 'receive') === 'dispatch' ? 'dispatch' : 'receive';

        if (!$rawCode) {
            sendJson(400, ['error' => 'Scan code cannot be empty.']);
        }

        $pdo->beginTransaction();
        try {
            // Check if code matches an Order ID (e.g. ODD-123456 or 123456)
            $cleanCode = str_replace('ODD-', '', $rawCode);
            $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ? OR REPLACE(id, 'ODD-', '') = ?");
            $stmt->execute([$rawCode, $cleanCode]);
            $order = $stmt->fetch();

            if ($order) {
                $alreadyDispatched = in_array($order['status'], ['Dispatched', 'Delivered']);
                $deductedSummary = [];
                $totalDeducted = 0;

                if (empty($order['stock_deducted'])) {
                    $itemStmt = $pdo->prepare('SELECT * FROM order_items WHERE order_id = ?');
                    $itemStmt->execute([$order['id']]);
                    $items = $itemStmt->fetchAll();

                    $updProd = $pdo->prepare('UPDATE products SET stock = GREATEST(0, stock - ?), updated_at = NOW() WHERE id = ?');
                    $getProd = $pdo->prepare('SELECT stock, sku, name FROM products WHERE id = ?');
                    $insMov = $pdo->prepare('INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, order_id, staff_name) VALUES (?, ?, ?, ?, "Order Dispatched via Scanner", ?, ?)');

                    foreach ($items as $it) {
                        $updProd->execute([(int)$it['quantity'], $it['product_id']]);
                        $getProd->execute([$it['product_id']]);
                        $p = $getProd->fetch();
                        if ($p) {
                            $insMov->execute([$p['sku'], $it['product_id'], -(int)$it['quantity'], (int)$p['stock'], $order['id'], $session['name'] ?? 'Staff']);
                            $deductedSummary[] = "{$p['name']} (-{$it['quantity']})";
                            $totalDeducted += (int)$it['quantity'];
                        }
                    }
                }

                $pdo->prepare('UPDATE orders SET status = "Dispatched", dispatched_at = NOW(), stock_deducted = 1, updated_at = NOW() WHERE id = ?')->execute([$order['id']]);

                $pdo->prepare('INSERT INTO scans (code, sku, item_name, mode, delta, stock_after, staff_name, details) VALUES (?, "ORDER-DISPATCH", ?, "dispatch", ?, "Dispatched", ?, ?)')->execute([
                    $order['id'],
                    "Order {$order['id']}",
                    -$totalDeducted,
                    $session['name'] ?? 'Staff',
                    implode(', ', $deductedSummary) ?: 'Order Dispatched'
                ]);

                $pdo->commit();
                sendJson(200, [
                    'success' => true,
                    'isOrder' => true,
                    'code' => $order['id'],
                    'name' => "Order {$order['id']}",
                    'message' => $alreadyDispatched
                        ? "Order {$order['id']} was already marked dispatched."
                        : "Order {$order['id']} dispatched! Stock updated: " . (implode(', ', $deductedSummary) ?: 'items verified') . "."
                ]);
            }

            // Otherwise code is SKU or barcode serial
            $matchedProduct = null;
            if (str_contains($rawCode, 'FM') || str_contains($rawCode, 'FIRST-MOVE') || str_contains($rawCode, 'MOVE')) {
                $matchedProduct = $pdo->query("SELECT * FROM products WHERE sku = 'ODD-FM-002'")->fetch();
            } elseif (str_contains($rawCode, 'LC') || str_contains($rawCode, 'LUCID')) {
                $matchedProduct = $pdo->query("SELECT * FROM products WHERE sku = 'ODD-LC-003'")->fetch();
            } elseif (str_contains($rawCode, 'PH') || str_contains($rawCode, 'PHANTOM')) {
                $matchedProduct = $pdo->query("SELECT * FROM products WHERE sku = 'ODD-PH-001'")->fetch();
            } else {
                $st = $pdo->prepare('SELECT * FROM products WHERE sku = ?');
                $st->execute([$rawCode]);
                $matchedProduct = $st->fetch();
            }

            if (!$matchedProduct) {
                $pdo->rollBack();
                $isLikelyOrder = preg_match('/^ODD-?\d+$/i', $rawCode) || preg_match('/^\d{5,}$/', $rawCode);
                $errMsg = $isLikelyOrder
                    ? "Order {$rawCode} was not found in the database. Please verify the order number."
                    : "Unrecognized product or barcode: {$rawCode}";
                sendJson(404, ['error' => $errMsg]);
            }

            if ($mode === 'dispatch' && (int)$matchedProduct['stock'] <= 0) {
                $pdo->rollBack();
                sendJson(400, ['error' => "Cannot dispatch {$matchedProduct['name']}: Stock is currently 0. Switch to Receive mode (+1) to add stock."]);
            }

            $delta = $mode === 'receive' ? 1 : -1;
            $newStock = max(0, (int)$matchedProduct['stock'] + $delta);

            $pdo->prepare('UPDATE products SET stock = ?, updated_at = NOW() WHERE id = ?')->execute([$newStock, $matchedProduct['id']]);

            $pdo->prepare('INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name) VALUES (?, ?, ?, ?, ?, ?)')->execute([
                $matchedProduct['sku'],
                $matchedProduct['id'],
                $delta,
                $newStock,
                'Warehouse Scanner ' . strtoupper($mode),
                $session['name'] ?? 'Staff'
            ]);

            $pdo->prepare('INSERT INTO scans (code, sku, item_name, mode, delta, stock_after, staff_name, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([
                $rawCode,
                $matchedProduct['sku'],
                $matchedProduct['name'],
                $mode,
                $delta,
                (string)$newStock,
                $session['name'] ?? 'Staff',
                "Stock adjusted to {$newStock}"
            ]);

            $pdo->commit();

            sendJson(200, [
                'success' => true,
                'isOrder' => false,
                'sku' => $matchedProduct['sku'],
                'name' => $matchedProduct['name'],
                'stock' => $newStock,
                'delta' => $delta
            ]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            sendJson(500, ['error' => 'Database operation failed: ' . $e->getMessage()]);
        }
    }

    // --- 9. Staff ---
    if ($route === 'staff' && $method === 'GET') {
        requireStaffAuth('admin');
        $stmt = $pdo->query('SELECT id, name, email, role, active, last_login as lastLogin, created_at as createdAt FROM staff ORDER BY id');
        sendJson(200, ['staff' => $stmt->fetchAll()]);
    }

    if ($route === 'staff' && $method === 'POST') {
        requireStaffAuth('admin');
        $body = getJsonBody();
        $name = trim((string)($body['name'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $password = (string)($body['password'] ?? '');
        $role = strtolower(trim((string)($body['role'] ?? 'warehouse')));

        if (!$name || !$email || !$password) sendJson(400, ['error' => 'Please provide name, email, password.']);
        $hash = password_hash($password, PASSWORD_DEFAULT);

        try {
            $pdo->prepare('INSERT INTO staff (name, email, password_hash, role, active) VALUES (?, ?, ?, ?, 1)')->execute([$name, $email, $hash, $role]);
            try {
                $pdo->prepare('INSERT INTO staff_accounts (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, "active")')->execute([$name, $email, $hash, $role]);
            } catch (Throwable $t) {}
            sendJson(201, ['success' => true, 'message' => "Staff {$name} created."]);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000 || str_contains($e->getMessage(), 'Duplicate')) {
                sendJson(400, ['error' => "Account {$email} already exists."]);
            }
            try {
                $pdo->prepare('INSERT INTO staff_accounts (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, "active")')->execute([$name, $email, $hash, $role]);
                sendJson(201, ['success' => true, 'message' => "Staff {$name} created."]);
            } catch (Throwable $e2) {
                sendJson(400, ['error' => "Failed to create staff: " . $e->getMessage()]);
            }
        }
    }

    if (strpos($route, 'staff/') === 0 && $method === 'PATCH') {
        requireStaffAuth('admin');
        $id = (int)substr($route, strlen('staff/'));
        $body = getJsonBody();

        if (isset($body['active']) && !$body['active']) {
            $admCount = (int)$pdo->query('SELECT COUNT(*) as c FROM staff WHERE role = "admin" AND active = 1')->fetch()['c'];
            $st = $pdo->prepare('SELECT role FROM staff WHERE id = ?');
            $st->execute([$id]);
            if ($st->fetch()['role'] === 'admin' && $admCount <= 1) {
                sendJson(400, ['error' => 'Cannot disable the last active administrator.']);
            }
        }
        if (isset($body['active'])) $pdo->prepare('UPDATE staff SET active = ? WHERE id = ?')->execute([$body['active'] ? 1 : 0, $id]);
        if (!empty($body['role'])) $pdo->prepare('UPDATE staff SET role = ? WHERE id = ?')->execute([$body['role'], $id]);
        sendJson(200, ['success' => true]);
    }

    // --- 10. Settings ---
    if (strpos($route, 'settings/') === 0 && $method === 'GET') {
        $key = substr($route, strlen('settings/'));
        $pdo->exec('
            CREATE TABLE IF NOT EXISTS settings (
                key_name VARCHAR(64) PRIMARY KEY,
                value_json LONGTEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
        $stmt = $pdo->prepare('SELECT value_json FROM settings WHERE key_name = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        sendJson(200, $row ? json_decode($row['value_json'], true) : []);
    }

    if (strpos($route, 'settings/') === 0 && ($method === 'POST' || $method === 'PUT')) {
        $key = substr($route, strlen('settings/'));
        requireStaffAuth($key === 'banner' ? 'marketing' : 'admin');
        $body = getJsonBody();
        $pdo->exec('
            CREATE TABLE IF NOT EXISTS settings (
                key_name VARCHAR(64) PRIMARY KEY,
                value_json LONGTEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
        $pdo->prepare('
            INSERT INTO settings (key_name, value_json, updated_at) VALUES (?, ?, NOW())
            ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()
        ')->execute([$key, json_encode($body)]);
        sendJson(200, ['success' => true]);
    }

    // Route not found
    sendJson(404, ['error' => "API route not found: /api/{$route}"]);

} catch (Throwable $e) {
    sendJson(500, ['error' => 'Internal Server Error', 'details' => $e->getMessage()]);
}
