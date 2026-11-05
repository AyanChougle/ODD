<?php
/**
 * ODD Perfumes — Hostinger CLI Staff Administrator Setup
 * Usage:
 *   php scripts/create-admin.php admin@oddperfume.com SecurePassword123 "Store Admin"
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    die("Access Denied: This script can only be run via command line interface (CLI).\n");
}

require_once __DIR__ . '/../api/db.php';

$email = strtolower(trim((string)($argv[1] ?? '')));
$password = (string)($argv[2] ?? '');
$name = trim((string)($argv[3] ?? 'Store Administrator'));

if (!$email || !$password) {
    echo "Usage: php scripts/create-admin.php <email> <password> [name]\n";
    echo "Example: php scripts/create-admin.php admin@oddperfume.com SecurePassword123 \"Store Admin\"\n";
    exit(1);
}

$pdo = getDb();
$hash = password_hash($password, PASSWORD_DEFAULT);

$stmt = $pdo->prepare('SELECT id FROM staff WHERE email = ?');
$stmt->execute([$email]);
$existing = $stmt->fetch();

if ($existing) {
    $pdo->prepare('UPDATE staff SET name = ?, password_hash = ?, role = "admin", active = 1, updated_at = NOW() WHERE id = ?')->execute([$name, $hash, $existing['id']]);
    echo "Successfully updated administrator account: {$email} ({$name})\n";
} else {
    $pdo->prepare('INSERT INTO staff (name, email, password_hash, role, active) VALUES (?, ?, ?, "admin", 1)')->execute([$name, $email, $hash]);
    echo "Successfully created administrator account: {$email} ({$name})\n";
}
