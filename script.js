let map;
let drawingLayer;
let isDrawing = false;
let currentColor = getCookieColor() || generateRandomColor();
let isEraser = false;
let currentPath = [];
let projectId = null;
let hasUnsavedChanges = false;
let isDrawMode = false; // Standardmäßig Navigationsmodus
let currentTempLine = null; // Neue Variable für temporäre Linie
let sessionId = null;

// Neue Variablen für das Tracking von Änderungen
let addedLines = new Set();
let deletedLines = new Set();
let modifiedLines = new Set();
let permanentlyDeletedLines = new Set(); // Neue Set für dauerhaft gelöschte Linien

// Neue Variable für den Zeitstempel des letzten Updates
let lastUpdate = Math.floor(Date.now() / 1000); // Initialer Wert ist aktuelle Zeit

// Cookie-Funktionen
function setCookieColor(color) {
    // Cookie für 1 Jahr setzen
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `userColor=${color};path=/;expires=${expires}`;
}

function getCookieColor() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'userColor') {
            return value;
        }
    }
    return null;
}

function generateRandomColor() {
    // Helle, gut sichtbare Farben generieren
    const hue = Math.floor(Math.random() * 360); // 0-360
    const saturation = 70 + Math.floor(Math.random() * 30); // 70-100%
    const lightness = 35 + Math.floor(Math.random() * 15); // 35-50%
    
    // Konvertiere HSL zu HEX
    const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const tempElement = document.createElement('div');
    tempElement.style.color = color;
    document.body.appendChild(tempElement);
    const rgbColor = window.getComputedStyle(tempElement).color;
    document.body.removeChild(tempElement);
    
    // RGB zu HEX konvertieren
    const rgbValues = rgbColor.match(/\d+/g);
    const hexColor = '#' + rgbValues.map(x => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
    
    // Cookie setzen
    setCookieColor(hexColor);
    
    return hexColor;
}

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    // URL Parameter auslesen
    const urlParams = new URLSearchParams(window.location.search);
    projectId = urlParams.get('project');

    // Validiere UUID Format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (projectId && !uuidRegex.test(projectId)) {
        showError('Ungültige Projekt-ID');
        setTimeout(() => {
            window.location.href = window.location.pathname;
        }, 2000);
        return;
    }

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
    
    // UI-Elemente verstecken
    document.getElementById('project-modal').classList.add('hidden');
    document.getElementById('project-name').classList.add('hidden');
    document.getElementById('drawing-controls').classList.add('hidden');
    document.getElementById('create-project').classList.add('hidden');
    document.getElementById('save').classList.add('hidden');
    hasUnsavedChanges = false;
    
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
        // Neue Farbe im Cookie speichern
        setCookieColor(currentColor);
    });
    
    document.getElementById('eraser').addEventListener('click', () => {
        isEraser = !isEraser; // Toggle Radierer
        const eraserBtn = document.getElementById('eraser');
        const colorPicker = document.getElementById('color-picker');
        
        if (isEraser) {
            eraserBtn.classList.add('active');
            // Cursor ändern um zu zeigen dass der Radierer aktiv ist
            document.getElementById('map').style.cursor = 'crosshair';
            // Farbpicker ausblenden
            colorPicker.style.display = 'none';
        } else {
            eraserBtn.classList.remove('active');
            document.getElementById('map').style.cursor = '';
            // Farbpicker wieder anzeigen
            colorPicker.style.display = 'inline-block';
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

    // Neue Funktion zum Löschen einer Linie
    function deleteLine(layer) {
        // Wenn die Linie eine ID hat (also bereits gespeichert wurde)
        if (layer.lineId) {
            deletedLines.add(layer.lineId); // ID zur Löschung vormerken
            permanentlyDeletedLines.add(layer.lineId);
        } else {
            // Wenn die Linie noch nicht gespeichert wurde
            addedLines.delete(layer);
        }
        
        // Linie von der Karte entfernen
        drawingLayer.removeLayer(layer);
        
        // Save-Button anzeigen
        showSaveButton();
    }

    // Im Event-Handler für den Radierer die Distanzberechnung anpassen:
    map.on('click', function(e) {
        if (!isDrawMode || !isEraser) return;
        
        let lineFound = false;
        drawingLayer.eachLayer(layer => {
            if (layer instanceof L.Polyline) {
                const points = layer.getLatLngs();
                
                // Prüfe jeden Punkt der Linie
                for (let i = 0; i < points.length - 1; i++) {
                    const point1 = map.latLngToContainerPoint(points[i]);
                    const point2 = map.latLngToContainerPoint(points[i + 1]);
                    const clickPoint = map.latLngToContainerPoint(e.latlng);
                    
                    // Berechne die Distanz zum Liniensegment in Pixeln
                    const distance = L.LineUtil.pointToSegmentDistance(clickPoint, point1, point2);
                    
                    if (distance < 10) { // 10 Pixel Toleranz
                        deleteLine(layer);
                        lineFound = true;
                        break;
                    }
                }
            }
        });
        
        if (lineFound) {
            e.originalEvent.preventDefault();
            e.originalEvent.stopPropagation();
        }
    });

    // Neue Event Listener für Map-Bewegungen
    map.on('moveend', function() {
        if (projectId) {
            showSaveButton();
        }
    });

    map.on('zoomend', function() {
        if (projectId) {
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
            document.title = name;
        } else {
            console.error('Projekt konnte nicht erstellt werden:', data.error);
        }
    } catch (error) {
        console.error('Fehler beim Erstellen des Projekts:', error);
    }
}

async function loadProject() {
    try {
        // URL um sessionId erweitern falls vorhanden
        let url = `api.php?action=load&project=${projectId}`;
        if (sessionId) {
            url += `&sessionId=${sessionId}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.success) {
            showError('Projekt nicht gefunden');
            setTimeout(() => {
                window.location.href = window.location.pathname;
            }, 2000);
            return;
        }

        // Session ID speichern
        sessionId = data.sessionId;
        
        // Projektnamen als Titel setzen
        document.title = data.name;
        
        // Projektname im UI anzeigen
        document.getElementById('project-name').classList.remove('hidden');
        document.getElementById('project-name-text').textContent = data.name;
        
        // Warnung anzeigen wenn mehrere Benutzer aktiv sind
        let warningDiv = document.getElementById('active-users-warning');
        if (!warningDiv) {
            warningDiv = document.createElement('div');
            warningDiv.id = 'active-users-warning';
            document.getElementById('project-name').appendChild(warningDiv);
        }
        
        // Initial die Anzahl der aktiven Benutzer anzeigen
        if (data.activeUsers > 1) {
            warningDiv.textContent = `${data.activeUsers} aktive Benutzer`;
            warningDiv.style.display = 'block';
        } else {
            warningDiv.style.display = 'none';
        }

        // Regelmäßiges Update der aktiven Benutzer
        setInterval(() => {
            fetch(`api.php?action=check_active_users&project=${projectId}&sessionId=${sessionId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        if (data.activeUsers > 1) {
                            warningDiv.textContent = `${data.activeUsers} aktive Benutzer`;
                            warningDiv.style.display = 'block';
                        } else {
                            warningDiv.style.display = 'none';
                        }
                    }
                });
        }, 5000); // Alle 5 Sekunden aktualisieren statt 30000

        // Controls sichtbar machen
        const drawingControls = document.getElementById('drawing-controls');
        drawingControls.classList.remove('hidden');
        
        // Kopier-Button Event Listener
        document.getElementById('copy-link').addEventListener('click', function() {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                // Visuelles Feedback
                const copyButton = this;
                copyButton.classList.add('copied');
                setTimeout(() => {
                    copyButton.classList.remove('copied');
                }, 1500);
            }).catch(err => {
                console.error('Fehler beim Kopieren:', err);
            });
        });
        
        // Save-Button initial verstecken
        const saveButton = document.getElementById('save');
        saveButton.classList.remove('show');
        saveButton.classList.add('hidden');
        hasUnsavedChanges = false;
        
        // Karten-Position setzen
        if (data.lat && data.lng && data.zoom) {
            // Map-Events temporär deaktivieren
            map.off('moveend');
            map.off('zoomend');
            
            // Position setzen
            map.setView([data.lat, data.lng], data.zoom);
            
            // Nach kurzer Verzögerung Map-Events wieder aktivieren
            setTimeout(() => {
                // Map-Events für Position und Zoom
                map.on('moveend', function() {
                    if (projectId) {
                        // Save-Button bei jeder manuellen Änderung anzeigen
                        showSaveButton();
                    }
                });

                map.on('zoomend', function() {
                    if (projectId) {
                        // Save-Button bei jeder manuellen Änderung anzeigen
                        showSaveButton();
                    }
                });
            }, 1000); // 1 Sekunde warten
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
        
        // Regelmäßiges Prüfen auf Updates
        setInterval(checkForUpdates, 2000); // Alle 2 Sekunden

        // Server-Zeitstempel übernehmen
        if (data.serverTime) {
            lastUpdate = data.serverTime;
            console.log('Initial server time:', lastUpdate);
        }

        // Color-Picker auf die aktuelle Farbe setzen
        document.getElementById('color-picker').value = currentColor;
    } catch (error) {
        showError('Fehler beim Laden des Projekts');
        // Titel zurücksetzen
        document.title = 'Collaborative Drawing';
        setTimeout(() => {
            window.location.href = window.location.pathname;
        }, 2000);
    }
}

async function saveChanges() {
    try {
        console.log('Saving changes...');
        const center = map.getCenter();
        const zoom = map.getZoom();
        
        // Nur Linien speichern, die noch nicht gelöscht wurden
        const linesToSave = Array.from(addedLines)
            .filter(layer => {
                // Nicht speichern wenn die Linie als Layer in deletedLines ist
                return !Array.from(deletedLines).some(item => 
                    // Vergleiche Layer-Objekte oder IDs
                    item === layer || (layer.lineId && item === layer.lineId)
                );
            })
            .map(layer => ({
                layer: layer,
                data: {
                    path: layer.getLatLngs(),
                    color: layer.options.color
                }
            }));

        // Nur IDs von existierenden (bereits gespeicherten) Linien zum Löschen senden
        const linesToDelete = Array.from(deletedLines)
            .filter(item => typeof item === 'number'); // Nur numerische IDs

        const changes = {
            added: linesToSave.map(item => item.data),
            deleted: linesToDelete,
            modified: Array.from(modifiedLines)
        };

        console.log('Sending changes:', {
            added: changes.added.length,
            deleted: changes.deleted.length,
            modified: changes.modified.length,
            deletedLines: Array.from(deletedLines), // Debug
            addedLines: Array.from(addedLines) // Debug
        });

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
                changes: changes
            })
        });

        const data = await response.json();
        if (data.success) {
            // Neue IDs den Linien zuweisen und aus addedLines entfernen
            if (data.newLines) {
                linesToSave.forEach((item, index) => {
                    const newLine = data.newLines[index];
                    if (newLine) {
                        item.layer.lineId = newLine.id;
                        addedLines.delete(item.layer);
                    }
                });
            }
            
            // Alle gelöschten Linien in permanentlyDeletedLines übernehmen
            deletedLines.forEach(id => {
                permanentlyDeletedLines.add(id);
            });
            
            // Änderungslisten zurücksetzen
            deletedLines.clear();
            modifiedLines.clear();
            
            // Save Button ausblenden wenn keine Änderungen mehr vorhanden
            if (!hasUncommittedChanges()) {
                hideSaveButton();
            }
            
            // Zeitstempel aktualisieren
            lastUpdate = data.serverTime;
            
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

// Neue Funktion um zu prüfen ob es ungespeicherte Änderungen gibt
function hasUncommittedChanges() {
    return addedLines.size > 0 || deletedLines.size > 0 || modifiedLines.size > 0;
}

// Funktion zum Anzeigen des Save-Buttons
function showSaveButton() {
    const saveButton = document.getElementById('save');
    saveButton.classList.remove('hidden');
    saveButton.classList.add('show');
    hasUnsavedChanges = true;
    console.log('Save button shown, changes:', {
        added: addedLines.size,
        deleted: deletedLines.size,
        modified: modifiedLines.size,
        mapMoved: true
    });
}

function hideSaveButton() {
    const saveButton = document.getElementById('save');
    saveButton.classList.remove('show');
    saveButton.classList.add('hidden');
    hasUnsavedChanges = false;
    console.log('Save button hidden, hasUnsavedChanges:', hasUnsavedChanges);
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
        addedLines.add(line); // Neue Linie als hinzugefügt markieren
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

// Neue Funktion für Fehlermeldungen
function showError(message) {
    // Erstelle ein Element für die Fehlermeldung falls es noch nicht existiert
    let errorDiv = document.getElementById('error-message');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'error-message';
        document.body.appendChild(errorDiv);
    }
    
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    
    // Fehlermeldung nach 2 Sekunden ausblenden
    setTimeout(() => {
        errorDiv.classList.remove('show');
    }, 2000);
}

// Neue Funktion für das Prüfen auf Updates
async function checkForUpdates() {
    if (!projectId) return;
    
    const timestamp = lastUpdate || Math.floor(Date.now() / 1000);
    
    try {
        const response = await fetch(`api.php?action=check_updates&project=${projectId}&lastUpdate=${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        if (!text) {
            console.log('Leere Antwort vom Server');
            return;
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Fehler beim Parsen der Server-Antwort:', text);
            throw e;
        }
        
        if (data.success) {
            // Neue Zeichnungen hinzufügen
            if (data.updates && data.updates.new) {
                data.updates.new.forEach(drawing => {
                    // Nicht hinzufügen wenn die Linie in deletedLines oder permanentlyDeletedLines ist
                    if (!Array.from(deletedLines).includes(drawing.id) && 
                        !permanentlyDeletedLines.has(drawing.id) &&
                        !Array.from(addedLines).some(line => line.lineId === drawing.id)) {
                        const path = JSON.parse(drawing.path);
                        const line = L.polyline(path, {
                            color: drawing.color,
                            weight: 3
                        });
                        line.lineId = drawing.id;
                        drawingLayer.addLayer(line);
                    }
                });
            }
            
            // Prüfen welche lokalen Linien nicht mehr existieren
            if (data.updates && data.updates.existingIds) {
                const existingIds = new Set(data.updates.existingIds);
                drawingLayer.eachLayer(layer => {
                    if (layer instanceof L.Polyline && layer.lineId) {
                        // Nicht entfernen wenn die Linie gerade erst gelöscht wurde
                        if (!existingIds.has(layer.lineId) && 
                            !addedLines.has(layer) && 
                            !deletedLines.has(layer.lineId)) {
                            drawingLayer.removeLayer(layer);
                        }
                    }
                });
            }
            
            if (data.updates && data.updates.serverTime) {
                lastUpdate = data.updates.serverTime;
                console.log('Updated server time:', lastUpdate);
            }
        } else if (data.error) {
            console.error('Server meldet Fehler:', data.error);
        }
    } catch (error) {
        console.error('Fehler beim Prüfen auf Updates:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
} 