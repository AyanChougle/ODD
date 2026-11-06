<?php
/**
 * ODD Perfumes — Database & Environment Configuration (Hostinger / Apache / cPanel)
 */

declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'config.php') {
    http_response_code(403);
    exit('Direct access not permitted.');
}

// Error reporting for production
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// Automatically parse .env file from root directory if present
$envFile = __DIR__ . '/../.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        if (str_contains($line, '=')) {
            [$k, $v] = explode('=', $line, 2);
            $k = trim($k);
            $v = trim($v, " \t\n\r\0\x0B\"'");
            if ($k !== '') {
                putenv("{$k}={$v}");
                $_ENV[$k] = $v;
                $_SERVER[$k] = $v;
            }
        }
    }
}

// Database Credentials (from .env or Hostinger environment)
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_NAME', getenv('DB_NAME') ?: 'u303154098_uNV1v');
define('DB_USER', getenv('DB_USER') ?: 'u303154098_xtZdP');
define('DB_PASS', getenv('DB_PASS') ?: 'Pa$$@12123');
define('DB_CHARSET', 'utf8mb4');

// Razorpay Credentials
define('RAZORPAY_KEY_ID', getenv('RAZORPAY_KEY_ID') ?: 'rzp_live_Ti8AffHarb3tai');
define('RAZORPAY_KEY_SECRET', getenv('RAZORPAY_KEY_SECRET') ?: 'X4Ws6I0iovvSrTYh18i1nNjl');
define('RAZORPAY_WEBHOOK_SECRET', getenv('RAZORPAY_WEBHOOK_SECRET') ?: '');

// Shiprocket Multi-Carrier Shipping API v2
define('SHIPROCKET_EMAIL', getenv('SHIPROCKET_EMAIL') ?: 'oddperfumesocial@gmail.com');
define('SHIPROCKET_PASSWORD', getenv('SHIPROCKET_PASSWORD') ?: 'Aoeo6$g4!7RYRLSLM0@V90MYX!fI*Gg!');
define('SHIPROCKET_TOKEN', getenv('SHIPROCKET_TOKEN') ?: '');
define('SHIPROCKET_PICKUP_LOCATION', getenv('SHIPROCKET_PICKUP_LOCATION') ?: 'Primary');

// Session Lifetime & Secrets
define('SESSION_SECRET', getenv('SESSION_SECRET') ?: '38c6dfef5c36c359974c53677a1598ccc604729db7670a28825b827fd247aeb3');
define('SESSION_LIFETIME', 7 * 86400); // 7 days
