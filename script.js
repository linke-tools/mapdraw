let map;
let drawingLayer;
let isDrawing = false;
let currentColor = '#ff0000';
let isEraser = false;
let currentPath = [];
let projectId = null;
let hasUnsavedChanges = false;
let isDrawMode = false; // Standardmäßig Navigationsmodus
let currentTempLine = null; // Neue Variable für temporäre Linie

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    // URL Parameter auslesen
    const urlParams = new URLSearchParams(window.location.search);
    projectId = urlParams.get('project');

    // WICHTIG: Zuerst alle UI-Elemente verstecken
    document.getElementById('project-modal').classList.add('hidden');
    document.getElementById('project-name').classList.add('hidden');
    document.getElementById('drawing-controls').classList.add('hidden');
    document.getElementById('create-project').classList.add('hidden');
    document.getElementById('save').classList.add('hidden');

    // Map initialisieren
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    drawingLayer = L.layerGroup().addTo(map);

    setupEventListeners();
    
    // Dann erst die Projekt-Logik ausführen
    if (projectId) {
        loadProject();
    } else {
        document.getElementById('create-project').classList.remove('hidden');
    }
});

function setupEventListeners() {
    // Leaflet map events statt HTML element events verwenden
    map.on('mousedown', function(e) {
        if (!projectId || !isDrawMode) return;
        isDrawing = true;
        currentPath = [];
        currentPath.push(e.latlng);
    });
    
    map.on('mousemove', function(e) {
        if (!isDrawing || !projectId || !isDrawMode) return;
        currentPath.push(e.latlng);
        updateDrawing();
    });
    
    map.on('mouseup', function() {
        if (!isDrawing || !projectId || !isDrawMode) return;
        isDrawing = false;
        if (currentPath.length > 1) {
            // Temporäre Linie entfernen
            if (currentTempLine) {
                drawingLayer.removeLayer(currentTempLine);
                currentTempLine = null;
            }

            // Permanente Linie hinzufügen
            const line = L.polyline(currentPath, {
                color: isEraser ? 'transparent' : currentColor,
                weight: isEraser ? 20 : 3
            });
            drawingLayer.addLayer(line);
            
            // Save-Button anzeigen
            showSaveButton();
            
            // Debug-Ausgabe nach dem Anzeigen
            const saveButton = document.getElementById('save');
            const drawingControls = document.getElementById('drawing-controls');
            console.log('After showing save button:');
            console.log('Drawing controls hidden:', drawingControls.classList.contains('hidden'));
            console.log('Save button hidden:', saveButton.classList.contains('hidden'));
            console.log('Save button display:', window.getComputedStyle(saveButton).display);
        }
        currentPath = [];
    });
    
    // UI Controls
    document.getElementById('color-picker').addEventListener('change', (e) => {
        currentColor = e.target.value;
        isEraser = false;
    });
    
    document.getElementById('eraser').addEventListener('click', () => {
        isEraser = true;
        showSaveButton();
    });
    
    document.getElementById('create-project').addEventListener('click', showProjectModal);
    document.getElementById('create').addEventListener('click', createProject);
    
    document.getElementById('save').addEventListener('click', saveChanges);
    
    document.getElementById('cancel-create').addEventListener('click', () => {
        document.getElementById('project-modal').classList.add('hidden');
    });

    document.getElementById('project-modal').addEventListener('click', (e) => {
        if (e.target.id === 'project-modal') {
            document.getElementById('project-modal').classList.add('hidden');
        }
    });

    // Mode Toggle Button
    const modeToggleBtn = document.getElementById('mode-toggle');
    modeToggleBtn.addEventListener('click', toggleMode);
}

function updateDrawing() {
    // Entferne nur die temporäre Linie, falls vorhanden
    if (currentTempLine) {
        drawingLayer.removeLayer(currentTempLine);
    }

    // Zeichne neue temporäre Linie
    if (currentPath.length > 1) {
        currentTempLine = L.polyline(currentPath, {
            color: isEraser ? 'transparent' : currentColor,
            weight: isEraser ? 20 : 3
        });
        drawingLayer.addLayer(currentTempLine);
    }
}

async function createProject() {
    const name = document.getElementById('new-project-name').value;
    if (!name) return;

    try {
        const response = await fetch('api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'create',
                name: name
            })
        });

        const data = await response.json();
        if (data.success) {
            window.location.href = `?project=${data.projectId}`;
        } else {
            console.error('Projekt konnte nicht erstellt werden:', data.error);
        }
    } catch (error) {
        console.error('Fehler beim Erstellen des Projekts:', error);
    }
}

async function loadProject() {
    try {
        console.log('Loading project:', projectId);
        const response = await fetch(`api.php?action=load&project=${projectId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Project data:', data);
        
        if (data.success) {
            // Controls sichtbar machen
            const drawingControls = document.getElementById('drawing-controls');
            drawingControls.classList.remove('hidden');
            
            document.getElementById('project-name').classList.remove('hidden');
            document.getElementById('project-name').textContent = data.name;
            
            // Save-Button initial verstecken
            document.getElementById('save').classList.add('hidden');
            hasUnsavedChanges = false;
            
            // Karten-Position setzen
            if (data.lat && data.lng && data.zoom) {
                map.setView([data.lat, data.lng], data.zoom);
            }
            
            // Zeichnungen laden
            drawingLayer.clearLayers();
            if (data.drawings && data.drawings.length > 0) {
                data.drawings.forEach(drawing => {
                    try {
                        const path = JSON.parse(drawing.path);
                        L.polyline(path, {
                            color: drawing.color,
                            weight: 3
                        }).addTo(drawingLayer);
                    } catch (e) {
                        console.error('Fehler beim Parsen der Zeichnung:', e);
                    }
                });
            }

            // Standardmäßig Navigationsmodus aktivieren
            isDrawMode = false;
            const modeToggleBtn = document.getElementById('mode-toggle');
            modeToggleBtn.textContent = 'Navigation';
            modeToggleBtn.classList.add('nav-mode');
            document.getElementById('map').classList.add('nav-mode');
        } else {
            throw new Error(data.error || 'Unbekannter Fehler beim Laden des Projekts');
        }
    } catch (error) {
        console.error('Fehler beim Laden des Projekts:', error);
        document.getElementById('create-project').classList.remove('hidden');
        document.getElementById('project-name').classList.add('hidden');
        document.getElementById('drawing-controls').classList.add('hidden');
    }
}

async function saveChanges() {
    try {
        console.log('Saving changes...');
        const center = map.getCenter();
        const zoom = map.getZoom();
        
        const drawings = [];
        drawingLayer.eachLayer(layer => {
            if (layer instanceof L.Polyline && !layer._tempLine) {
                drawings.push({
                    path: layer.getLatLngs(),
                    color: layer.options.color
                });
            }
        });

        console.log('Sending drawings:', drawings.length);
        const response = await fetch('api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'save',
                projectId: projectId,
                lat: center.lat,
                lng: center.lng,
                zoom: zoom,
                drawings: drawings
            })
        });

        const data = await response.json();
        console.log('Save response:', data);
        
        if (data.success) {
            hasUnsavedChanges = false;
            document.getElementById('save').classList.add('hidden');
            console.log('Projekt erfolgreich gespeichert');
        } else {
            console.error('Fehler beim Speichern:', data.error);
            // Save-Button sichtbar lassen bei Fehler
            showSaveButton();
        }
    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        // Save-Button sichtbar lassen bei Fehler
        showSaveButton();
    }
}

function showProjectModal() {
    document.getElementById('project-modal').classList.remove('hidden');
}

// Neue Funktion für den Mode-Toggle
function toggleMode() {
    isDrawMode = !isDrawMode;
    const modeToggleBtn = document.getElementById('mode-toggle');
    const mapElement = document.getElementById('map');

    if (isDrawMode) {
        // Zeichenmodus aktivieren
        modeToggleBtn.textContent = 'Zeichnen';
        modeToggleBtn.classList.remove('nav-mode');
        modeToggleBtn.classList.add('draw-mode');
        mapElement.classList.add('draw-mode');
        mapElement.classList.remove('nav-mode');
        
        // Karte einfrieren
        map.dragging.disable();
        map.touchZoom.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        map.boxZoom.disable();
        map.keyboard.disable();
        if (map.tap) map.tap.disable();
    } else {
        // Navigationsmodus aktivieren
        modeToggleBtn.textContent = 'Navigation';
        modeToggleBtn.classList.remove('draw-mode');
        modeToggleBtn.classList.add('nav-mode');
        mapElement.classList.remove('draw-mode');
        mapElement.classList.add('nav-mode');
        
        // Karte freigeben
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
        map.boxZoom.enable();
        map.keyboard.enable();
        if (map.tap) map.tap.enable();
    }
}

// Funktion zum Anzeigen des Save-Buttons
function showSaveButton() {
    const saveButton = document.getElementById('save');
    const drawingControls = document.getElementById('drawing-controls');
    
    // Erst den Container sichtbar machen
    drawingControls.classList.remove('hidden');
    
    // Dann den Save-Button anzeigen
    saveButton.classList.remove('hidden');
    
    hasUnsavedChanges = true;
}

// Debug-Funktion
function debugSaveButton() {
    const saveButton = document.getElementById('save');
    const drawingControls = document.getElementById('drawing-controls');
    console.log('Save Button Debug:');
    console.log('Save button exists:', !!saveButton);
    console.log('Save button classes:', saveButton.className);
    console.log('Save button display:', window.getComputedStyle(saveButton).display);
    console.log('Save button visibility:', window.getComputedStyle(saveButton).visibility);
    console.log('Drawing controls hidden:', drawingControls.classList.contains('hidden'));
    console.log('Drawing controls display:', window.getComputedStyle(drawingControls).display);
} 