<?php
/**
 * ODD Perfumes — PDO Database Connector with Prepared Statements & Transaction Support
 */

declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'db.php') {
    http_response_code(403);
    exit('Direct access not permitted.');
}

require_once __DIR__ . '/config.php';

function getDb(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', DB_HOST, DB_PORT, DB_NAME, DB_CHARSET);
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            error_log('Database connection error: ' . $e->getMessage());
            http_response_code(503);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'error' => 'Database connection failed. Please ensure MySQL database is configured.'
            ]);
            exit;
        }
    }
    return $pdo;
}
