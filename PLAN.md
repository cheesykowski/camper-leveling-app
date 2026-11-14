# Development Plan

This file is the repository's shared project overview. **Update it in the same commit as each relevant implementation** so that GitHub and VS Code reflect the current state.

## Goal

Build an Android-friendly web app that measures the tilt of a parked camper and provides a clear recommendation based on IMU readings, vehicle geometry, and available wedge steps. The phone is the initial sensor; integration with a permanently mounted external IMU over Bluetooth Low Energy (BLE) may follow.

## Current status

- [x] React/Vite project with a responsive mobile interface
- [x] Pitch and roll readings via `DeviceOrientationEvent`, when the browser provides sensor access
- [x] Developer-only 3D simulation in the browser, controlled by mouse or touch; pitch and roll are limited to ±30°
- [x] Selection between phone sensor and an external sensor source that is not yet connected; unavailable data does not produce a leveling recommendation
- [x] Independent calibration slots for simulation and phone; a single selected calibration for the fixed external sensor
- [x] Three-second calibration that stores a trimmed mean of phone samples or the current simulated tilt
- [x] Vehicle settings stored in browser `localStorage`
- [x] Configurable wheelbase, track width, up to five wedge heights, and an alternative lift-height mode
- [x] Dominant tilt determined from geometry-scaled pitch and roll contributions
- [x] Direction label identifies the low axle or side where support is needed
- [x] Two-wedge plan with a combined step at the lowest corner and another step along the dominant axis
- [x] Highlight each wheel whose required lift exceeds the configured maximum
- [x] Decimal wedge heights supported; recommendations use whole-number step indices and never round above the required lift
- [x] Shared vehicle top view in the main screen and vehicle setup, including the two recommended wedge positions and step numbers
- [x] Minimal 3D vehicle simulation and wedge-step illustration in setup
- [x] Dashboard with vehicle/wedge settings and a three-second calibration hold
- [x] Wedge heights can be edited, added, and removed individually; the height mode has a separate maximum
- [x] Feedback dialog with optional name, category, free text, consent, and configured Formspree endpoint
- [x] English and German language selection, stored locally without changing existing calibration and vehicle settings
- [x] Illustrated help with separate setup and usage instructions for phone and external sensors
- [x] Installable PWA and cached offline app, with an explicit update prompt
- [x] GitHub Pages workflow and Vite base path configured
- [ ] Verify browser permissions and real sensor orientation on the target Android device
- [ ] Verify installation, offline launch, updates, and phone sensor access on an Android device
- [ ] Configure Formspree email notifications and test a submission and private storage
- [ ] Validate wedge recommendations against real measurements and the actual vehicle

Default vehicle and wedge values are placeholders. The calculations and sensor conventions are prototype logic, not validated vehicle-measurement technology.

## Next steps

### 1. Validate sensor behavior

- Verify sensor permissions and orientation on the target Android device.
- Test browser reloads and local storage on Android.
- Evaluate live sensor filtering separately from the calibration sample average.

### 2. Refine the vehicle and wedge model

- Record actual vehicle geometry and wedge heights.
- Verify sensor axes, signs, and level reference on the vehicle.
- Validate the two-wedge dominant-axis plan with real tilts, wheelbase, and reachable wedge heights.
- Validate the rigid-plane model in practice, including chassis flex, suspension travel, and uneven ground.
- Confirm signs, IMU mounting orientation, and calculations before real-world use.

### 3. Integrate an external BLE IMU

Integration requires the Arduino project or BLE protocol, device details, service and characteristic UUIDs, payload format, units, axis conventions, and update rate.

- Add BLE connection handling and connection status.
- Normalize sensor readings to a shared internal format.
- Keep phone, simulation, and BLE sensor sources separate.
- Handle reconnection, invalid data, and connection loss.

### 4. Hosting and quality

- Run `npm run build` in CI.
- Test on Android Chrome: HTTPS, sensor permissions, layout, calibration, and offline/network behavior.
- Configure the Formspree recipient and notifications; verify delivery and private storage with a test submission.

## Technical decisions

- **Frontend:** React and Vite.
- **Persistence:** Browser `localStorage`; data is specific to the browser and device.
- **Language:** English by default; German can be selected in the header and is saved locally.
- **Offline:** A service worker precaches the production app. Android installation is offered in the app when the browser supports it; feedback requires a connection. The offline dialog can check for updates; confirming an update activates the shared offline version and reloads only the confirming view; other open views offer their own reload.
- **Initial setup:** Vehicle dimensions and wedge or height settings require explicit confirmation; the selected sensor position needs calibration. Subtle markers indicate unfinished steps.
- **Initial sensor:** Phone orientation through the web `DeviceOrientationEvent` API.
- **Target platform:** Android browser. Sensor and BLE support varies by browser; the BLE protocol is not yet defined.
- **Vehicle values:** Example values until actual measurements are available.
- **Lift model:** Pitch and roll determine the required lift at the lowest corner and an adjacent wheel along the dominant axis. Wedge mode displays the highest step not exceeding the required lift, with a tolerance equal to the smallest step. Height mode displays the required lift rounded to 0.1 cm, with a 3 cm tolerance and a separate maximum height. Capacity warnings take precedence over the level indication. The model prioritizes correction along the dominant axis and does not guarantee that both axes are fully level.
- **Calibration:** Calibrate on level ground with the sensor mounted in its intended position. Place the phone flat, screen up, top toward the vehicle's front, and keep each slot's position and orientation unchanged. The three-second phone hold stores the trimmed mean of captured samples to reduce the effect of brief spikes. Simulation slots are independent of real sensor slots and record the tilt at the end of the hold. The external sensor uses one reference; existing data is retained with the previously selected calibration as that reference. Verify the axis and sign conventions in the vehicle.
- **Feedback:** Formspree receives and stores original submissions and can email notifications. The public repository must not contain raw responses or names; only manually reviewed, anonymized findings may be added. The endpoint URL is public and embedded at build time; private API keys must never be included in frontend code.

## Maintaining this plan

For each feature or fix:

1. Update the status and checkboxes above.
2. Revise completed work, changed findings, and next steps.
3. Update technical decisions when questions are resolved.
4. Mark work complete only after implementation and, where useful, verification.
