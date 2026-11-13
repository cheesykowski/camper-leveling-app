# KEILOMAT

KEILOMAT ist eine mobile-first Web-App, die dabei hilft, ein Wohnmobil beim Parken auszurichten. Als Datenquelle dienen die Bewegungssensoren des Smartphones oder eine interaktive 3D-Simulation. Eine Verbindung zu einer externen Bluetooth-IMU ist für einen späteren Entwicklungsschritt vorgesehen.

> **Status:** früher Prototyp. Die Sensorausrichtung und Keil-Empfehlungen müssen mit dem realen Fahrzeug und den tatsächlichen Keilen überprüft werden. Die App ist derzeit keine sicherheitskritische Mess- oder Fahrhilfe.

## Funktionen des Prototyps

- Pitch- und Roll-Anzeige über die Browser-Orientierungssensoren, sofern verfügbar
- Kalibrierung auf möglichst ebener Fläche
- Interaktive 3D-Neigungssimulation mit begrenztem Pitch- und Roll-Winkel, falls kein Sensor verfügbar ist
- Auswahl zwischen Simulation, Smartphone-Sensor und (derzeit nicht verfügbarer) externer Sensorquelle
- Eingabe und lokale Speicherung von Radstand, Spurweite und Keilhöhen
- Einfache Empfehlung, welche Achse oder Fahrzeugseite angehoben werden sollte
- Draufsicht des Fahrzeugs mit markierten Keilpositionen, empfohlenem Schritt und Keilhöhe
- Reduzierte Retro-Oberfläche mit Live-Neigungsanzeige und einer Drei-Sekunden-Halteaktion zur Kalibrierung
- Fahrzeugparameter und einzeln editierbare Keilstufen im Konfigurationsmenü
- Speicherung der Einstellungen im `localStorage` des verwendeten Browsers

Die Standardwerte für Fahrzeug und Keile sind nur Beispielwerte und müssen vor einer realen Verwendung angepasst werden.

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
