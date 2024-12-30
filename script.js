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
    map = L.map('map', {
        zoomControl: true,
        tap: true,
        touchZoom: true,
        bounceAtZoomLimits: true,
        maxBoundsViscosity: 0.8
    }).setView([0, 0], 2);
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
    // Mouse Events
    map.on('mousedown', startDrawing);
    map.on('mousemove', draw);
    map.on('mouseup', stopDrawing);
    
    // Touch Events für Zeichnen
    let touchDrawing = false;

    map.on('touchstart', function(e) {
        if (!projectId || !isDrawMode) return;
        // Wenn es ein Single-Touch ist, starten wir das Zeichnen
        if (e.touches.length === 1) {
            touchDrawing = true;
            isDrawing = true;
            currentPath = [];
            const touch = e.touches[0];
            const point = map.mouseEventToLatLng(touch);
            currentPath.push(point);
            // Nur für Single-Touch-Zeichnen das Standard-Verhalten verhindern
            e.originalEvent.preventDefault();
        }
    });
    
    map.on('touchmove', function(e) {
        if (!projectId || !isDrawMode || !touchDrawing) return;
        // Nur für Single-Touch zeichnen
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const point = map.mouseEventToLatLng(touch);
            currentPath.push(point);
            updateDrawing();
            // Nur für Single-Touch-Zeichnen das Standard-Verhalten verhindern
            e.originalEvent.preventDefault();
        }
    });
    
    map.on('touchend', function(e) {
        if (touchDrawing) {
            touchDrawing = false;
            stopDrawing(e);
        }
    });

    // UI Controls
    document.getElementById('color-picker').addEventListener('change', (e) => {
        currentColor = e.target.value;
        isEraser = false;
    });
    
    document.getElementById('eraser').addEventListener('click', () => {
        isEraser = !isEraser; // Toggle Radierer
        const eraserBtn = document.getElementById('eraser');
        if (isEraser) {
            eraserBtn.classList.add('active');
            // Cursor ändern um zu zeigen dass der Radierer aktiv ist
            document.getElementById('map').style.cursor = 'crosshair';
        } else {
            eraserBtn.classList.remove('active');
            document.getElementById('map').style.cursor = '';
        }
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

    // Klick-Handler für das Löschen von Linien anpassen
    map.on('click', function(e) {
        if (!isDrawMode || !isEraser) return;
        
        const clickPoint = e.containerPoint; // Klickposition in Pixeln
        const linesToRemove = [];
        
        drawingLayer.eachLayer(function(layer) {
            if (layer instanceof L.Polyline) {
                const points = layer.getLatLngs();
                
                // Prüfe jeden Liniensegment
                for (let i = 0; i < points.length - 1; i++) {
                    const start = map.latLngToContainerPoint(points[i]);
                    const end = map.latLngToContainerPoint(points[i + 1]);
                    
                    // Berechne die Distanz in Pixeln
                    const distance = distanceToSegment(clickPoint, start, end);
                    
                    // Wenn die Distanz kleiner als 10 Pixel ist
                    if (distance < 10) {
                        linesToRemove.push(layer);
                        break;
                    }
                }
            }
        });

        // Gefundene Linien aus der Karte entfernen
        if (linesToRemove.length > 0) {
            linesToRemove.forEach(line => {
                drawingLayer.removeLayer(line);
            });
            showSaveButton();
        }
    });
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
                        const line = L.polyline(path, {
                            color: drawing.color,
                            weight: 3
                        });
                        // ID der Linie speichern
                        line.lineId = drawing.id;
                        line.addTo(drawingLayer);
                    } catch (e) {
                        console.error('Fehler beim Parsen der Zeichnung:', e);
                    }
                });
            }

            // Standardmäßig Navigationsmodus aktivieren
            isDrawMode = false;
            const modeToggleBtn = document.getElementById('mode-toggle');
            modeToggleBtn.textContent = 'Zeichnen';
            modeToggleBtn.classList.add('nav-mode');
            document.getElementById('map').classList.add('nav-mode');
            
            // Initial alle Kontrollelemente außer mode-toggle ausblenden
            const controlElements = drawingControls.querySelectorAll('*:not(#mode-toggle)');
            controlElements.forEach(element => {
                element.style.display = 'none';
            });
            
            // Alle Map-Interaktionen aktivieren
            map.dragging.enable();
            map.touchZoom.enable();
            map.doubleClickZoom.enable();
            map.scrollWheelZoom.enable();
            map.boxZoom.enable();
            map.keyboard.enable();
            if (map.tap) map.tap.enable();
            
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
                    id: layer.lineId, // ID mit speichern wenn vorhanden
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
        if (data.success) {
            hasUnsavedChanges = false;
            document.getElementById('save').classList.add('hidden');
            
            // Neue IDs den Linien zuweisen
            if (data.drawings) {
                drawingLayer.eachLayer(layer => {
                    if (layer instanceof L.Polyline) {
                        const drawing = data.drawings.find(d => 
                            JSON.stringify(d.path) === JSON.stringify(layer.getLatLngs())
                        );
                        if (drawing) {
                            layer.lineId = drawing.id;
                        }
                    }
                });
            }
            
            console.log('Projekt erfolgreich gespeichert');
        } else {
            console.error('Fehler beim Speichern:', data.error);
            showSaveButton();
        }
    } catch (error) {
        console.error('Fehler beim Speichern:', error);
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
    const drawingControls = document.getElementById('drawing-controls');
    const controlElements = drawingControls.querySelectorAll('*:not(#mode-toggle)');

    if (isDrawMode) {
        // Zeichenmodus aktivieren
        modeToggleBtn.textContent = 'Navigieren';
        modeToggleBtn.classList.remove('nav-mode');
        modeToggleBtn.classList.add('draw-mode');
        mapElement.classList.add('draw-mode');
        mapElement.classList.remove('nav-mode');
        
        // Kontrollelemente anzeigen
        controlElements.forEach(element => {
            element.style.display = '';
        });
        
        // Im Zeichenmodus nur bestimmte Interaktionen deaktivieren
        map.dragging.disable();
        map.boxZoom.disable();
        map.keyboard.disable();
        // Zoom-Funktionen aktiviert lassen
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
    } else {
        // Navigationsmodus aktivieren
        modeToggleBtn.textContent = 'Zeichnen';
        modeToggleBtn.classList.remove('draw-mode');
        modeToggleBtn.classList.add('nav-mode');
        mapElement.classList.remove('draw-mode');
        mapElement.classList.add('nav-mode');
        
        // Kontrollelemente ausblenden außer mode-toggle
        controlElements.forEach(element => {
            element.style.display = 'none';
        });
        
        // Alle Interaktionen wieder aktivieren
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

// Separate Funktionen für das Zeichnen
function startDrawing(e) {
    if (!projectId || !isDrawMode) return;
    isDrawing = true;
    currentPath = [];
    currentPath.push(e.latlng);
}

function draw(e) {
    if (!isDrawing || !projectId || !isDrawMode) return;
    currentPath.push(e.latlng);
    updateDrawing();
}

function stopDrawing(e) {
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
        showSaveButton();
    }
    currentPath = [];
}

// Hilfsfunktion zur Berechnung der Distanz zwischen Punkt und Liniensegment in Pixeln
function distanceToSegment(p, v, w) {
    const l2 = dist2(v, w);
    if (l2 === 0) return dist2(p, v);
    
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    
    return Math.sqrt(dist2(p, {
        x: v.x + t * (w.x - v.x),
        y: v.y + t * (w.y - v.y)
    }));
}

// Hilfsfunktion zur Berechnung des quadratischen Abstands zwischen zwei Punkten
function dist2(v, w) {
    return Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
} 