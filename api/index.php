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

function getRazorpayConfig(PDO $pdo): array {
    try {
        $stmt = $pdo->prepare('SELECT value_json FROM settings WHERE key_name = "razorpay"');
        $stmt->execute();
        $row = $stmt->fetch();
        $cfg = $row ? json_decode($row['value_json'], true) : [];
        if (!is_array($cfg)) $cfg = [];
    } catch (Throwable $e) {
        $cfg = [];
    }
    $keyId = !empty($cfg['keyId']) ? trim($cfg['keyId']) : (defined('RAZORPAY_KEY_ID') ? RAZORPAY_KEY_ID : '');
    $keySecret = !empty($cfg['keySecret']) && !str_contains($cfg['keySecret'], '••••')
        ? trim($cfg['keySecret'])
        : (defined('RAZORPAY_KEY_SECRET') ? RAZORPAY_KEY_SECRET : '');
    $enabled = ($cfg['enabled'] ?? true) !== false;
    $env = $cfg['env'] ?? 'live';
    $brandName = $cfg['brandName'] ?? 'ODD Perfume';
    $themeColor = $cfg['themeColor'] ?? '#E86B32';

    return [
        'keyId' => $keyId,
        'keySecret' => $keySecret,
        'enabled' => $enabled,
        'env' => $env,
        'brandName' => $brandName,
        'themeColor' => $themeColor
    ];
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
    'warehouse' => ['inventory', 'scans', 'barcodes', 'shipping'],
    'orders'    => ['orders', 'shipping'],
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

        $isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
            || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);

        setcookie('odd_admin_session', $sessionId, [
            'expires'  => time() + SESSION_LIFETIME,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => $isSecure
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
        // If originalPrice was explicitly provided and is strictly greater than newPrice, store it to show discount.
        // Otherwise (no discount requested), set to NULL so no strikethrough or discount badge is displayed.
        $newOriginalPrice = (!empty($body['originalPrice']) && (int)$body['originalPrice'] > $newPrice)
            ? (int)$body['originalPrice']
            : null;
        // Per business rule: stock is managed authoritatively by QR/barcode scanner.
        // Direct inventory endpoint updates price. If stock was explicitly supplied with admin flag, allow it.
        $newStock = (int)$prod['stock'];
        if (isset($body['stock']) && isset($body['allow_manual_stock']) && $session['role'] === 'admin') {
            $newStock = max(0, (int)$body['stock']);
        }
        $delta = $newStock - (int)$prod['stock'];

        $pdo->beginTransaction();
        $pdo->prepare('UPDATE products SET stock = ?, price = ?, original_price = ?, updated_at = NOW() WHERE sku = ?')->execute([$newStock, $newPrice, $newOriginalPrice, $sku]);
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
            'originalPrice' => $newOriginalPrice,
            'item' => [
                'sku' => $sku,
                'name' => $prod['name'],
                'stock' => $newStock,
                'price' => $newPrice,
                'originalPrice' => $newOriginalPrice,
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
        requireStaffAuth('coupons');
        try {
            $usages = $pdo->query('
                SELECT coupon_code as coupon, customer_email as email, customer_phone as phone,
                       order_id as orderId, discount_amount as discount, created_at as date
                FROM coupon_usages ORDER BY id DESC LIMIT 100
            ')->fetchAll();
        } catch (Throwable $e) {
            $usages = [];
        }
        sendJson(200, ['usages' => $usages]);
    }

    // Public active coupons for storefront & customer portal
    if (($route === 'coupons/active' || $route === 'coupons/public') && $method === 'GET') {
        $email = strtolower(trim((string)($_GET['email'] ?? '')));
        $stmt = $pdo->query('
            SELECT id, code, discount_percent as discount, min_spend as minSpend, max_discount as maxDiscount, max_uses as maxUses,
                   CASE 
                     WHEN code = "LAUNCH20" THEN "Site-wide 20% discount on first fragrance order."
                     WHEN min_spend > 0 THEN CONCAT(discount_percent, "% discount on orders above ₹", min_spend, ".")
                     ELSE CONCAT(discount_percent, "% discount across all fragrances.")
                   END as `desc`
            FROM coupons 
            WHERE active = 1 
            ORDER BY discount_percent DESC, id DESC
        ');
        $coupons = $stmt->fetchAll();

        $userUsages = [];
        if ($email) {
            $uStmt = $pdo->prepare('SELECT coupon_code as coupon, order_id as orderId, discount_amount as discount FROM coupon_usages WHERE LOWER(customer_email) = ?');
            $uStmt->execute([$email]);
            $userUsages = $uStmt->fetchAll();
        }

        sendJson(200, ['coupons' => $coupons, 'usages' => $userUsages]);
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
            // Generate clean sequential order ID: ODD-00001, ODD-00002, etc. (Collision-Free)
            $maxSeq = 0;
            try {
                $stmt = $pdo->query("SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) AS max_id FROM orders WHERE id LIKE 'ODD-%'");
                $maxSeq = (int)($stmt->fetchColumn() ?: 0);
            } catch (Throwable $e) {}

            $nextNum = max(1, $maxSeq + 1);
            $orderId = 'ODD-' . str_pad((string)$nextNum, 5, '0', STR_PAD_LEFT);

            // Double check uniqueness with SELECT FOR UPDATE to guarantee no duplicate key
            $chk = $pdo->prepare('SELECT COUNT(*) FROM orders WHERE id = ? FOR UPDATE');
            while (true) {
                $chk->execute([$orderId]);
                if ((int)$chk->fetchColumn() === 0) {
                    break;
                }
                $nextNum++;
                $orderId = 'ODD-' . str_pad((string)$nextNum, 5, '0', STR_PAD_LEFT);
            }
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

            // Send rich HTML order confirmation email with breakdown
            try {
                $fullOrderData = [
                    'id' => $orderId,
                    'customer_name' => $customer,
                    'customer_email' => $email,
                    'customer_phone' => $phone,
                    'shipping_address' => $address,
                    'subtotal' => $subtotal,
                    'discount_amount' => $discountAmount,
                    'coupon_code' => $appliedCode,
                    'shipping_fee' => $shippingFee,
                    'total_amount' => $totalAmount,
                    'payment_method' => $paymentMethod,
                    'gateway' => $isOnline ? 'Razorpay Live' : 'Cash on Delivery (COD)',
                    'items' => $itemsData
                ];
                sendOrderConfirmationEmail($fullOrderData);
            } catch (Throwable $e) {}

            // Optional Shiprocket Auto-Dispatch on checkout
            try {
                $srRow = $pdo->query('SELECT value_json FROM settings WHERE key_name = "shiprocket"')->fetch();
                $srCfg = $srRow ? json_decode($srRow['value_json'], true) : [];
                if (!empty($srCfg['autoDispatch'])) {
                    dispatchOrderWithShiprocket($pdo, $orderId);
                }
            } catch (Throwable $e) {}

            sendJson(201, ['success' => true, 'orderId' => $orderId, 'trackingToken' => $trackingToken, 'totalAmount' => $totalAmount, 'status' => 'Confirmed']);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendJson(400, ['error' => $e->getMessage()]);
        }
    }

    if ($route === 'orders/clear-test-orders' && $method === 'POST') {
        requireStaffAuth('admin');
        try {
            $pdo->beginTransaction();
            $pdo->exec('DELETE FROM order_items');
            $pdo->exec('DELETE FROM orders');
            $pdo->exec('DELETE FROM inventory_movements WHERE reason LIKE "%test%" OR reason LIKE "%COD%" OR reason LIKE "%order%" OR reason LIKE "%batch receipt%"');
            $pdo->commit();
            sendJson(200, ['success' => true, 'message' => 'All test orders and stock commitments have been cleared. Store reset to zero active orders.']);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            sendJson(500, ['error' => 'Failed to clear test orders: ' . $e->getMessage()]);
        }
    }

    if ($route === 'orders' && $method === 'GET') {
        requireStaffAuth('orders');

        $orders = $pdo->query('
            SELECT id, customer_name as customer, customer_email as email, customer_phone as phone,
                   shipping_address as address, subtotal, discount_amount as discount, coupon_code as coupon,
                   shipping_fee as shipping, total_amount as total, total_amount as amount,
                   payment_method as paymentMethod, payment_method as method, payment_method, payment_status as paymentStatus, payment_status, status, gateway,
                   courier_name as courier, courier_name, tracking_number as trackingNumber, tracking_number, tracking_url as trackingUrl, tracking_url, label_url as labelUrl, label_url,
                   razorpay_payment_id as razorpayPaymentId, created_at as date, created_at as createdAt,
                   dispatched_at as dispatchedAt, dispatched_at,
                   delivered_at as deliveredAt, delivered_at,
                   cancelled_at as cancelledAt, cancelled_at
            FROM orders ORDER BY created_at DESC
        ')->fetchAll();

        $iStmt = $pdo->prepare('SELECT product_id as id, sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?');
        foreach ($orders as &$o) {
            $iStmt->execute([$o['id']]);
            $o['items'] = $iStmt->fetchAll();
            if (!empty($o['delivered_at'])) {
                $o['estimatedDelivery'] = $o['delivered_at'];
            } elseif (!empty($o['dispatched_at'])) {
                $o['estimatedDelivery'] = date('Y-m-d H:i:s', strtotime($o['dispatched_at']) + (4 * 86400));
            } else {
                $o['estimatedDelivery'] = date('Y-m-d H:i:s', strtotime($o['date'] ?: 'now') + (5 * 86400));
            }
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
        } elseif ($orderId && getStaffSession()) {
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
            $stmt->execute([$orderId]);
            $order = $stmt->fetch();
        }

        if (!$order) sendJson(404, ['error' => 'Order not found. Please verify your Order ID and contact phone number.']);

        $iStmt = $pdo->prepare('SELECT sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?');
        $iStmt->execute([$order['id']]);

        $dispatchedAt = $order['dispatched_at'] ?: (($order['status'] === 'Dispatched' || !empty($order['tracking_number'])) ? ($order['updated_at'] ?: $order['created_at']) : null);
        $deliveredAt = $order['delivered_at'] ?: ($order['status'] === 'Delivered' ? ($order['updated_at'] ?: $order['created_at']) : null);
        $cancelledAt = $order['cancelled_at'] ?: ($order['status'] === 'Cancelled' ? ($order['updated_at'] ?: $order['created_at']) : null);

        $estimatedDelivery = null;
        if (!empty($deliveredAt)) {
            $estimatedDelivery = $deliveredAt;
        } elseif (!empty($dispatchedAt)) {
            $estimatedDelivery = date('Y-m-d H:i:s', strtotime($dispatchedAt) + (4 * 86400));
        } elseif (!empty($order['created_at'])) {
            $estimatedDelivery = date('Y-m-d H:i:s', strtotime($order['created_at']) + (5 * 86400));
        }

        sendJson(200, [
            'id' => $order['id'],
            'status' => $order['status'],
            'subtotal' => (int)$order['subtotal'],
            'discount' => (int)$order['discount_amount'],
            'coupon' => $order['coupon_code'],
            'shipping' => (int)$order['shipping_fee'],
            'total' => (int)$order['total_amount'],
            'amount' => (int)$order['total_amount'],
            'courier' => $order['courier_name'] ?? null,
            'courier_name' => $order['courier_name'] ?? null,
            'trackingNumber' => $order['tracking_number'] ?? null,
            'tracking_number' => $order['tracking_number'] ?? null,
            'trackingUrl' => $order['tracking_url'] ?? null,
            'tracking_url' => $order['tracking_url'] ?? null,
            'labelUrl' => $order['label_url'] ?? null,
            'label_url' => $order['label_url'] ?? null,
            'date' => $order['created_at'],
            'createdAt' => $order['created_at'],
            'created_at' => $order['created_at'],
            'dispatchedAt' => $dispatchedAt,
            'dispatched_at' => $dispatchedAt,
            'deliveredAt' => $deliveredAt,
            'delivered_at' => $deliveredAt,
            'cancelledAt' => $cancelledAt,
            'cancelled_at' => $cancelledAt,
            'estimatedDelivery' => $estimatedDelivery,
            'estimated_delivery' => $estimatedDelivery,
            'items' => $iStmt->fetchAll()
        ]);
    }

    // Customer Portal: Live Customer Orders Query
    if (($route === 'customer/orders' || $route === 'orders/my') && $method === 'GET') {
        $cSession = getCustomerSession();
        $email = strtolower(trim((string)($_GET['email'] ?? ($cSession['email'] ?? ''))));
        $rawPhone = trim((string)($_GET['phone'] ?? ($cSession['phone'] ?? '')));
        $cleanPhone = preg_replace('/[^0-9]/', '', $rawPhone);

        if (!$email && !$cleanPhone) {
            sendJson(200, ['orders' => []]);
        }

        $clauses = [];
        $params = [];
        if ($email) {
            $clauses[] = 'LOWER(customer_email) = ?';
            $params[] = $email;
        }
        if ($cleanPhone) {
            $clauses[] = 'REPLACE(REPLACE(customer_phone, "+91", ""), " ", "") LIKE ?';
            $params[] = '%' . substr($cleanPhone, -10);
        }

        $query = '
            SELECT id, customer_name as customer, customer_email as email, customer_phone as phone,
                   shipping_address as address, subtotal, discount_amount as discount, coupon_code as coupon,
                   shipping_fee as shipping, total_amount as total, total_amount as amount,
                   payment_method as paymentMethod, payment_status as paymentStatus, status,
                   courier_name as courier, tracking_number as trackingNumber, tracking_url as trackingUrl,
                   created_at as date, dispatched_at as dispatchedAt, delivered_at as deliveredAt
            FROM orders
            WHERE (' . implode(' OR ', $clauses) . ')
            ORDER BY created_at DESC';

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);
        $orders = $stmt->fetchAll();

        $iStmt = $pdo->prepare('SELECT product_id as id, sku, name, price, quantity as qty, line_total FROM order_items WHERE order_id = ?');
        foreach ($orders as &$o) {
            $iStmt->execute([$o['id']]);
            $o['items'] = $iStmt->fetchAll();
        }

        sendJson(200, ['orders' => $orders]);
    }

    // --- 7. Razorpay Payments ---
    if ($route === 'payments/create-order' && $method === 'POST') {
        $body = getJsonBody();
        $amount = (int)round((float)($body['amount'] ?? 0));
        if ($amount <= 0) sendJson(400, ['error' => 'Invalid amount.']);

        $rzpCfg = getRazorpayConfig($pdo);
        if (!$rzpCfg['enabled']) {
            sendJson(503, ['error' => 'Razorpay online payments are currently disabled in store settings. Please choose Cash on Delivery (COD).']);
        }
        if (!$rzpCfg['keyId'] || !$rzpCfg['keySecret']) {
            sendJson(503, ['error' => 'Razorpay gateway not configured. Please choose Cash on Delivery (COD).']);
        }

        $ch = curl_init('https://api.razorpay.com/v1/orders');
        curl_setopt($ch, CURLOPT_USERPWD, $rzpCfg['keyId'] . ':' . $rzpCfg['keySecret']);
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

        sendJson(200, ['orderId' => $rzp['id'], 'amount' => $rzp['amount'], 'currency' => $rzp['currency'], 'keyId' => $rzpCfg['keyId']]);
    }

    if ($route === 'payments/verify' && $method === 'POST') {
        $body = getJsonBody();
        $rOrderId = $body['razorpay_order_id'] ?? '';
        $rPayId = $body['razorpay_payment_id'] ?? '';
        $rSig = $body['razorpay_signature'] ?? '';
        $orderId = $body['order_id'] ?? '';

        if (!$rOrderId || !$rPayId || !$rSig) sendJson(400, ['error' => 'Missing signature components.']);

        $rzpCfg = getRazorpayConfig($pdo);
        $expected = hash_hmac('sha256', $rOrderId . '|' . $rPayId, $rzpCfg['keySecret']);
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

    // --- 7B. Shiprocket Multi-Carrier Shipping API ---
    function getShiprocketToken(PDO $pdo): ?string {
        try {
            $tRow = $pdo->query('SELECT value_json FROM settings WHERE key_name = "shiprocket_token"')->fetch();
            if ($tRow) {
                $tData = json_decode($tRow['value_json'], true);
                if (!empty($tData['token']) && !empty($tData['expires_at']) && $tData['expires_at'] > time() + 3600) {
                    return $tData['token'];
                }
            }
        } catch (Throwable $e) {}

        $sRow = $pdo->query('SELECT value_json FROM settings WHERE key_name = "shiprocket"')->fetch();
        $sCfg = $sRow ? json_decode($sRow['value_json'], true) : [];
        $email = trim((string)($sCfg['email'] ?? (defined('SHIPROCKET_EMAIL') ? SHIPROCKET_EMAIL : '')));
        $password = trim((string)($sCfg['password'] ?? (defined('SHIPROCKET_PASSWORD') ? SHIPROCKET_PASSWORD : '')));

        if (!empty($sCfg['token'])) return $sCfg['token'];
        if (defined('SHIPROCKET_TOKEN') && SHIPROCKET_TOKEN !== '') return SHIPROCKET_TOKEN;

        if (!$email || !$password) return null;

        $ch = curl_init('https://apiv2.shiprocket.in/v1/external/auth/login');
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['email' => $email, 'password' => $password]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $data = json_decode((string)$resp, true);
        if ($code === 200 && !empty($data['token'])) {
            $token = $data['token'];
            $expiresAt = time() + (9 * 86400);
            try {
                $pdo->prepare('
                    INSERT INTO settings (key_name, value_json, updated_at) VALUES ("shiprocket_token", ?, NOW())
                    ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()
                ')->execute([json_encode(['token' => $token, 'expires_at' => $expiresAt])]);
            } catch (Throwable $e) {}
            return $token;
        }
        return null;
    }

    if ($route === 'shipping/shiprocket/test' && $method === 'POST') {
        $body = getJsonBody();
        $email = trim((string)($body['email'] ?? ''));
        $password = trim((string)($body['password'] ?? ''));

        if (!$email || str_contains($password, '••••')) {
            $sRow = $pdo->query('SELECT value_json FROM settings WHERE key_name = "shiprocket"')->fetch();
            $sCfg = $sRow ? json_decode($sRow['value_json'], true) : [];
            if (!$email) $email = trim((string)($sCfg['email'] ?? (defined('SHIPROCKET_EMAIL') ? SHIPROCKET_EMAIL : '')));
            if (!$password || str_contains($password, '••••')) $password = trim((string)($sCfg['password'] ?? (defined('SHIPROCKET_PASSWORD') ? SHIPROCKET_PASSWORD : '')));
        }

        if (!$email || !$password) {
            sendJson(400, ['success' => false, 'error' => 'Shiprocket email and password are required.']);
        }

        $ch = curl_init('https://apiv2.shiprocket.in/v1/external/auth/login');
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['email' => $email, 'password' => $password]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        $resp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode((string)$resp, true);
        if ($httpCode === 200 && !empty($json['token'])) {
            $expiresAt = time() + (9 * 86400);
            try {
                $pdo->prepare('
                    INSERT INTO settings (key_name, value_json, updated_at) VALUES ("shiprocket_token", ?, NOW())
                    ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()
                ')->execute([json_encode(['token' => $json['token'], 'expires_at' => $expiresAt])]);
            } catch (Throwable $e) {}

            sendJson(200, [
                'success' => true,
                'message' => 'Shiprocket connection verified! API authentication successful.',
                'account' => [
                    'id' => $json['id'] ?? null,
                    'email' => $json['email'] ?? $email,
                    'name' => trim(($json['first_name'] ?? '') . ' ' . ($json['last_name'] ?? ''))
                ]
            ]);
        } else {
            $errMsg = $json['message'] ?? 'Failed to authenticate with Shiprocket API.';
            if ($httpCode === 403 || stripos($errMsg, 'invalid') !== false) {
                $errMsg = 'Shiprocket authentication failed (Invalid email or password). Please configure an API user in Shiprocket Dashboard -> Settings -> API -> Configure API and save the credentials.';
            }
            sendJson(400, ['success' => false, 'error' => $errMsg, 'httpCode' => $httpCode]);
        }
    }

    function sendOrderConfirmationEmail(array $order): bool {
        $to = $order['customer_email'] ?? '';
        if (!$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;

        $orderId = htmlspecialchars($order['id'] ?? 'ODD');
        $customerName = htmlspecialchars($order['customer_name'] ?? 'Valued Customer');
        $shippingAddress = htmlspecialchars($order['shipping_address'] ?? '');
        $phone = htmlspecialchars($order['customer_phone'] ?? '');
        $subtotal = number_format((float)($order['subtotal'] ?? 0), 2);
        $discount = (float)($order['discount_amount'] ?? 0);
        $coupon = htmlspecialchars($order['coupon_code'] ?? '');
        $shipping = (float)($order['shipping_fee'] ?? 0);
        $total = number_format((float)($order['total_amount'] ?? 0), 2);

        $isCod = (strtolower($order['payment_method'] ?? '') === 'cod')
            || str_contains(strtolower($order['gateway'] ?? ''), 'cash')
            || str_contains(strtolower($order['gateway'] ?? ''), 'cod');

        $items = $order['items'] ?? [];
        $itemsHtml = '';
        foreach ($items as $it) {
            $name = htmlspecialchars($it['name'] ?? 'ODD Fragrance');
            $qty = (int)($it['quantity'] ?? 1);
            $price = number_format((float)($it['price'] ?? 1599), 2);
            $lineTotal = number_format((float)($it['line_total'] ?? ($qty * 1599)), 2);
            $itemsHtml .= "
                <tr>
                    <td style='padding:10px 0; border-bottom:1px solid #eeeeee;'><strong>{$name}</strong></td>
                    <td style='padding:10px 0; border-bottom:1px solid #eeeeee; text-align:center;'>{$qty}</td>
                    <td style='padding:10px 0; border-bottom:1px solid #eeeeee; text-align:right;'>₹{$price}</td>
                    <td style='padding:10px 0; border-bottom:1px solid #eeeeee; text-align:right;'>₹{$lineTotal}</td>
                </tr>
            ";
        }

        $paymentNotice = $isCod
            ? "<div style='background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:14px; margin:20px 0; color:#92400e; font-size:13px;'>
                 <strong>Payment Mode: Cash on Delivery (COD)</strong><br>
                 Amount to pay upon arrival: <strong>₹{$total}</strong><br>
                 Please keep exact cash ready for the courier partner upon arrival.
               </div>"
            : "<div style='background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; padding:14px; margin:20px 0; color:#065f46; font-size:13px;'>
                 <strong>Payment Mode: Online Prepaid (Razorpay Live)</strong><br>
                 Payment status: <strong>Paid &amp; Verified</strong><br>
                 Your transaction has been securely confirmed via Razorpay. No cash needs to be paid upon delivery.
               </div>";

        $subject = "Order Confirmed: #{$orderId} | ODD Perfume";
        $trackingLink = "https://test.oddperfume.com/order-tracking.html?orderId={$orderId}";

        $html = "
        <!DOCTYPE html>
        <html>
        <head><meta charset='UTF-8'></head>
        <body style='font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif; color:#111; background:#f4f4f5; margin:0; padding:20px;'>
          <div style='max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb;'>
            <div style='background:#111827; padding:24px; text-align:center;'>
              <h1 style='color:#ffffff; margin:0; font-size:24px; letter-spacing:0.05em;'>ODD<span style='color:#E86B32;'>.</span></h1>
              <p style='color:#9ca3af; margin:4px 0 0; font-size:12px; text-transform:uppercase; letter-spacing:0.1em;'>Haute Parfumerie &middot; Order Confirmation</p>
            </div>
            <div style='padding:30px;'>
              <h2 style='font-size:18px; margin-top:0;'>Thank you for your order, {$customerName}!</h2>
              <p style='color:#4b5563; font-size:14px;'>We have received your order <strong>#{$orderId}</strong> and are preparing it at our Mumbai fulfillment studio.</p>
              
              {$paymentNotice}

              <h3 style='font-size:14px; text-transform:uppercase; letter-spacing:0.05em; color:#6b7280; margin-top:24px; margin-bottom:8px; border-bottom:2px solid #111; padding-bottom:6px;'>Items in your order</h3>
              <table style='width:100%; border-collapse:collapse; font-size:13px;'>
                <thead>
                  <tr style='color:#6b7280; text-align:left; font-size:11px; text-transform:uppercase;'>
                    <th style='padding-bottom:8px;'>Item</th>
                    <th style='padding-bottom:8px; text-align:center;'>Qty</th>
                    <th style='padding-bottom:8px; text-align:right;'>Price</th>
                    <th style='padding-bottom:8px; text-align:right;'>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {$itemsHtml}
                </tbody>
              </table>

              <div style='margin-top:16px; border-top:1px solid #e5e7eb; padding-top:12px; font-size:13px;'>
                <div style='display:flex; justify-content:space-between; margin-bottom:6px; color:#4b5563;'>
                  <span>Subtotal:</span><strong>₹{$subtotal}</strong>
                </div>" . ($discount > 0 ? "
                <div style='display:flex; justify-content:space-between; margin-bottom:6px; color:#E86B32;'>
                  <span>Coupon Discount ({$coupon}):</span><strong>-₹" . number_format($discount, 2) . "</strong>
                </div>" : "") . "
                <div style='display:flex; justify-content:space-between; margin-bottom:6px; color:#4b5563;'>
                  <span>Shipping &amp; Delivery:</span><strong>" . ($shipping > 0 ? "₹" . number_format($shipping, 2) : "FREE") . "</strong>
                </div>
                <div style='display:flex; justify-content:space-between; font-size:16px; font-weight:800; border-top:2px solid #111; padding-top:8px; margin-top:8px;'>
                  <span>Total Payable:</span><strong>₹{$total}</strong>
                </div>
              </div>

              <div style='background:#f9fafb; border:1px solid #f3f4f6; border-radius:6px; padding:14px; margin-top:24px; font-size:13px;'>
                <strong style='display:block; margin-bottom:4px;'>Delivery Address:</strong>
                <div style='color:#4b5563;'>{$shippingAddress}</div>
                <div style='color:#6b7280; font-size:12px; margin-top:4px;'>Contact: {$phone}</div>
              </div>

              <div style='text-align:center; margin-top:28px;'>
                <a href='{$trackingLink}' style='background:#111827; color:#ffffff; padding:12px 24px; text-decoration:none; font-weight:700; border-radius:6px; font-size:13px; display:inline-block;'>Track Your Order Live</a>
              </div>
            </div>
            <div style='background:#f9fafb; border-top:1px solid #e5e7eb; padding:16px; text-align:center; font-size:11px; color:#9ca3af;'>
              &copy; 2026 ODD Perfumes &middot; Mumbai, India &middot; hello@oddperfume.com
            </div>
          </div>
        </body>
        </html>
        ";

        $emailsDir = __DIR__ . '/../storage/emails';
        if (!is_dir($emailsDir)) @mkdir($emailsDir, 0755, true);
        @file_put_contents("{$emailsDir}/{$orderId}_confirmation.html", $html);

        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: ODD Perfumes <orders@oddperfume.com>\r\n";
        $headers .= "Reply-To: hello@oddperfume.com\r\n";

        return @mail($to, $subject, $html, $headers);
    }

    function sendDispatchNotificationEmail(array $order, string $awb, string $courier, string $trackingUrl, string $labelUrl): bool {
        $to = $order['customer_email'] ?? '';
        if (!$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;

        $orderId = htmlspecialchars($order['id'] ?? 'ODD');
        $customerName = htmlspecialchars($order['customer_name'] ?? 'Valued Customer');
        $courierSafe = htmlspecialchars($courier ?: 'Shiprocket Express');
        $awbSafe = htmlspecialchars($awb);
        $total = number_format((float)($order['total_amount'] ?? 0), 2);

        $isCod = (strtolower($order['payment_method'] ?? '') === 'cod')
            || str_contains(strtolower($order['gateway'] ?? ''), 'cash')
            || str_contains(strtolower($order['gateway'] ?? ''), 'cod');

        $subject = "Your Order is On Its Way: #{$orderId} | Courier AWB: {$awbSafe}";
        $liveTrackUrl = $trackingUrl ?: "https://test.oddperfume.com/order-tracking.html?orderId={$orderId}";

        $codNotice = $isCod
            ? "<div style='background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:12px 14px; margin:16px 0; color:#92400e; font-size:13px;'>
                 <strong>Cash on Delivery (COD) Reminder:</strong><br>
                 Please keep exact cash amount of <strong>₹{$total}</strong> ready for the delivery partner upon arrival.
               </div>"
            : "<div style='background:#ecfdf5; border:1px solid #a7f3d0; border-radius:6px; padding:12px 14px; margin:16px 0; color:#065f46; font-size:13px;'>
                 <strong>Prepaid Order (Razorpay):</strong><br>
                 Payment of ₹{$total} was verified and settled. No payment is required upon delivery.
               </div>";

        $html = "
        <!DOCTYPE html>
        <html>
        <head><meta charset='UTF-8'></head>
        <body style='font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif; color:#111; background:#f4f4f5; margin:0; padding:20px;'>
          <div style='max-width:600px; margin:0 auto; background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb;'>
            <div style='background:#111827; padding:24px; text-align:center;'>
              <h1 style='color:#ffffff; margin:0; font-size:24px; letter-spacing:0.05em;'>ODD<span style='color:#E86B32;'>.</span></h1>
              <p style='color:#9ca3af; margin:4px 0 0; font-size:12px; text-transform:uppercase; letter-spacing:0.1em;'>Haute Parfumerie &middot; Shipment Dispatched</p>
            </div>
            <div style='padding:30px;'>
              <h2 style='font-size:18px; margin-top:0;'>Your perfume is on the move, {$customerName}!</h2>
              <p style='color:#4b5563; font-size:14px;'>Order <strong>#{$orderId}</strong> has been handed to our courier partner and is en route to your delivery address.</p>

              <div style='background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin:20px 0;'>
                <span style='font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#64748b; display:block;'>Logistics Partner</span>
                <strong style='font-size:15px; color:#0f172a;'>{$courierSafe}</strong>
                <div style='margin-top:6px; font-size:13px;'>AWB Tracking: <strong style='font-family:monospace; color:#0f172a;'>{$awbSafe}</strong></div>
              </div>

              {$codNotice}

              <div style='text-align:center; margin-top:28px;'>
                <a href='{$liveTrackUrl}' style='background:#111827; color:#ffffff; padding:12px 24px; text-decoration:none; font-weight:700; border-radius:6px; font-size:13px; display:inline-block;'>Track Courier Live</a>
              </div>
            </div>
            <div style='background:#f9fafb; border-top:1px solid #e5e7eb; padding:16px; text-align:center; font-size:11px; color:#9ca3af;'>
              &copy; 2026 ODD Perfumes &middot; Mumbai, India &middot; hello@oddperfume.com
            </div>
          </div>
        </body>
        </html>
        ";

        $emailsDir = __DIR__ . '/../storage/emails';
        if (!is_dir($emailsDir)) @mkdir($emailsDir, 0755, true);
        @file_put_contents("{$emailsDir}/{$orderId}_dispatch.html", $html);

        $headers = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: ODD Perfumes <shipping@oddperfume.com>\r\n";
        $headers .= "Reply-To: hello@oddperfume.com\r\n";

        return @mail($to, $subject, $html, $headers);
    }

    function dispatchOrderWithShiprocket(PDO $pdo, string $orderId): array {
        $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
        $stmt->execute([$orderId]);
        $order = $stmt->fetch();
        if (!$order) {
            return ['success' => false, 'error' => "Order {$orderId} not found."];
        }

        // If already has label, return existing
        if (!empty($order['tracking_number']) && !empty($order['label_url'])) {
            return [
                'success' => true,
                'alreadyGenerated' => true,
                'trackingNumber' => $order['tracking_number'],
                'tracking_number' => $order['tracking_number'],
                'labelUrl' => $order['label_url'],
                'label_url' => $order['label_url'],
                'trackUrl' => $order['tracking_url'],
                'tracking_url' => $order['tracking_url'],
                'carrier' => $order['courier_name'],
                'courier_name' => $order['courier_name'],
                'message' => "Label already generated: {$order['courier_name']} AWB {$order['tracking_number']}"
            ];
        }

        // Fetch Shiprocket settings
        $sStmt = $pdo->query('SELECT value_json FROM settings WHERE key_name = "shiprocket"');
        $sRow = $sStmt ? $sStmt->fetch() : null;
        $srCfg = $sRow ? json_decode($sRow['value_json'], true) : [];
        $pickupLocation = trim((string)($srCfg['pickupLocation'] ?? (defined('SHIPROCKET_PICKUP_LOCATION') ? SHIPROCKET_PICKUP_LOCATION : 'Primary')));
        if (!$pickupLocation) $pickupLocation = 'Primary';

        $token = getShiprocketToken($pdo);
        if (!$token) {
            return [
                'success' => false,
                'error' => 'Shiprocket API token could not be obtained. Please verify Shiprocket email and password in Shipping Settings.'
            ];
        }

        // Parse customer destination address
        $destAddress = trim((string)$order['shipping_address']);
        $pincode = '400001';
        if (preg_match('/\b\d{6}\b/', $destAddress, $m)) {
            $pincode = $m[0];
        }

        $destCity = 'Mumbai';
        if (preg_match('/,\s*([^,-]+?)\s*-\s*\d{6}/', $destAddress, $cm)) {
            $destCity = trim($cm[1]);
        }

        $pfx2 = (int)substr($pincode, 0, 2);
        $destState = 'Maharashtra';
        if ($pfx2 === 11) $destState = 'Delhi';
        elseif ($pfx2 >= 12 && $pfx2 <= 13) $destState = 'Haryana';
        elseif ($pfx2 >= 14 && $pfx2 <= 16) $destState = 'Punjab';
        elseif ($pfx2 === 17) $destState = 'Himachal Pradesh';
        elseif ($pfx2 >= 18 && $pfx2 <= 19) $destState = 'Jammu and Kashmir';
        elseif ($pfx2 >= 20 && $pfx2 <= 28) $destState = 'Uttar Pradesh';
        elseif ($pfx2 >= 30 && $pfx2 <= 34) $destState = 'Rajasthan';
        elseif ($pfx2 >= 36 && $pfx2 <= 39) $destState = 'Gujarat';
        elseif ($pfx2 >= 40 && $pfx2 <= 44) $destState = 'Maharashtra';
        elseif ($pfx2 >= 45 && $pfx2 <= 48) $destState = 'Madhya Pradesh';
        elseif ($pfx2 >= 50 && $pfx2 <= 53) $destState = 'Telangana';
        elseif ($pfx2 >= 56 && $pfx2 <= 59) $destState = 'Karnataka';
        elseif ($pfx2 >= 60 && $pfx2 <= 64) $destState = 'Tamil Nadu';
        elseif ($pfx2 >= 67 && $pfx2 <= 69) $destState = 'Kerala';
        elseif ($pfx2 >= 70 && $pfx2 <= 74) $destState = 'West Bengal';
        elseif ($pfx2 >= 80 && $pfx2 <= 85) $destState = 'Bihar';

        $totalAmount = (float)$order['total_amount'];
        $isCod = (strtolower($order['payment_method'] ?? '') === 'cod')
            || (str_contains(strtolower($order['gateway'] ?? ''), 'cash'))
            || (str_contains(strtolower($order['gateway'] ?? ''), 'cod'));

        $customerName = trim((string)($order['customer_name'] ?: 'Valued Customer'));
        $nameParts = explode(' ', $customerName, 2);
        $firstName = $nameParts[0];
        $lastName = !empty($nameParts[1]) ? $nameParts[1] : 'Customer';

        // Fetch order items
        $iStmt = $pdo->prepare('SELECT * FROM order_items WHERE order_id = ?');
        $iStmt->execute([$orderId]);
        $items = $iStmt->fetchAll();

        $orderItems = [];
        if (!empty($items)) {
            foreach ($items as $it) {
                $name = $it['product_name'] ?? 'ODD Perfume';
                $sku = 'ODD-' . strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $name), 0, 10));
                $units = max(1, (int)($it['quantity'] ?? 1));
                $sellingPrice = (float)($it['price'] ?? ($totalAmount / $units));
                $orderItems[] = [
                    'name' => $name,
                    'sku' => $sku,
                    'units' => $units,
                    'selling_price' => $sellingPrice,
                    'discount' => 0,
                    'tax' => 0,
                    'hsn' => 330300
                ];
            }
        } else {
            $orderItems[] = [
                'name' => 'ODD Eau de Parfum (100ml)',
                'sku' => 'ODD-PARFUM-100',
                'units' => 1,
                'selling_price' => $totalAmount,
                'discount' => 0,
                'tax' => 0,
                'hsn' => 330300
            ];
        }

        $orderDate = !empty($order['created_at']) ? date('Y-m-d H:i', strtotime($order['created_at'])) : date('Y-m-d H:i');

        $srOrderPayload = [
            'order_id' => $orderId,
            'order_date' => $orderDate,
            'pickup_location' => $pickupLocation,
            'channel_id' => '',
            'comment' => 'ODD Luxury Perfume Order',
            'billing_customer_name' => $firstName,
            'billing_last_name' => $lastName,
            'billing_address' => substr($destAddress, 0, 100),
            'billing_address_2' => '',
            'billing_city' => $destCity,
            'billing_pincode' => $pincode,
            'billing_state' => $destState,
            'billing_country' => 'India',
            'billing_email' => $order['customer_email'] ?: 'orders@oddperfume.com',
            'billing_phone' => preg_replace('/[^0-9]/', '', $order['customer_phone'] ?: '9876543210'),
            'shipping_is_billing' => true,
            'order_items' => $orderItems,
            'payment_method' => $isCod ? 'COD' : 'Prepaid',
            'shipping_charges' => (float)($order['shipping_fee'] ?? 0),
            'giftwrap_charges' => 0,
            'transaction_charges' => 0,
            'total_discount' => (float)($order['discount_amount'] ?? 0),
            'sub_total' => $totalAmount,
            'length' => 15,
            'breadth' => 10,
            'height' => 8,
            'weight' => 0.4
        ];

        // 1. Create Adhoc Order in Shiprocket
        $ch = curl_init('https://apiv2.shiprocket.in/v1/external/orders/create/adhoc');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$token}",
            "Content-Type: application/json"
        ]);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($srOrderPayload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        $srResp = curl_exec($ch);
        curl_close($ch);

        $srJson = json_decode((string)$srResp, true);
        $shipmentId = $srJson['shipment_id'] ?? null;

        if (!$shipmentId) {
            $err = $srJson['message'] ?? 'Failed to create order in Shiprocket.';
            if (!empty($srJson['errors'])) {
                $err .= ' Details: ' . json_encode($srJson['errors']);
            }
            return ['success' => false, 'error' => $err, 'raw' => $srJson];
        }

        // 2. Assign AWB in Shiprocket
        $awbPayload = ['shipment_id' => $shipmentId];
        $ch2 = curl_init('https://apiv2.shiprocket.in/v1/external/courier/assign/awb');
        curl_setopt($ch2, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$token}",
            "Content-Type: application/json"
        ]);
        curl_setopt($ch2, CURLOPT_POST, true);
        curl_setopt($ch2, CURLOPT_POSTFIELDS, json_encode($awbPayload));
        curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch2, CURLOPT_TIMEOUT, 15);
        $awbResp = curl_exec($ch2);
        curl_close($ch2);

        $awbJson = json_decode((string)$awbResp, true);
        $awbData = $awbJson['response']['data'] ?? $awbJson['data'] ?? [];
        $trackingNumber = $awbData['awb_code'] ?? null;
        $courierName = $awbData['courier_name'] ?? 'Shiprocket Logistics Partner';

        if (!$trackingNumber) {
            $err = $awbJson['message'] ?? $awbJson['response']['data']['error'] ?? 'Shiprocket could not assign AWB for this shipment.';
            return ['success' => false, 'error' => $err, 'shipment_id' => $shipmentId, 'raw' => $awbJson];
        }

        // 3. Generate Label in Shiprocket
        $labelPayload = ['shipment_id' => [$shipmentId]];
        $ch3 = curl_init('https://apiv2.shiprocket.in/v1/external/courier/generate/label');
        curl_setopt($ch3, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$token}",
            "Content-Type: application/json"
        ]);
        curl_setopt($ch3, CURLOPT_POST, true);
        curl_setopt($ch3, CURLOPT_POSTFIELDS, json_encode($labelPayload));
        curl_setopt($ch3, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch3, CURLOPT_TIMEOUT, 15);
        $labelResp = curl_exec($ch3);
        curl_close($ch3);

        $labelJson = json_decode((string)$labelResp, true);
        $labelUrl = $labelJson['label_url'] ?? $labelJson['response']['label_url'] ?? null;
        $trackUrl = "https://shiprocket.co/tracking/" . $trackingNumber;

        // 4. Update Database
        $pdo->prepare('UPDATE orders SET courier_name = ?, tracking_number = ?, tracking_url = ?, label_url = ?, status = "Dispatched", dispatched_at = NOW(), updated_at = NOW() WHERE id = ?')
            ->execute([$courierName, $trackingNumber, $trackUrl, $labelUrl, $orderId]);

        // 5. Send dispatch notification email
        try {
            sendDispatchNotificationEmail($order, $trackingNumber, $courierName, $trackUrl, (string)$labelUrl);
        } catch (Throwable $e) {}

        return [
            'success' => true,
            'trackingNumber' => $trackingNumber,
            'tracking_number' => $trackingNumber,
            'labelUrl' => $labelUrl,
            'label_url' => $labelUrl,
            'trackUrl' => $trackUrl,
            'tracking_url' => $trackUrl,
            'carrier' => $courierName,
            'courier_name' => $courierName,
            'message' => "Shiprocket label generated with {$courierName}! AWB: {$trackingNumber}"
        ];
    }

    if ($route === 'shipping/shiprocket/create-label' && $method === 'POST') {
        requireStaffAuth('shipping');
        $body = getJsonBody();
        $orderId = trim((string)($body['orderId'] ?? ''));
        if (!$orderId) sendJson(400, ['error' => 'Order ID is required.']);

        $res = dispatchOrderWithShiprocket($pdo, $orderId);
        sendJson(!empty($res['success']) ? 200 : 400, $res);
    }

    if ($route === 'shipping/shiprocket/rates' && $method === 'POST') {
        $body = getJsonBody();
        $destPincode = trim((string)($body['postalCode'] ?? $body['pincode'] ?? '400001'));
        if (!preg_match('/^\d{6}$/', $destPincode)) {
            sendJson(400, ['error' => 'Please provide a valid 6-digit Indian PIN code.']);
        }

        $sStmt = $pdo->query('SELECT value_json FROM settings WHERE key_name = "shiprocket"');
        $sRow = $sStmt ? $sStmt->fetch() : null;
        $srCfg = $sRow ? json_decode($sRow['value_json'], true) : [];
        $pickupPincode = trim((string)($srCfg['origin']['postalCode'] ?? '400001'));

        $isCod = !empty($body['isCod']) || !empty($body['cod']);
        $token = getShiprocketToken($pdo);

        if (!$token) {
            sendJson(200, [
                'success' => true,
                'rates' => [
                    [
                        'carrier' => 'Shiprocket Express',
                        'carrierName' => 'Shiprocket Express Partner',
                        'service' => 'Surface Express',
                        'serviceName' => 'Standard Express (2-4 Days)',
                        'totalPrice' => 0.00,
                        'currency' => 'INR',
                        'estimate' => '2-4 business days'
                    ]
                ]
            ]);
        }

        $url = "https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=" . urlencode($pickupPincode) . "&delivery_postcode=" . urlencode($destPincode) . "&weight=0.4&cod=" . ($isCod ? '1' : '0');
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$token}",
            "Content-Type: application/json"
        ]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        $resp = curl_exec($ch);
        curl_close($ch);

        $json = json_decode((string)$resp, true);
        $courierList = $json['data']['available_courier_companies'] ?? [];
        $rates = [];

        foreach ($courierList as $c) {
            $rates[] = [
                'carrier' => $c['courier_name'] ?? 'Express',
                'carrierName' => $c['courier_name'] ?? 'Courier',
                'service' => (string)($c['courier_company_id'] ?? 'standard'),
                'serviceName' => ($c['courier_name'] ?? 'Courier') . ' (' . ($c['etd'] ?? '2-4 days') . ')',
                'totalPrice' => (float)($c['rate'] ?? 0),
                'currency' => 'INR',
                'estimate' => $c['etd'] ?? '2-4 days'
            ];
        }

        if (empty($rates)) {
            $rates[] = [
                'carrier' => 'Shiprocket Express',
                'carrierName' => 'Shiprocket Multi-Carrier',
                'service' => 'express',
                'serviceName' => 'Standard Fast Delivery',
                'totalPrice' => 0.00,
                'currency' => 'INR',
                'estimate' => '2-4 business days'
            ];
        }

        sendJson(200, ['success' => true, 'count' => count($rates), 'rates' => $rates]);
    }

    if ($route === 'shipping/shiprocket/webhook' && $method === 'POST') {
        $body = getJsonBody();
        $trackingNumber = trim((string)($body['awb'] ?? $body['awb_code'] ?? $body['tracking_number'] ?? ''));
        $rawStatus = trim((string)($body['current_status'] ?? $body['status'] ?? ''));
        $orderId = trim((string)($body['order_id'] ?? $body['channel_order_id'] ?? ''));

        if (!$trackingNumber && !$orderId) {
            sendJson(200, ['success' => false, 'message' => 'No tracking number or order number supplied in webhook']);
        }

        $order = null;
        if ($trackingNumber) {
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE tracking_number = ? LIMIT 1');
            $stmt->execute([$trackingNumber]);
            $order = $stmt->fetch();
        }
        if (!$order && $orderId) {
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ? LIMIT 1');
            $stmt->execute([$orderId]);
            $order = $stmt->fetch();
        }

        if ($order) {
            $targetStatus = null;
            $sLower = strtolower($rawStatus);
            if (strpos($sLower, 'deliver') !== false) {
                $targetStatus = 'Delivered';
                $pdo->prepare('UPDATE orders SET status = "Delivered", payment_status = "Paid", delivered_at = NOW(), updated_at = NOW() WHERE id = ?')->execute([$order['id']]);
            } elseif (strpos($sLower, 'out for delivery') !== false) {
                $targetStatus = 'Out for Delivery';
                $pdo->prepare('UPDATE orders SET status = "Out for Delivery", updated_at = NOW() WHERE id = ?')->execute([$order['id']]);
            } elseif (strpos($sLower, 'transit') !== false || strpos($sLower, 'picked up') !== false || strpos($sLower, 'shipped') !== false) {
                $targetStatus = 'Dispatched';
                $pdo->prepare('UPDATE orders SET status = "Dispatched", updated_at = NOW() WHERE id = ?')->execute([$order['id']]);
            } elseif (strpos($sLower, 'rto') !== false || strpos($sLower, 'return') !== false || strpos($sLower, 'fail') !== false) {
                $targetStatus = 'Exception';
                $pdo->prepare('UPDATE orders SET status = "Exception", updated_at = NOW() WHERE id = ?')->execute([$order['id']]);
            }

            sendJson(200, [
                'success' => true,
                'matched' => true,
                'orderId' => $order['id'],
                'updatedStatus' => $targetStatus ?: $rawStatus
            ]);
        }

        sendJson(200, ['success' => true, 'matched' => false, 'message' => 'Webhook received and acknowledged']);
    }

    // --- 8. Barcodes & Scans ---
    if ($route === 'barcodes/batch' && $method === 'POST') {
        requireStaffAuth('barcodes');
        $body = getJsonBody();
        $prods = is_array($body['products'] ?? null) ? $body['products'] : [];
        $lot = trim((string)($body['lot'] ?? '01'));
        $mfg = (string)($body['mfg'] ?? date('Y-m-d'));
        $shelfLife = (int)($body['shelfLife'] ?? 36);
        $mrp = (int)($body['mrp'] ?? 1599);
        $startSerialParam = isset($body['startSerial']) && $body['startSerial'] !== '' ? max(1, (int)$body['startSerial']) : null;

        $expiry = date('Y-m-d', strtotime("+{$shelfLife} months", strtotime($mfg)));
        $labels = [];

        $pdo->beginTransaction();
        $bStmt = $pdo->prepare('
            INSERT INTO barcodes (serial, sku, product_name, lot_number, mfg_date, expiry_date, mrp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                product_name = VALUES(product_name),
                lot_number = VALUES(lot_number),
                mfg_date = VALUES(mfg_date),
                expiry_date = VALUES(expiry_date),
                mrp = VALUES(mrp)
        ');
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
            $qty = min(5000, max(1, (int)($p['qty'] ?? 1)));
            $countStmt->execute([$sku, $lot]);
            $existing = (int)$countStmt->fetch()['c'];

            $batchNum = preg_match('/(\d{1,2})$/', $lot, $m) ? str_pad($m[1], 2, '0', STR_PAD_LEFT) : '01';
            $startIdx = $startSerialParam !== null ? $startSerialParam : ($existing + 1);

            for ($i = 0; $i < $qty; $i++) {
                $cur = $startIdx + $i;
                $idx = str_pad((string)$cur, 2, '0', STR_PAD_LEFT);
                $serial = "{$prefix}-{$batchNum}-{$idx}";
                $bStmt->execute([$serial, $sku, $pName, $lot, $mfg, $expiry, $mrp]);
                $labels[] = ['sku' => $sku, 'name' => $pName, 'barcode' => $serial, 'serial' => $serial, 'lot' => $lot, 'mfg' => $mfg, 'expiry' => $expiry, 'mrp' => $mrp];
            }
        }
        $pdo->commit();
        sendJson(200, ['success' => true, 'labels' => $labels, 'expiry' => $expiry]);
    }

    if ($route === 'barcodes' && $method === 'GET') {
        requireStaffAuth('barcodes');
        $q = trim((string)($_GET['q'] ?? ''));
        if ($q !== '') {
            $stmt = $pdo->prepare('SELECT * FROM barcodes WHERE serial LIKE ? OR sku LIKE ? OR product_name LIKE ? ORDER BY id DESC LIMIT 100');
            $stmt->execute(["%{$q}%", "%{$q}%", "%{$q}%"]);
            $barcodes = $stmt->fetchAll();
        } else {
            $stmt = $pdo->query('SELECT * FROM barcodes ORDER BY id DESC LIMIT 100');
            $barcodes = $stmt->fetchAll();
        }
        sendJson(200, ['barcodes' => $barcodes]);
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

            // Otherwise code is SKU or registered barcode serial
            $cleanCode = str_replace(' ', '-', $rawCode);
            $noHyphens = str_replace(['-', ' '], '', $rawCode);

            // 1. Look up registered unique serial in barcodes table
            $stBarcode = $pdo->prepare("SELECT * FROM barcodes WHERE serial = ? OR REPLACE(serial, '-', '') = ? OR serial = ? LIMIT 1");
            $stBarcode->execute([$rawCode, $noHyphens, $cleanCode]);
            $barcodeRow = $stBarcode->fetch();

            $matchedProduct = null;
            $isBarcode = false;
            $serialNumber = $rawCode;
            $lotNumber = null;
            $mfgDate = null;
            $expDate = null;
            $mrpVal = null;

            if ($barcodeRow) {
                $isBarcode = true;
                $serialNumber = $barcodeRow['serial'];
                $lotNumber = $barcodeRow['lot_number'];
                $mfgDate = $barcodeRow['mfg_date'];
                $expDate = $barcodeRow['expiry_date'];
                $mrpVal = $barcodeRow['mrp'];

                $stProd = $pdo->prepare('SELECT * FROM products WHERE sku = ?');
                $stProd->execute([$barcodeRow['sku']]);
                $matchedProduct = $stProd->fetch();
            } else {
                // 2. Fallback to SKU matching
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
            }

            if (!$matchedProduct) {
                $pdo->rollBack();
                $isLikelyOrder = preg_match('/^ODD-?\d+$/i', $rawCode) || preg_match('/^\d{5,}$/', $rawCode);
                $errMsg = $isLikelyOrder
                    ? "Order {$rawCode} was not found in the database. Please verify the order number."
                    : "Unrecognized product or barcode serial: {$rawCode}";
                sendJson(404, ['error' => $errMsg]);
            }

            if ($mode === 'dispatch' && (int)$matchedProduct['stock'] <= 0) {
                $pdo->rollBack();
                sendJson(400, ['error' => "Cannot dispatch {$matchedProduct['name']}: Stock is currently 0. Switch to Receive mode (+1) to add stock."]);
            }

            $delta = $mode === 'receive' ? 1 : -1;
            $newStock = max(0, (int)$matchedProduct['stock'] + $delta);

            $pdo->prepare('UPDATE products SET stock = ?, updated_at = NOW() WHERE id = ?')->execute([$newStock, $matchedProduct['id']]);

            $movementReason = $isBarcode
                ? 'Warehouse Scanner ' . strtoupper($mode) . " (Serial: {$serialNumber})"
                : 'Warehouse Scanner ' . strtoupper($mode);

            $pdo->prepare('INSERT INTO inventory_movements (sku, product_id, delta, stock_after, reason, staff_name) VALUES (?, ?, ?, ?, ?, ?)')->execute([
                $matchedProduct['sku'],
                $matchedProduct['id'],
                $delta,
                $newStock,
                $movementReason,
                $session['name'] ?? 'Staff'
            ]);

            $scanDetails = $isBarcode
                ? "Serial: {$serialNumber} · Lot: {$lotNumber} · Exp: {$expDate} · MRP: ₹{$mrpVal}"
                : "Stock adjusted to {$newStock}";

            $pdo->prepare('INSERT INTO scans (code, sku, item_name, mode, delta, stock_after, staff_name, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([
                $serialNumber,
                $matchedProduct['sku'],
                $matchedProduct['name'],
                $mode,
                $delta,
                (string)$newStock,
                $session['name'] ?? 'Staff',
                $scanDetails
            ]);

            $pdo->commit();

            sendJson(200, [
                'success' => true,
                'isOrder' => false,
                'isBarcode' => $isBarcode,
                'serial' => $serialNumber,
                'sku' => $matchedProduct['sku'],
                'name' => $matchedProduct['name'],
                'lot' => $lotNumber,
                'mfg' => $mfgDate,
                'expiry' => $expDate,
                'mrp' => $mrpVal,
                'stock' => $newStock,
                'delta' => $delta,
                'mode' => $mode
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
    if ($route === 'settings/razorpay-public' && $method === 'GET') {
        $rzpCfg = getRazorpayConfig($pdo);
        sendJson(200, [
            'enabled' => $rzpCfg['enabled'],
            'env' => $rzpCfg['env'],
            'keyId' => $rzpCfg['keyId'],
            'brandName' => $rzpCfg['brandName'],
            'themeColor' => $rzpCfg['themeColor']
        ]);
    }

    if ($route === 'settings/razorpay/test' && $method === 'POST') {
        requireStaffAuth('admin');
        $body = getJsonBody();
        $keyId = trim((string)($body['keyId'] ?? ''));
        $keySecret = trim((string)($body['keySecret'] ?? ''));

        if (!$keyId || str_contains($keySecret, '••••')) {
            $rzpCfg = getRazorpayConfig($pdo);
            if (!$keyId) $keyId = $rzpCfg['keyId'];
            if (!$keySecret || str_contains($keySecret, '••••')) $keySecret = $rzpCfg['keySecret'];
        }

        if (!$keyId || !$keySecret) {
            sendJson(400, ['success' => false, 'error' => 'Razorpay Key ID and Key Secret are required to test connection.']);
        }

        $ch = curl_init('https://api.razorpay.com/v1/orders?count=1');
        curl_setopt($ch, CURLOPT_USERPWD, $keyId . ':' . $keySecret);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($code === 200) {
            sendJson(200, ['success' => true, 'message' => 'Razorpay API credentials verified and active with Razorpay servers!']);
        } else {
            $parsed = json_decode((string)$resp, true);
            sendJson(400, ['success' => false, 'error' => $parsed['error']['description'] ?? 'Razorpay authentication failed. Please verify Key ID and Key Secret.']);
        }
    }

    if (strpos($route, 'settings/') === 0 && $method === 'GET') {
        $key = substr($route, strlen('settings/'));
        if (in_array($key, ['shiprocket', 'razorpay'], true)) {
            requireStaffAuth('admin');
        }
        $stmt = $pdo->prepare('SELECT value_json FROM settings WHERE key_name = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        $data = $row ? json_decode($row['value_json'], true) : [];

        if ($key === 'razorpay') {
            if (empty($data['keyId'])) {
                $data['keyId'] = defined('RAZORPAY_KEY_ID') ? RAZORPAY_KEY_ID : '';
            }
            if (empty($data['keySecret'])) {
                $data['keySecret'] = defined('RAZORPAY_KEY_SECRET') ? RAZORPAY_KEY_SECRET : '';
            }
        } elseif ($key === 'shiprocket') {
            if (empty($data['email'])) {
                $data['email'] = defined('SHIPROCKET_EMAIL') ? SHIPROCKET_EMAIL : '';
            }
            if (empty($data['password'])) {
                $data['password'] = defined('SHIPROCKET_PASSWORD') ? SHIPROCKET_PASSWORD : '';
            }
            if (empty($data['pickupLocation'])) {
                $data['pickupLocation'] = defined('SHIPROCKET_PICKUP_LOCATION') ? SHIPROCKET_PICKUP_LOCATION : 'Primary';
            }
        }

        sendJson(200, $data);
    }

    if (strpos($route, 'settings/') === 0 && ($method === 'POST' || $method === 'PUT')) {
        $key = substr($route, strlen('settings/'));
        requireStaffAuth($key === 'banner' ? 'marketing' : 'admin');
        $body = getJsonBody();

        if ($key === 'razorpay' && (empty($body['keySecret']) || str_contains($body['keySecret'], '••••'))) {
            $prevStmt = $pdo->prepare('SELECT value_json FROM settings WHERE key_name = "razorpay"');
            $prevStmt->execute();
            $prevRow = $prevStmt->fetch();
            $prev = $prevRow ? json_decode($prevRow['value_json'], true) : [];
            $body['keySecret'] = $prev['keySecret'] ?? RAZORPAY_KEY_SECRET;
        } elseif ($key === 'shiprocket' && (empty($body['password']) || str_contains($body['password'], '••••'))) {
            $prevStmt = $pdo->prepare('SELECT value_json FROM settings WHERE key_name = "shiprocket"');
            $prevStmt->execute();
            $prevRow = $prevStmt->fetch();
            $prev = $prevRow ? json_decode($prevRow['value_json'], true) : [];
            $body['password'] = $prev['password'] ?? (defined('SHIPROCKET_PASSWORD') ? SHIPROCKET_PASSWORD : '');
        }

        $pdo->prepare('
            INSERT INTO settings (key_name, value_json, updated_at) VALUES (?, ?, NOW())
            ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()
        ')->execute([$key, json_encode($body)]);
        sendJson(200, ['success' => true]);
    }

    // --- 11. Contact & Studio Inquiries ---
    if ($route === 'contact' && $method === 'POST') {
        $body = getJsonBody();
        $name = trim((string)($body['name'] ?? ''));
        $email = strtolower(trim((string)($body['email'] ?? '')));
        $subject = trim((string)($body['subject'] ?? 'Studio Inquiry'));
        $message = trim((string)($body['message'] ?? ''));

        if (!$name || !$email || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$message) {
            sendJson(400, ['error' => 'Please provide your full name, a valid email address, and message.']);
        }

        $headers = [
            'From: ODD Perfume Studio <hello@oddperfume.com>',
            "Reply-To: {$name} <{$email}>",
            'X-Mailer: PHP/' . phpversion(),
            'Content-Type: text/plain; charset=UTF-8'
        ];
        $bodyText = "New contact message from oddperfume.com:\n\nName: {$name}\nEmail: {$email}\nSubject: {$subject}\n\nMessage:\n{$message}\n\nTime: " . date('Y-m-d H:i:s');
        @mail('hello@oddperfume.com', "ODD Contact: {$subject}", $bodyText, implode("\r\n", $headers));

        sendJson(200, [
            'success' => true,
            'message' => 'Thank you! Your message has been sent to our studio team. We will get back to you shortly.'
        ]);
    }

    // --- 12. Newsletter Subscriptions ---
    if ($route === 'newsletter/subscribe' && $method === 'POST') {
        $body = getJsonBody();
        $email = strtolower(trim((string)($body['email'] ?? '')));
        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            sendJson(400, ['error' => 'Please enter a valid email address.']);
        }
        try {
            $stmt = $pdo->prepare('SELECT value_json FROM settings WHERE key_name = "newsletter_subscribers"');
            $stmt->execute();
            $row = $stmt->fetch();
            $subs = $row ? json_decode($row['value_json'], true) : [];
            if (!is_array($subs)) $subs = [];
            if (!in_array($email, $subs, true)) {
                $subs[] = $email;
                $pdo->prepare('
                    INSERT INTO settings (key_name, value_json, updated_at) VALUES ("newsletter_subscribers", ?, NOW())
                    ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()
                ')->execute([json_encode($subs)]);
            }
        } catch (Throwable $e) {}

        sendJson(200, [
            'success' => true,
            'message' => 'Thank you for subscribing to ODD Fragrance Notes.'
        ]);
    }

    // Route not found
    sendJson(404, ['error' => "API route not found: /api/{$route}"]);

} catch (Throwable $e) {
    sendJson(500, ['error' => 'Internal Server Error', 'details' => $e->getMessage()]);
}
