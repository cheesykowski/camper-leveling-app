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
- [x] Dominante Neigung anhand der geometrischen Hubbeiträge von Pitch, Roll, Radstand und Spurweite bestimmen
- [x] Einen Zwei-Keil-Plan mit kombinierter Stufe am tiefsten diagonalen Rad und einer Stufe entlang der dominanten Achse berechnen
- [x] Dezimale Keilhöhen erlauben, aber nur ganzzahlige Stufennummern empfehlen und nie über den benötigten Hub aufrunden
- [x] Gemeinsame Fahrzeug-Draufsicht in Hauptansicht und Fahrzeugkonfiguration, mit den zwei empfohlenen Keilpositionen und Stufennummern
- [x] Minimalistische 3D-Fahrzeugsimulation und Keilstufen-Symbol in der Konfiguration
- [x] Retro-Dashboard mit Menü für Fahrzeug-/Keilparameter und Drei-Sekunden-Kalibrierung
- [x] Keilhöhen als einzelne Stufen editierbar, hinzufügbar und entfernbar
- [x] Feedbackdialog für den Freundestest mit freiwilligem Namen, Kategorie, Freitext und Einwilligung; Formspree-Endpunktkonfiguration steht noch aus
- [ ] Browserberechtigungen und tatsächliche Sensororientierung auf dem Ziel-Android-Gerät verifizieren
- [x] GitHub-Pages-Workflow und Vite-Basis-Pfad für Actions eingerichtet; erfolgreicher erster Deployment-Lauf und Android-Test stehen noch aus
- [ ] Formspree-Formular und E-Mail-Benachrichtigung einrichten, GitHub-Actions-Variable setzen und echte Einsendung testen
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
- Sensorachsen, Vorzeichen und Nulllage am realen Fahrzeug gegenprüfen.
- Den Zwei-Keil-Dominanzplan mit realen Neigungen, Radständen und tatsächlich erreichbaren Keilhöhen validieren.
- Das Ebenenmodell bei Fahrgestellverwindung, Federweg und unebenem Untergrund praktisch validieren.
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
- Formspree-Endpunkt als Actions-Variable konfigurieren und den Versand samt privater Speicherung mit einer Testeinsendung prüfen.

## Technische Entscheidungen und offene Fragen

- **Frontend:** React und Vite.
- **Persistenz:** vorerst `localStorage`; Daten bleiben damit browser- und gerätegebunden.
- **Erster Sensor:** Smartphone-Orientierungssensor über die Web-Sensor-/Device-Orientation-APIs.
- **Zielplattform:** Android-Browser. Sensor- und BLE-Unterstützung ist browserabhängig; BLE-Protokoll wird später festgelegt.
- **Fahrzeugwerte:** Beispielwerte bis echte Maße vorliegen.
- **Hubmodell:** Pitch und Roll werden mit halbem Radstand bzw. halber Spurweite in Hubbeiträge umgerechnet. Die größere geometrische Komponente bestimmt die dominante Achse. Zwei Keile werden am tiefsten diagonalen Rad und am benachbarten Rad entlang der dominanten Achse platziert; ausgewählt wird die höchste konfigurierte Keilhöhe (Dezimalwerte erlaubt), die den erforderlichen Hub nicht überschreitet. Angezeigt wird nur die ganzzahlige Stufennummer. Das gleicht die dominante Achse priorisiert aus, garantiert aber nicht die vollständige Nivellierung beider Achsen.
- **Kalibrierung:** muss auf ebener Fläche bei korrekt montiertem Sensor erfolgen; die App muss die Achsen-/Vorzeichenkonvention sichtbar und testbar machen.
- **Feedback:** Originalantworten werden über Formspree per E-Mail zugestellt und dort gespeichert. Das öffentliche Repository erhält keine Rohantworten oder Namen, sondern nur manuell geprüfte, anonymisierte Erkenntnisse. Die Formspree-Endpunkt-URL ist öffentlich und wird zur Build-Zeit eingebunden; private API-Schlüssel gehören nicht ins Frontend.

## Pflege dieses Plans

Bei jedem Feature- oder Fix-Commit:

1. Häkchen und Status im Abschnitt „Aktueller Stand“ aktualisieren.
2. Erledigte, geänderte oder neu entdeckte nächste Schritte anpassen.
3. Technische Entscheidungen und offene Fragen ändern, sobald sie entschieden sind.
4. Keine Aufgabe als abgeschlossen markieren, bevor sie im Code umgesetzt und – wo sinnvoll – getestet wurde.
