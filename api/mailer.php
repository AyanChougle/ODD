<?php
/**
 * ODD Perfumes — Production SMTP Mailer & Envelope Guard
 * Standalone RFC-compliant SMTP client for Hostinger Email (Titan Mail)
 * Zero external Composer dependencies.
 */

declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'mailer.php') {
    http_response_code(403);
    exit('Direct access not permitted.');
}

/**
 * Log mail operations for transparent auditing
 */
function logMailOperation(string $level, string $message, array $context = []): void {
    $logDir = __DIR__ . '/../storage/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $entry = sprintf(
        "[%s] [%s] %s %s\n",
        date('Y-m-d H:i:s'),
        strtoupper($level),
        $message,
        !empty($context) ? json_encode($context, JSON_UNESCAPED_SLASHES) : ''
    );
    @file_put_contents($logDir . '/mail.log', $entry, FILE_APPEND | LOCK_EX);
}

/**
 * Resolve effective SMTP configuration from DB settings or environment
 */
function getEffectiveSmtpConfig(?PDO $pdo = null): array {
    $cfg = [];
    if ($pdo !== null) {
        try {
            $stmt = $pdo->prepare('SELECT value_json FROM settings WHERE key_name = "smtp"');
            $stmt->execute();
            $row = $stmt->fetch();
            if ($row && !empty($row['value_json'])) {
                $decoded = json_decode($row['value_json'], true);
                if (is_array($decoded)) $cfg = $decoded;
            }
        } catch (Throwable $e) {
            // Database lookup error, fallback to defaults
        }
    }

    $host = !empty($cfg['host']) ? trim($cfg['host']) : (defined('SMTP_HOST') ? SMTP_HOST : 'smtp.hostinger.com');
    $port = !empty($cfg['port']) ? (int)$cfg['port'] : (defined('SMTP_PORT') ? (int)SMTP_PORT : 465);
    $user = !empty($cfg['username']) ? trim($cfg['username']) : (defined('SMTP_USER') ? SMTP_USER : 'hello@oddperfume.com');
    $pass = !empty($cfg['password']) && !str_contains($cfg['password'], '••••')
        ? trim($cfg['password'])
        : (defined('SMTP_PASS') ? SMTP_PASS : '');
    $fromEmail = !empty($cfg['fromEmail']) ? trim($cfg['fromEmail']) : (defined('SMTP_FROM') ? SMTP_FROM : 'hello@oddperfume.com');
    $fromName = !empty($cfg['fromName']) ? trim($cfg['fromName']) : (defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'ODD Perfume Studio');

    return [
        'host' => $host,
        'port' => $port,
        'username' => $user,
        'password' => $pass,
        'fromEmail' => $fromEmail,
        'fromName' => $fromName
    ];
}

/**
 * Send an email via Hostinger authenticated SMTP, with graceful fallback to PHP mail()
 */
function sendSmtpEmail(
    string $to,
    string $subject,
    string $htmlBody,
    string $textBody = '',
    array $smtpConfig = [],
    array $replyTo = []
): array {
    $to = trim($to);
    if (!$to || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'error' => "Invalid recipient email address: '{$to}'"];
    }

    $host = $smtpConfig['host'] ?? 'smtp.hostinger.com';
    $port = (int)($smtpConfig['port'] ?? 465);
    $user = $smtpConfig['username'] ?? 'hello@oddperfume.com';
    $pass = $smtpConfig['password'] ?? '';
    $fromEmail = $smtpConfig['fromEmail'] ?? 'hello@oddperfume.com';
    $fromName = $smtpConfig['fromName'] ?? 'ODD Perfume Studio';

    // If no SMTP password provided, use hardened PHP mail() with -f envelope sender
    if (empty($pass)) {
        logMailOperation('info', 'No SMTP password configured, using PHP mail() with envelope sender', ['to' => $to, 'from' => $fromEmail]);
        return sendViaNativeMail($to, $subject, $htmlBody, $textBody, $fromEmail, $fromName, $replyTo);
    }

    // SMTP Socket Delivery
    $isSsl = ($port === 465);
    $transport = $isSsl ? "ssl://{$host}:{$port}" : "tcp://{$host}:{$port}";
    $timeout = 15;

    $socket = @stream_socket_client($transport, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
    if (!$socket) {
        logMailOperation('error', "SMTP connection failed to {$transport}: {$errstr} ({$errno})");
        // Fallback to PHP native mail
        return sendViaNativeMail($to, $subject, $htmlBody, $textBody, $fromEmail, $fromName, $replyTo);
    }

    stream_set_timeout($socket, $timeout);

    $read = function() use ($socket): string {
        $data = '';
        while (!feof($socket)) {
            $line = fgets($socket, 512);
            if ($line === false) break;
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $data;
    };

    $write = function(string $cmd) use ($socket): void {
        fwrite($socket, $cmd . "\r\n");
    };

    $greeting = $read();
    if (!str_starts_with($greeting, '220')) {
        fclose($socket);
        logMailOperation('error', 'SMTP invalid greeting', ['response' => trim($greeting)]);
        return sendViaNativeMail($to, $subject, $htmlBody, $textBody, $fromEmail, $fromName, $replyTo);
    }

    $write("EHLO oddperfume.com");
    $ehlo = $read();

    if ($port === 587) {
        $write("STARTTLS");
        $tls = $read();
        if (str_starts_with($tls, '220')) {
            stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            $write("EHLO oddperfume.com");
            $ehlo = $read();
        }
    }

    // AUTH LOGIN
    $write("AUTH LOGIN");
    $auth = $read();
    if (!str_starts_with($auth, '334')) {
        fclose($socket);
        logMailOperation('error', 'SMTP AUTH LOGIN failed', ['response' => trim($auth)]);
        return sendViaNativeMail($to, $subject, $htmlBody, $textBody, $fromEmail, $fromName, $replyTo);
    }

    $write(base64_encode($user));
    $uResp = $read();
    if (!str_starts_with($uResp, '334')) {
        fclose($socket);
        logMailOperation('error', 'SMTP username rejected', ['user' => $user, 'response' => trim($uResp)]);
        return ['success' => false, 'error' => "SMTP Username rejected: " . trim($uResp)];
    }

    $write(base64_encode($pass));
    $pResp = $read();
    if (!str_starts_with($pResp, '235')) {
        fclose($socket);
        logMailOperation('error', 'SMTP password rejected (authentication failed)', ['response' => trim($pResp)]);
        return ['success' => false, 'error' => "SMTP Authentication failed. Please verify the password for {$user} in Admin > Settings > Email."];
    }

    // Envelope
    $write("MAIL FROM:<{$fromEmail}>");
    $fResp = $read();
    if (!str_starts_with($fResp, '250')) {
        fclose($socket);
        logMailOperation('error', 'SMTP MAIL FROM rejected', ['from' => $fromEmail, 'response' => trim($fResp)]);
        return ['success' => false, 'error' => "MAIL FROM rejected: " . trim($fResp)];
    }

    $write("RCPT TO:<{$to}>");
    $rResp = $read();
    if (!str_starts_with($rResp, '250')) {
        fclose($socket);
        logMailOperation('error', 'SMTP RCPT TO rejected', ['to' => $to, 'response' => trim($rResp)]);
        return ['success' => false, 'error' => "RCPT TO rejected: " . trim($rResp)];
    }

    $write("DATA");
    $dResp = $read();
    if (!str_starts_with($dResp, '354')) {
        fclose($socket);
        logMailOperation('error', 'SMTP DATA rejected', ['response' => trim($dResp)]);
        return ['success' => false, 'error' => "DATA rejected: " . trim($dResp)];
    }

    // Assemble MIME multipart message
    $boundary = 'bnd_odd_' . md5(uniqid((string)mt_rand(), true));
    $msgId = '<' . time() . '.' . md5(uniqid((string)mt_rand(), true)) . '@oddperfume.com>';

    $headers = [
        "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$fromEmail}>",
        "To: <{$to}>",
        "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=",
        "Date: " . date('r'),
        "Message-ID: {$msgId}",
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
        "X-Mailer: ODD Perfume Enterprise Mailer"
    ];

    if (!empty($replyTo['email'])) {
        $rName = !empty($replyTo['name']) ? $replyTo['name'] : $replyTo['email'];
        $headers[] = "Reply-To: =?UTF-8?B?" . base64_encode($rName) . "?= <{$replyTo['email']}>";
    }

    $plain = $textBody ?: strip_tags($htmlBody);

    $body = implode("\r\n", $headers) . "\r\n\r\n" .
            "--{$boundary}\r\n" .
            "Content-Type: text/plain; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($plain)) . "\r\n" .
            "--{$boundary}\r\n" .
            "Content-Type: text/html; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($htmlBody)) . "\r\n" .
            "--{$boundary}--\r\n.";

    $write($body);
    $sendResp = $read();

    $write("QUIT");
    @fclose($socket);

    if (str_starts_with($sendResp, '250')) {
        logMailOperation('info', "Email successfully delivered via SMTP to {$to}", ['subject' => $subject]);
        return [
            'success' => true,
            'method' => 'smtp',
            'info' => "Message delivered via Hostinger SMTP ({$host}:{$port})"
        ];
    }

    logMailOperation('error', 'SMTP send failed at final step', ['response' => trim($sendResp)]);
    return ['success' => false, 'error' => "SMTP delivery error: " . trim($sendResp)];
}

/**
 * Fallback sender using native PHP mail() with strict envelope sender -f
 */
function sendViaNativeMail(
    string $to,
    string $subject,
    string $htmlBody,
    string $textBody,
    string $fromEmail,
    string $fromName,
    array $replyTo = []
): array {
    $boundary = 'bnd_mail_' . md5(uniqid((string)mt_rand(), true));
    $headers = [
        "From: =?UTF-8?B?" . base64_encode($fromName) . "?= <{$fromEmail}>",
        "Return-Path: <{$fromEmail}>",
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
        "X-Mailer: ODD Perfume PHP Native Fallback"
    ];

    if (!empty($replyTo['email'])) {
        $rName = !empty($replyTo['name']) ? $replyTo['name'] : $replyTo['email'];
        $headers[] = "Reply-To: =?UTF-8?B?" . base64_encode($rName) . "?= <{$replyTo['email']}>";
    }

    $plain = $textBody ?: strip_tags($htmlBody);

    $message = "--{$boundary}\r\n" .
               "Content-Type: text/plain; charset=UTF-8\r\n" .
               "Content-Transfer-Encoding: base64\r\n\r\n" .
               chunk_split(base64_encode($plain)) . "\r\n" .
               "--{$boundary}\r\n" .
               "Content-Type: text/html; charset=UTF-8\r\n" .
               "Content-Transfer-Encoding: base64\r\n\r\n" .
               chunk_split(base64_encode($htmlBody)) . "\r\n" .
               "--{$boundary}--";

    $encodedSubject = "=?UTF-8?B?" . base64_encode($subject) . "?=";
    $sent = @mail($to, $encodedSubject, $message, implode("\r\n", $headers), "-f {$fromEmail}");

    logMailOperation($sent ? 'info' : 'warning', "Native mail() dispatch result: " . ($sent ? 'dispatched' : 'failed'), [
        'to' => $to,
        'subject' => $subject,
        'envelope_sender' => $fromEmail
    ]);

    return [
        'success' => $sent,
        'method' => 'php_mail',
        'info' => $sent ? 'Dispatched via server mail agent with envelope sender' : 'Server mail agent rejected dispatch'
    ];
}
