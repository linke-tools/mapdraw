<?php
// Verhindern dass die Datei direkt aufgerufen werden kann
if (!defined('SECURE_ACCESS')) {
    die('Direkter Zugriff nicht erlaubt');
}

// Load configuration
$configPath = __DIR__ . '/../config/config.json';

if (!file_exists($configPath)) {
    die('Configuration file not found. Please copy config.example.json to config.json and update the values.');
}

$config = json_decode(file_get_contents($configPath), true);

if (json_last_error() !== JSON_ERROR_NONE) {
    die('Invalid JSON configuration: ' . json_last_error_msg());
}

try {
    // PDO-Verbindung herstellen
    $db = new PDO(
        "mysql:host={$config['database']['host']};dbname={$config['database']['dbname']};charset={$config['database']['charset']}",
        $config['database']['username'],
        $config['database']['password'],
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