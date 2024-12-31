<?php
header('Content-Type: application/json');

try {
    // TCP Verbindung
    $db = new PDO(
        'mysql:host=127.0.0.1;dbname=map_drawing',
        'maps',
        'thaeX7ooho'
    );
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'error' => 'Datenbankverbindung fehlgeschlagen: ' . $e->getMessage()
    ]);
    exit;
}

// JSON Body auslesen
$input = json_decode(file_get_contents('php://input'), true);

// Action aus verschiedenen Quellen ermitteln
$action = $_GET['action'] ?? $_POST['action'] ?? $input['action'] ?? '';

switch($action) {
    case 'create':
        createProject($db, $input);
        break;
    case 'load':
        loadProject($db, $_GET['project']);
        break;
    case 'save':
        saveProject($db, $input);
        break;
    case 'delete_line':
        if (!isset($input['projectId']) || !isset($input['lineId'])) {
            echo json_encode(['success' => false, 'error' => 'Missing parameters']);
            exit;
        }
        
        $stmt = $db->prepare('DELETE FROM drawings WHERE id = ? AND project_id = ?');
        $success = $stmt->execute([$input['lineId'], $input['projectId']]);
        
        echo json_encode(['success' => $success]);
        break;
    case 'check_active_users':
        if (!isset($_GET['project']) || !isset($_GET['sessionId'])) {
            echo json_encode(['success' => false, 'error' => 'Missing parameters']);
            exit;
        }
        $activeUsers = updateActiveUsers($db, $_GET['project'], $_GET['sessionId']);
        echo json_encode([
            'success' => true,
            'activeUsers' => $activeUsers
        ]);
        break;
    default:
        echo json_encode([
            'success' => false, 
            'error' => 'Invalid action: ' . $action
        ]);
}

function generateUUID() {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

function createProject($db, $data) {
    if (empty($data['name'])) {
        echo json_encode([
            'success' => false,
            'error' => 'Kein Projektname angegeben'
        ]);
        return;
    }

    try {
        $projectId = generateUUID();
        $stmt = $db->prepare('INSERT INTO projects (id, name) VALUES (?, ?)');
        $stmt->execute([$projectId, $data['name']]);
        
        echo json_encode([
            'success' => true,
            'projectId' => $projectId
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'success' => false,
            'error' => 'Datenbankfehler: ' . $e->getMessage()
        ]);
    }
}

function loadProject($db, $projectId) {
    try {
        // Überprüfen ob das Projekt existiert
        $stmt = $db->prepare('SELECT * FROM projects WHERE id = ?');
        $stmt->execute([$projectId]);
        $project = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$project) {
            echo json_encode([
                'success' => false,
                'error' => 'Projekt nicht gefunden'
            ]);
            return;
        }
        
        // Zeichnungen laden
        $stmt = $db->prepare('SELECT * FROM drawings WHERE project_id = ?');
        $stmt->execute([$projectId]);
        $drawings = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Session ID aus dem Request holen oder neue generieren
        $sessionId = $_GET['sessionId'] ?? generateUUID();
        
        // Aktive Benutzer aktualisieren
        $activeUsers = updateActiveUsers($db, $projectId, $sessionId);
        
        echo json_encode([
            'success' => true,
            'name' => $project['name'],
            'lat' => floatval($project['lat']),
            'lng' => floatval($project['lng']),
            'zoom' => intval($project['zoom']),
            'drawings' => $drawings,
            'sessionId' => $sessionId,
            'activeUsers' => $activeUsers
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'success' => false,
            'error' => 'Datenbankfehler: ' . $e->getMessage()
        ]);
    }
}

function saveProject($db, $data) {
    // Position und Zoom speichern
    $stmt = $db->prepare('UPDATE projects SET lat = ?, lng = ?, zoom = ? WHERE id = ?');
    $stmt->execute([
        $data['lat'],
        $data['lng'],
        $data['zoom'],
        $data['projectId']
    ]);
    
    $changes = $data['changes'];
    
    // Gelöschte Linien entfernen
    if (!empty($changes['deleted'])) {
        $placeholders = str_repeat('?,', count($changes['deleted']) - 1) . '?';
        $stmt = $db->prepare("DELETE FROM drawings WHERE id IN ($placeholders) AND project_id = ?");
        $params = $changes['deleted'];
        $params[] = $data['projectId'];
        $stmt->execute($params);
    }
    
    // Neue Linien einfügen
    $insertStmt = $db->prepare('INSERT INTO drawings (project_id, path, color) VALUES (?, ?, ?)');
    $newLines = [];
    
    foreach ($changes['added'] as $drawing) {
        $insertStmt->execute([
            $data['projectId'],
            json_encode($drawing['path']),
            $drawing['color']
        ]);
        $newLines[] = [
            'id' => $db->lastInsertId(),
            'path' => $drawing['path']
        ];
    }
    
    // Modifizierte Linien aktualisieren (falls implementiert)
    if (!empty($changes['modified'])) {
        $updateStmt = $db->prepare('UPDATE drawings SET path = ?, color = ? WHERE id = ? AND project_id = ?');
        foreach ($changes['modified'] as $drawing) {
            $updateStmt->execute([
                json_encode($drawing['path']),
                $drawing['color'],
                $drawing['id'],
                $data['projectId']
            ]);
        }
    }
    
    echo json_encode([
        'success' => true,
        'newLines' => $newLines
    ]);
}

// Neue Funktion zum Aktualisieren der aktiven Benutzer
function updateActiveUsers($db, $projectId, $sessionId) {
    // Alte Sessions löschen (älter als 10 Sekunden)
    $stmt = $db->prepare('DELETE FROM active_users WHERE last_seen < DATE_SUB(NOW(), INTERVAL 10 SECOND)');
    $stmt->execute();
    
    // Session aktualisieren oder erstellen
    $stmt = $db->prepare('INSERT INTO active_users (project_id, session_id, last_seen) 
                         VALUES (?, ?, NOW())
                         ON DUPLICATE KEY UPDATE last_seen = NOW()');
    $stmt->execute([$projectId, $sessionId]);
    
    // Aktive Benutzer zählen
    $stmt = $db->prepare('SELECT COUNT(DISTINCT session_id) as count 
                         FROM active_users 
                         WHERE project_id = ?');
    $stmt->execute([$projectId]);
    return $stmt->fetch(PDO::FETCH_ASSOC)['count'];
}
?> 