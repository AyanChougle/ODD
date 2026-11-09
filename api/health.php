<?php
/**
 * ODD Perfumes — Backend & Database Health Diagnostic Probe
 * Safe read-only system check for Hostinger / Apache / LiteSpeed environments
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$response = [
    'status' => 'ok',
    'timestamp' => date('Y-m-d H:i:s T'),
    'php_version' => PHP_VERSION,
    'php_sapi' => PHP_SAPI,
    'extensions' => [
        'pdo' => extension_loaded('pdo'),
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'json' => extension_loaded('json'),
        'mbstring' => extension_loaded('mbstring'),
        'curl' => extension_loaded('curl'),
        'openssl' => extension_loaded('openssl'),
    ],
    'database' => [
        'connected' => false,
        'tables_count' => 0,
        'tables' => [],
        'admin_users_count' => 0,
        'error' => null
    ]
];

try {
    require_once __DIR__ . '/config.php';
    require_once __DIR__ . '/db.php';

    $pdo = getDb();
    $response['database']['connected'] = true;

    // List tables
    $stmt = $pdo->query('SHOW TABLES');
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $response['database']['tables_count'] = count($tables);
    $response['database']['tables'] = $tables;

    // Check staff count if table exists
    if (in_array('staff', $tables, true)) {
        $staffCount = (int)$pdo->query('SELECT COUNT(*) FROM staff')->fetchColumn();
        $response['database']['admin_users_count'] = $staffCount;
    } elseif (in_array('staff_accounts', $tables, true)) {
        $staffCount = (int)$pdo->query('SELECT COUNT(*) FROM staff_accounts')->fetchColumn();
        $response['database']['admin_users_count'] = $staffCount;
    }

} catch (Throwable $e) {
    $response['status'] = 'error';
    $response['database']['error'] = $e->getMessage();
    http_response_code(500);
}

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
