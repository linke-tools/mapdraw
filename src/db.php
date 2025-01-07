<?php
// Verhindern dass die Datei direkt aufgerufen werden kann
if (!defined('SECURE_ACCESS')) {
    die('Direkter Zugriff nicht erlaubt');
}

@require_once 'config.php';

try {
    // PDO-Verbindung herstellen
    $db = new PDO(
        "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4",
        $db_user,
        $db_pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
} catch (PDOException $e) {
    error_log('Datenbankverbindungsfehler: ' . $e->getMessage());
    die('Datenbankverbindung fehlgeschlagen');
}
?> 