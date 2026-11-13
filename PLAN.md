# Development Plan

This file is the repository's shared project overview. **Update it in the same commit as each relevant implementation** so that GitHub and VS Code reflect the current state.

## Goal

Build an Android-friendly web app that measures the tilt of a parked camper and provides a clear recommendation based on IMU readings, vehicle geometry, and available wedge steps. The phone is the initial sensor; integration with a permanently mounted external IMU over Bluetooth Low Energy (BLE) may follow.

## Current status

- [x] React/Vite project with a responsive mobile interface
- [x] Pitch and roll readings via `DeviceOrientationEvent`, when the browser provides sensor access
- [x] Interactive 3D simulation controlled by mouse or touch; pitch and roll are limited to ±30°
- [x] Selection between simulation, phone sensor, and an external sensor source that is not yet connected; unavailable data does not produce a leveling recommendation
- [x] Independent calibration slots for the phone and external sensor sources
- [x] Three-second phone calibration that stores a trimmed mean of captured pitch and roll samples
- [x] Vehicle settings stored in browser `localStorage`
- [x] Configurable wheelbase, track width, and wedge heights
- [x] Dominant tilt determined from geometry-scaled pitch and roll contributions
- [x] Two-wedge plan with a combined step at the lowest corner and another step along the dominant axis
- [x] Decimal wedge heights supported; recommendations use whole-number step indices and never round above the required lift
- [x] Shared vehicle top view in the main screen and vehicle setup, including the two recommended wedge positions and step numbers
- [x] Minimal 3D vehicle simulation and wedge-step illustration in setup
- [x] Dashboard with vehicle/wedge settings and a three-second calibration hold
- [x] Wedge heights can be edited, added, and removed individually
- [x] Feedback dialog with optional name, category, free text, consent, and configured Formspree endpoint
- [x] GitHub Pages workflow and Vite base path configured
- [ ] Verify browser permissions and real sensor orientation on the target Android device
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
- **Initial sensor:** Phone orientation through the web `DeviceOrientationEvent` API.
- **Target platform:** Android browser. Sensor and BLE support varies by browser; the BLE protocol is not yet defined.
- **Vehicle values:** Example values until actual measurements are available.
- **Lift model:** Pitch and roll are converted to lift contributions using half the wheelbase and half the track width. The larger geometric contribution determines the dominant axis. Two wedges are placed at the lowest diagonal wheel and its adjacent wheel along that axis. Each uses the highest configured wedge height, including decimal values, that does not exceed the required lift. Only the integer step number is displayed. The model prioritizes correction along the dominant axis and does not guarantee that both axes are fully level.
- **Calibration:** Calibrate on level ground with the sensor mounted in its intended position. The three-second hold stores the trimmed mean of the captured phone pitch and roll samples to reduce the effect of brief spikes. Verify the axis and sign conventions in the vehicle.
- **Feedback:** Formspree receives and stores original submissions and can email notifications. The public repository must not contain raw responses or names; only manually reviewed, anonymized findings may be added. The endpoint URL is public and embedded at build time; private API keys must never be included in frontend code.

## Maintaining this plan

For each feature or fix:

1. Update the status and checkboxes above.
2. Revise completed work, changed findings, and next steps.
3. Update technical decisions when questions are resolved.
4. Mark work complete only after implementation and, where useful, verification.
