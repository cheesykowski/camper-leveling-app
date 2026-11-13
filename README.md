# KEILOMAT

KEILOMAT ist eine mobile-first Web-App, die dabei hilft, ein Wohnmobil beim Parken auszurichten. Als Datenquelle dienen die Bewegungssensoren des Smartphones oder eine interaktive 3D-Simulation. Eine Verbindung zu einer externen Bluetooth-IMU ist für einen späteren Entwicklungsschritt vorgesehen.

> **Status:** früher Prototyp. Die Sensorausrichtung und Keil-Empfehlungen müssen mit dem realen Fahrzeug und den tatsächlichen Keilen überprüft werden. Die App ist derzeit keine sicherheitskritische Mess- oder Fahrhilfe.

## Funktionen des Prototyps

- Pitch- und Roll-Anzeige über die Browser-Orientierungssensoren, sofern verfügbar
- Kalibrierung auf möglichst ebener Fläche; Smartphone- und externe Sensor-Kalibrierungen werden getrennt gespeichert
- Interaktive 3D-Neigungssimulation mit begrenztem Pitch- und Roll-Winkel von bis zu ±30°, falls kein Sensor verfügbar ist
- Auswahl zwischen Simulation, Smartphone-Sensor und (derzeit nicht verfügbarer) externer Sensorquelle
- Eingabe und lokale Speicherung von Radstand, Spurweite und Keilstufenhöhen (auch Dezimalwerte)
- Empfehlung für höchstens zwei Keile; die dominante Neigung wird anhand der Geometrie aus Pitch, Roll, Radstand und Spurweite bestimmt
- Anzeige der beiden gewählten Keilpositionen und ihrer ganzzahligen Stufennummern
- Draufsicht des Fahrzeugs mit markierten Keilpositionen und ganzzahligen Stufennummern
- Gemeinsame Fahrzeug-Draufsicht in der Hauptansicht und Fahrzeugkonfiguration
- Reduzierte Retro-Oberfläche mit Live-Neigungsanzeige und einer Drei-Sekunden-Halteaktion zur Kalibrierung
- Fahrzeugparameter und einzeln editierbare Keilstufen im Konfigurationsmenü
- Speicherung der Einstellungen im `localStorage` des verwendeten Browsers

Die Standardwerte für Fahrzeug und Keile sind nur Beispielwerte und müssen vor einer realen Verwendung angepasst werden.

Die Empfehlung verwendet zwei Keile: Am tiefsten diagonalen Rad wird die kombinierte Pitch-/Roll-Korrektur angesetzt; der zweite Keil liegt am benachbarten Rad entlang der dominanten, geometrisch skalierten Neigung. Verwendet wird jeweils die höchste konfigurierte Keilhöhe (auch Dezimalwerte sind möglich), die den berechneten Hub nicht überschreitet. Angezeigt wird die ganzzahlige Stufennummer, nicht die berechnete Höhe. Damit ist der dominante Achsenausgleich priorisiert, nicht notwendigerweise eine vollständige Nivellierung beider Achsen garantiert. Das Modell behandelt das Fahrzeug als starre Ebene auf ebenem Untergrund. Reifenverformung, Federweg, unebener Untergrund und Verwindung des Fahrgestells sind nicht modelliert. Sensorachsen, Vorzeichen und reale Keilstufen müssen vor einem realen Einsatz am Fahrzeug überprüft werden.

## Lokal entwickeln

Voraussetzung: Node.js und npm.

```bash
npm install
npm run dev
```

Vite zeigt die lokale Entwicklungsadresse im Terminal an (standardmäßig `http://localhost:5173`). Für einen Produktions-Build:

```bash
npm run build
npm run preview
```

## Android-Sensorzugriff

Öffne die App in einem unterstützten mobilen Browser. Der Zugriff auf Bewegungssensoren kann eine sichere Verbindung (HTTPS) und eine Browser-Berechtigung erfordern. Die Sensorwerte hängen davon ab, wie das Smartphone im Fahrzeug befestigt ist. Vor der Kalibrierung muss das Fahrzeug stehen und sich das Telefon in seiner vorgesehenen Einbauposition befinden.

## Feedback für den Freundestest

Das Feedbackformular nutzt Formspree für E-Mail-Benachrichtigungen und speichert Originalantworten im Formspree-Konto des App-Eigentümers. Der Name ist freiwillig. Antworten werden nicht automatisch in dieses öffentliche Repository geschrieben; hier sollen nur geprüfte, anonymisierte Erkenntnisse ergänzt werden.

Erstelle ein Formspree-Formular und konfiguriere dort Empfängeradresse und Datenschutzeinstellungen. Setze anschließend dessen Endpunkt-URL als `VITE_FORMSPREE_ENDPOINT`:

- Lokal: `.env.example` nach `.env.local` kopieren und die Endpunkt-URL eintragen.
- Für GitHub Pages: Unter **Settings → Secrets and variables → Actions → Variables** eine Repository-Variable `VITE_FORMSPREE_ENDPOINT` anlegen.

Die Endpunkt-URL wird in das öffentliche App-Bundle aufgenommen und ist kein Geheimnis. Formspree-API-Schlüssel oder andere private Zugangsdaten dürfen nicht in den Frontend-Code. Bis ein Endpunkt konfiguriert ist, zeigt der Feedbackdialog an, dass das Formular noch nicht verfügbar ist.

## Projektstruktur

- `src/App.jsx` – Oberfläche, Sensorstatus, Einstellungen und einfache Empfehlung
- `src/styles.css` – Gestaltung und responsive Layouts
- `src/main.jsx` – React-Einstiegspunkt
- `vite.config.js` – Vite-Konfiguration
- `PLAN.md` – Entwicklungsplan, aktueller Stand und nächste Schritte

## Hosting

Pushes auf `main` starten automatisch den GitHub-Actions-Workflow unter `.github/workflows/deploy-pages.yml`. Er installiert die Abhängigkeiten, erstellt den Vite-Build und veröffentlicht `dist` auf GitHub Pages. Der Vite-Basispfad wird im Actions-Build auf den Projektnamen gesetzt; lokal bleibt die App unter der Vite-Root-Adresse erreichbar.

Aktuelle Veröffentlichungsadresse:

<https://cheesykowski.github.io/camper-leveling-app/>

Falls Pages für das Repository noch nicht aktiviert ist, in **Settings → Pages** als Build-Quelle **GitHub Actions** auswählen. Der Link ist nutzbar, sobald der erste Actions-Workflow erfolgreich abgeschlossen wurde.

## Weiterentwicklung

Siehe [PLAN.md](./PLAN.md). Halte diese Datei bei jeder relevanten Änderung aktuell: Status, erledigte Aufgaben, neue Erkenntnisse und nächste Schritte sollten dem tatsächlichen Stand im Code entsprechen.
