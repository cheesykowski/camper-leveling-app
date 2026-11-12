# Camper Leveling App

Eine mobile-first Web-App, die dabei hilft, ein Wohnmobil beim Parken auszurichten. Der aktuelle Prototyp verwendet die Bewegungssensoren des Smartphones oder Demo-Regler. Eine Verbindung zu einer externen Bluetooth-IMU ist für einen späteren Entwicklungsschritt vorgesehen.

> **Status:** früher Prototyp. Die Sensorausrichtung und Keil-Empfehlungen müssen mit dem realen Fahrzeug und den tatsächlichen Keilen überprüft werden. Die App ist derzeit keine sicherheitskritische Mess- oder Fahrhilfe.

## Funktionen des Prototyps

- Pitch- und Roll-Anzeige über die Browser-Orientierungssensoren, sofern verfügbar
- Kalibrierung auf möglichst ebener Fläche
- Demo-Modus mit Reglern, falls kein Sensor verfügbar ist
- Eingabe und lokale Speicherung von Radstand, Spurweite und Keilhöhen
- Einfache Empfehlung, welche Achse oder Fahrzeugseite angehoben werden sollte
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

Das Projekt ist für den späteren Einsatz unter einer GitHub-Pages-Projektadresse vorgesehen. Die Veröffentlichungsadresse wäre:

<https://cheesykowski.github.io/camper-leveling-app/>

Der Link ist erst nutzbar, wenn der GitHub-Actions-Workflow erfolgreich gelaufen ist und GitHub Pages die Veröffentlichung bestätigt. Die Vite-Basisadresse und der Pages-Workflow müssen im Repository entsprechend eingerichtet sein.

## Weiterentwicklung

Siehe [PLAN.md](./PLAN.md). Halte diese Datei bei jeder relevanten Änderung aktuell: Status, erledigte Aufgaben, neue Erkenntnisse und nächste Schritte sollten dem tatsächlichen Stand im Code entsprechen.
