# KEILOMAT

KEILOMAT is a mobile-first web app that helps level a parked camper van. It can use a phone's orientation sensor or an interactive 3D simulation. Support for an external Bluetooth IMU is planned but is not connected yet.

> **Status:** Early prototype. Sensor orientation and wedge recommendations must be validated with the actual vehicle and wedges. This app is not a safety-critical measuring or driving aid.

## Prototype features

- Live pitch and roll readings from the browser's device-orientation API, when available
- A three-second phone calibration that stores the trimmed mean of the captured pitch and roll samples
- Separate calibration slots for the phone and external sensor sources
- Interactive 3D tilt simulation, limited to ±30° on pitch and roll
- Selection between simulation, the phone sensor, and the currently unavailable external sensor
- Locally stored wheelbase, track width, and individually editable wedge heights, including decimal values
- A recommendation for up to two wedges based on pitch, roll, wheelbase, and track width
- A warning when the required lift exceeds the tallest configured wedge
- A vehicle top view showing the recommended wheel positions and wedge step numbers
- A shared vehicle top view in the main screen and vehicle setup
- A compact dashboard with sensor status, settings, and calibration controls
- Browser-local storage of vehicle settings and calibration slots

The default vehicle dimensions and wedge heights are examples. Update them before relying on the app.

The recommendation places one wedge at the lowest corner using the combined pitch and roll correction, then places a second wedge on the adjacent wheel along the geometrically dominant axis. For each position, it selects the highest configured wedge height that does not exceed the calculated lift. The app displays the integer step number rather than the calculated height. This prioritizes correction along the dominant axis; it does not guarantee that both axes are fully level. The model treats the vehicle as a rigid plane on level ground. Tire deformation, suspension travel, uneven ground, and chassis flex are not modeled. Verify sensor axes, signs, and real wedge heights on the vehicle before use.

## Local development

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Vite prints the local development URL in the terminal (usually `http://localhost:5173`). To create and preview a production build:

```bash
npm run build
npm run preview
```

Run the unit tests with:

```bash
npm test
```

## Phone sensor access

Open the app in a supported mobile browser. Motion-sensor access may require a secure connection (HTTPS) and browser permission. Readings depend on how the phone is mounted in the vehicle. Park the vehicle and place the phone in its intended position before calibrating.

## Feedback

The feedback form uses Formspree for email notifications and stores submissions in the app owner's Formspree account. Providing a name is optional. Responses are not automatically written to this public repository; only reviewed, anonymized findings should be added here.

The GitHub Pages workflow supplies the Formspree endpoint at build time. For local development:

- Copy `.env.example` to `.env.local`.
- Configure the recipient address and privacy settings in Formspree.

The endpoint URL is included in the public app bundle and is not a secret. Do not put Formspree API keys or other private credentials in frontend code. If the endpoint changes, update both the workflow and `.env.example`.

## Project structure

- `src/App.jsx` — UI, sensor status, settings, and calibration interaction
- `src/calibration.js` — calibration slot normalization, migration, and offset utilities
- `src/calibration.test.js` and `src/leveling.test.js` — unit tests
- `src/leveling.js` — wedge recommendation calculations
- `src/styles.css` — styling and responsive layouts
- `src/main.jsx` — React entry point
- `vite.config.js` — Vite configuration
- `keilomat_new_copy_20250425200144.ino` — legacy Arduino prototype, separate from the web app
- `PLAN.md` — project status, decisions, and next steps

## Hosting

Pushes to `main` start the GitHub Actions workflow in `.github/workflows/deploy-pages.yml`. It installs dependencies, builds the Vite app, and publishes `dist` to GitHub Pages. The workflow sets the Vite base path to the repository name; locally, the app uses the root path.

Published URL:

<https://cheesykowski.github.io/camper-leveling-app/>

If GitHub Pages is not enabled for the repository, select **GitHub Actions** as the publishing source in **Settings → Pages**. The URL is available after a successful deployment.

## Development plan

See [PLAN.md](./PLAN.md). Keep it in sync with the code whenever a relevant feature or fix changes project status, decisions, or next steps.
