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
    default:
        echo json_encode([
            'success' => false, 
            'error' => 'Invalid action: ' . $action
        ]);
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
        $stmt = $db->prepare('INSERT INTO projects (name) VALUES (?)');
        $stmt->execute([$data['name']]);
        
        echo json_encode([
            'success' => true,
            'projectId' => $db->lastInsertId()
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
        
        echo json_encode([
            'success' => true,
            'name' => $project['name'],
            'lat' => floatval($project['lat']),
            'lng' => floatval($project['lng']),
            'zoom' => intval($project['zoom']),
            'drawings' => $drawings
        ]);
    } catch (PDOException $e) {
        echo json_encode([
            'success' => false,
            'error' => 'Datenbankfehler: ' . $e->getMessage()
        ]);
    }
}

function saveProject($db, $data) {
    $stmt = $db->prepare('UPDATE projects SET lat = ?, lng = ?, zoom = ? WHERE id = ?');
    $stmt->execute([
        $data['lat'],
        $data['lng'],
        $data['zoom'],
        $data['projectId']
    ]);
    
    // Alte Zeichnungen löschen
    $stmt = $db->prepare('DELETE FROM drawings WHERE project_id = ?');
    $stmt->execute([$data['projectId']]);
    
    // Neue Zeichnungen speichern
    $stmt = $db->prepare('INSERT INTO drawings (project_id, path, color) VALUES (?, ?, ?)');
    foreach ($data['drawings'] as $drawing) {
        $stmt->execute([
            $data['projectId'],
            json_encode($drawing['path']),
            $drawing['color']
        ]);
    }
    
    echo json_encode(['success' => true]);
}
?> 