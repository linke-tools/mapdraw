<?php
// Sicherheitscheck definieren
define('SECURE_ACCESS', true);

// Projekt-Titel aus der Datenbank laden falls eine Project-ID vorhanden ist
$pageTitle = 'Collaborative Drawing';

if (isset($_GET['project'])) {
    $projectId = $_GET['project'];
    
    // Validiere UUID Format
    if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $projectId)) {
        try {
            require_once 'db.php';
            $stmt = $db->prepare('SELECT name FROM projects WHERE id = ?');
            $stmt->execute([$projectId]);
            if ($project = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $pageTitle = htmlspecialchars($project['name']);
            }
        } catch (PDOException $e) {
            error_log('Fehler beim Laden des Projekt-Titels: ' . $e->getMessage());
        }
    }
}
?>
<!DOCTYPE html>
<html lang="de">
<head>
    <title><?php echo $pageTitle; ?></title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="format-detection" content="telephone=no">
    <meta name="msapplication-tap-highlight" content="no">
    <link rel="stylesheet" href="style.css">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css">
    <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
</head>
<body>
<div id="map"></div>
    <div id="controls">
        <div id="drawing-controls" class="hidden">
            <button id="mode-toggle">Navigation</button>
            <input type="color" id="color-picker" value="#ff0000">
            <button id="eraser">Linie löschen</button>
            <button id="save" class="hidden">Save</button>
        </div>
    </div>
    <div id="project-name" class="hidden">
        <div class="project-name-row">
            <span id="project-name-text"></span>
            <button id="copy-link" title="Link kopieren">📋</button>
        </div>
        <div id="active-users-warning"></div>
    </div>
    <div id="create-project" class="hidden">Create project</div>
    <div id="project-modal" class="modal hidden">
        <div class="modal-content">
            <h2>Neues Projekt erstellen</h2>
            <input type="text" id="new-project-name" placeholder="Projektname">
            <div class="modal-buttons">
                <button id="create">Create</button>
                <button id="cancel-create">Cancel</button>
            </div>
        </div>
    </div>
    <script src="script.js"></script>
</body>
</html> 