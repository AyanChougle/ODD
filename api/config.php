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

// Global fatal error shutdown handler ensuring JSON responses
register_shutdown_function(function() {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'error' => 'Fatal Server Error',
            'message' => $err['message'],
            'file' => basename($err['file']),
            'line' => $err['line']
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }
});

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
                $_ENV[$k] = $v;
                $_SERVER[$k] = $v;
                if (function_exists('putenv')) {
                    @putenv("{$k}={$v}");
                }
            }
        }
    }
}

// Helper to reliably read environment variables across Hostinger, CLI, and Apache
function getEnvConfig(string $key, string $default = ''): string {
    if (isset($_ENV[$key]) && $_ENV[$key] !== '') return (string)$_ENV[$key];
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') return (string)$_SERVER[$key];
    if (function_exists('getenv')) {
        $val = @getenv($key);
        if ($val !== false && $val !== '') return (string)$val;
    }
    return $default;
}

// Database Credentials (from .env or Hostinger environment)
define('DB_HOST', getEnvConfig('DB_HOST', 'localhost'));
define('DB_PORT', getEnvConfig('DB_PORT', '3306'));
define('DB_NAME', getEnvConfig('DB_NAME', 'u303154098_uNV1v'));
define('DB_USER', getEnvConfig('DB_USER', 'u303154098_xtZdP'));
define('DB_PASS', getEnvConfig('DB_PASS', 'Pa$$@12123'));
define('DB_CHARSET', 'utf8mb4');

// Razorpay Credentials
define('RAZORPAY_KEY_ID', getEnvConfig('RAZORPAY_KEY_ID', 'rzp_live_Ti8AffHarb3tai'));
define('RAZORPAY_KEY_SECRET', getEnvConfig('RAZORPAY_KEY_SECRET', 'X4Ws6I0iovvSrTYh18i1nNjl'));
define('RAZORPAY_WEBHOOK_SECRET', getEnvConfig('RAZORPAY_WEBHOOK_SECRET', ''));

// Shiprocket Multi-Carrier Shipping API v2
define('SHIPROCKET_EMAIL', getEnvConfig('SHIPROCKET_EMAIL', 'oddperfumesocial@gmail.com'));
define('SHIPROCKET_PASSWORD', getEnvConfig('SHIPROCKET_PASSWORD', 'Ks^U&iCv5zET!Bse*c4Ubln9y!ZkHw&o'));
define('SHIPROCKET_TOKEN', getEnvConfig('SHIPROCKET_TOKEN', ''));
define('SHIPROCKET_PICKUP_LOCATION', getEnvConfig('SHIPROCKET_PICKUP_LOCATION', 'Primary'));

// Session Lifetime & Secrets
define('SESSION_SECRET', getEnvConfig('SESSION_SECRET', '38c6dfef5c36c359974c53677a1598ccc604729db7670a28825b827fd247aeb3'));
define('SESSION_LIFETIME', 7 * 86400); // 7 days

// Hostinger Email & SMTP Configuration
define('SMTP_HOST', getEnvConfig('SMTP_HOST', 'smtp.hostinger.com'));
define('SMTP_PORT', (int)getEnvConfig('SMTP_PORT', '465'));
define('SMTP_USER', getEnvConfig('SMTP_USER', 'hello@oddperfume.com'));
define('SMTP_PASS', getEnvConfig('SMTP_PASS', ''));
define('SMTP_FROM', getEnvConfig('SMTP_FROM', 'hello@oddperfume.com'));
define('SMTP_FROM_NAME', getEnvConfig('SMTP_FROM_NAME', 'ODD Perfume Studio'));

// Hostinger Agentic Mail API Configuration
define('HOSTINGER_MAIL_API_TOKEN', getEnvConfig('HOSTINGER_MAIL_API_TOKEN', '3526c9c0c3f0401c66105ded2a45c8f12f3899d1c7746f51a8519d24caf18341'));
define('HOSTINGER_MAILBOX_ID', getEnvConfig('HOSTINGER_MAILBOX_ID', 'ACcc05778d784eac12b5a1cca1de23'));
