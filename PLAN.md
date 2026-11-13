# Entwicklungsplan

Dieser Plan ist die gemeinsame, repository-lokale Übersicht für die Weiterentwicklung der Camper-Leveling-App. **Bei jeder relevanten Implementierung bitte diesen Plan im selben Commit aktualisieren**, damit er in GitHub und in VS Code den tatsächlichen Stand widerspiegelt.

## Ziel

Eine Android-taugliche Web-App, die die Neigung eines geparkten Wohnmobils misst und aus IMU-Werten, Fahrzeuggeometrie und den verfügbaren Keilstufen eine nachvollziehbare Empfehlung ableitet. Zunächst dient das Smartphone als Sensor; später soll die fest eingebaute externe IMU per Bluetooth Low Energy (BLE) angebunden werden.

## Aktueller Stand

- [x] React/Vite-Projekt und mobile-responsive Oberfläche
- [x] Pitch- und Roll-Anzeige über `DeviceOrientationEvent`, sofern der Browser Sensorzugriff bereitstellt
- [x] Interaktive 3D-Simulation über Ziehen mit Maus oder Touch; Pitch und Roll auf ±30° begrenzt
- [x] Auswahl zwischen Simulation, Smartphone-Sensor und noch nicht verbundener externer Sensorquelle; fehlende Werte führen nicht zu einer Level-Empfehlung
- [x] Smartphone- und externe Kalibrierungs-Offsets werden getrennt gespeichert; Fahrzeugdaten liegen ebenfalls im Browser-`localStorage`
- [x] Konfigurierbare Werte für Radstand, Spurweite und Keilhöhen
- [x] Einfache Empfehlung für eine Achse oder Fahrzeugseite
- [x] Gemeinsame Fahrzeug-Draufsicht in Hauptansicht und Fahrzeugkonfiguration, mit markierten Keilpositionen, empfohlenem Keilschritt und Höhe
- [x] Minimalistische 3D-Fahrzeugsimulation und Keilstufen-Symbol in der Konfiguration
- [x] Retro-Dashboard mit Menü für Fahrzeug-/Keilparameter und Drei-Sekunden-Kalibrierung
- [x] Keilhöhen als einzelne Stufen editierbar, hinzufügbar und entfernbar
- [ ] Browserberechtigungen und tatsächliche Sensororientierung auf dem Ziel-Android-Gerät verifizieren
- [x] GitHub-Pages-Workflow und Vite-Basis-Pfad für Actions eingerichtet; erfolgreicher erster Deployment-Lauf und Android-Test stehen noch aus
- [ ] Keilempfehlungen mit realen Messdaten und dem tatsächlichen Fahrzeug validieren

Die voreingestellten Fahrzeug- und Keilwerte sind Platzhalter. Aktuelle Berechnung und Sensorkonventionen sind Prototyp-Logik, keine validierte Fahrzeugmesstechnik.

## Nächste Schritte

### 1. Sensorbetrieb zuverlässig machen

- Sensorberechtigungen und tatsächliche Sensororientierung auf dem Ziel-Android-Gerät verifizieren.
- Sensorwerte glätten und unplausible bzw. fehlende Messwerte behandeln.
- Kalibrierung nur bei verfügbaren Messwerten ermöglichen; Status und gespeicherten Offset sichtbar machen.
- Browser-Neuladen und lokale Speicherung auf Android testen.

### 2. Fahrzeug- und Keilmodell präzisieren

- Fahrzeuggeometrie und Keilhöhen anhand realer Werte erfassen.
- Klären, ob Keilhöhen die absolute Höhe jeder Stufe oder zusätzliche Höhenzuwächse bedeuten.
- Empfehlung für eine einzelne Keilposition oder eine Kombination aus zwei Keilen berechnen und verständlich begründen.
- Übersteigt die erforderliche Höhe die verfügbaren Stufen, klar warnen statt eine scheinbar passende Stufe anzugeben.
- Pitch und Roll gemeinsam berücksichtigen und prüfen, wann zwei Keile an zwei Rädern nötig sind.
- Vor realem Einsatz Vorzeichen, Montageausrichtung der IMU und Berechnung praktisch validieren.

### 3. Externe BLE-IMU integrieren

Benötigt werden Arduino-Projekt bzw. BLE-Protokoll, Gerätedaten, Service- und Characteristic-UUIDs, Payload-Format, Einheiten, Achsenkonvention und Aktualisierungsrate.

- BLE-Verbindung und Verbindungsstatus ergänzen.
- Sensordaten in ein einheitliches internes Format überführen.
- Smartphone-, Simulations- und BLE-Sensorquellen sauber trennen.
- Wiederverbindung, ungültige Daten und Verbindungsabbrüche behandeln.

### 4. Hosting und Qualität

- Den ersten GitHub-Pages-Workflow erfolgreich ausführen und die Pages-URL prüfen.
- `npm run build` in CI ausführen.
- Auf Android Chrome testen: HTTPS, Sensorberechtigung, Layout, Kalibrierung und Offline-/Netzwerkverhalten.
- Hosting-Link erst dann als live markieren, wenn GitHub Pages einen erfolgreichen Deployment-Status zeigt.

## Technische Entscheidungen und offene Fragen

- **Frontend:** React und Vite.
- **Persistenz:** vorerst `localStorage`; Daten bleiben damit browser- und gerätegebunden.
- **Erster Sensor:** Smartphone-Orientierungssensor über die Web-Sensor-/Device-Orientation-APIs.
- **Zielplattform:** Android-Browser. Sensor- und BLE-Unterstützung ist browserabhängig; BLE-Protokoll wird später festgelegt.
- **Fahrzeugwerte:** Beispielwerte bis echte Maße vorliegen.
- **Kalibrierung:** muss auf ebener Fläche bei korrekt montiertem Sensor erfolgen; die App muss die Achsen-/Vorzeichenkonvention sichtbar und testbar machen.

## Pflege dieses Plans

Bei jedem Feature- oder Fix-Commit:

1. Häkchen und Status im Abschnitt „Aktueller Stand“ aktualisieren.
2. Erledigte, geänderte oder neu entdeckte nächste Schritte anpassen.
3. Technische Entscheidungen und offene Fragen ändern, sobald sie entschieden sind.
4. Keine Aufgabe als abgeschlossen markieren, bevor sie im Code umgesetzt und – wo sinnvoll – getestet wurde.
