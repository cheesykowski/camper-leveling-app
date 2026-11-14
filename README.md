# KEILOMAT

KEILOMAT is a mobile-first web app that helps level a parked camper van. It can use a phone's orientation sensor. Support for an external Bluetooth IMU is planned but is not connected yet.

> **Status:** Early prototype. Sensor orientation and wedge recommendations must be validated with the actual vehicle and wedges. This app is not a safety-critical measuring or driving aid.

## Prototype features

- Live pitch and roll readings from the browser's device-orientation API, when available
- A three-second calibration that stores the trimmed mean of phone readings or the current simulated tilt
- Separate calibration slots for simulation and phone; one calibration for the fixed external sensor
- Developer-only 3D tilt simulation in the browser, limited to ±30° on pitch and roll
- Selection between the phone sensor and the currently unavailable external sensor
- Locally stored wheelbase, track width, and up to five individually editable wedge heights, including decimal values
- A recommendation for up to two wheels, using wedge steps or required lift in centimeters
- A color highlight when the required lift exceeds the configured maximum height
- A vehicle top view showing the recommended wheel positions and wedge step numbers
- A shared vehicle top view in the main screen and vehicle setup
- A compact dashboard with sensor status, settings, and calibration controls
- Browser-local storage of vehicle settings and calibration slots
- English and German language selection, saved locally on the device
- An illustrated guide with separate setup and usage instructions for phone and external sensors
- Android installation and offline use after the app has been cached

The default vehicle dimensions and wedge heights are examples. Update them before relying on the app.

The recommendation identifies the lowest corner using the combined pitch and roll correction, then a second wheel along the geometrically dominant axis. In wedge mode it selects the highest configured step that does not exceed each calculated lift; below the smallest step, the vehicle is shown as level. In height mode it shows the required lift rounded to 0.1 cm; below 3 cm it is shown as level. Orange means the calculated lift exceeds the tallest wedge or the separately configured maximum height, respectively. If the maximum is exceeded, a warning takes precedence over the level indication. Settings with more than five wedge heights are reduced to the five lowest. The model prioritizes correction along the dominant axis; it does not guarantee that both axes are fully level. It treats the vehicle as a rigid plane on level ground. Tire deformation, suspension travel, uneven ground, and chassis flex are not modeled. Verify sensor axes, signs, support suitability, and heights on the vehicle before use.

For development, open the web version with `?simulation=1` to enable the interactive simulation. It is not available in the installed app. Simulation calibration slots are saved independently of phone slots; the readings and 3D box show tilt relative to the simulated calibration.

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

## Install and use offline

Open the deployed HTTPS app on Android and use the download icon beside the logo. When the browser offers installation, choose **Install app**; otherwise use **Install app** or **Add to Home screen** in the browser menu. The app can only be prepared while online. Wait until the offline status says it is ready before disconnecting.

The installed app is labeled KEILOMAT APP; the browser version is labeled KEILOMAT WEB. Both currently use the same release. The app and its leveling calculations work offline. Feedback requires an internet connection and is not queued. The external sensor is not connected yet. A new version is downloaded when online; the app asks before reloading to apply it.

Settings and calibration slots remain in the browser's local storage for the same site and browser profile; they are not synchronized across devices or browsers and can be lost when site data is cleared. Offline files can also be removed by the browser.

If offline access remains unavailable, clearing this site's browser data and reopening the app online can set up the cache again. **This also deletes the locally saved settings and calibrations.**

Offline and installation behavior is available in production builds (`npm run build` followed by `npm run preview`), not the Vite development server. Test a real Android device by installing while online, waiting for offline readiness, closing the app, enabling airplane mode, and reopening it. Verify the phone sensor and saved settings separately.

## Phone sensor access

Open the app in a supported mobile browser. Motion-sensor access may require a secure connection (HTTPS) and browser permission. Readings depend on how the phone is mounted in the vehicle. Park the vehicle and place the phone in its intended position before calibrating.

Place the phone flat and securely, screen up and top toward the vehicle's front. For each calibration slot, use the same phone position and orientation when calibrating and measuring. Verify the sensor axes and recommendations on the actual vehicle. An external sensor is intended to be mounted permanently and calibrated in place; it is not connected yet. Existing external calibration data is retained, with the previously selected calibration used as the single reference.

## Feedback

The feedback form uses Formspree for email notifications and stores submissions in the app owner's Formspree account. Providing a name is optional. Responses are not automatically written to this public repository; only reviewed, anonymized findings should be added here.

The GitHub Pages workflow supplies the Formspree endpoint at build time. For local development:

- Copy `.env.example` to `.env.local`.
- Configure the recipient address and privacy settings in Formspree.

The endpoint URL is included in the public app bundle and is not a secret. Do not put Formspree API keys or other private credentials in frontend code. If the endpoint changes, update both the workflow and `.env.example`.

## Project structure

- `src/App.jsx` — UI, sensor status, settings, and calibration interaction
- `src/calibration.js` — calibration slot normalization, migration, and offset utilities
- `src/i18n.js` — translations and language selection
- `src/pwa.js` — offline readiness, installation, and update handling
- `src/*.test.js` — unit tests
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
