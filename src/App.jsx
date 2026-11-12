import { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'camper-leveling-demo-v1';

const defaultVehicle = {
  wheelbaseCm: 240,
  trackWidthCm: 180,
  wedgeHeightsCm: [2.5, 5.5, 8.5],
};

const defaultCalibration = {
  pitch: 0,
  roll: 0,
};

const wheelPositions = [
  { id: 'front-left', label: 'Front left', x: 92, y: 104, side: 'left' },
  { id: 'front-right', label: 'Front right', x: 234, y: 104, side: 'right' },
  { id: 'rear-left', label: 'Rear left', x: 92, y: 286, side: 'left' },
  { id: 'rear-right', label: 'Rear right', x: 234, y: 286, side: 'right' },
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const parseListInput = (value) =>
  value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .sort((a, b) => a - b);

const chooseNearestHeight = (heights, target) => {
  if (!heights.length) return 0;
  const sorted = [...heights].sort((a, b) => a - b);
  return sorted.reduce((best, current) => {
    if (current >= target) {
      return best === null || current - target < Math.abs(best - target) ? current : best;
    }
    return best === null || Math.abs(current - target) < Math.abs(best - target) ? current : best;
  }, null) ?? sorted[sorted.length - 1];
};

function App() {
  const loadedState = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        calibration: defaultCalibration,
        vehicle: defaultVehicle,
      };
    }

    try {
      const parsed = JSON.parse(raw);
      return {
        calibration: {
          pitch: Number(parsed.calibration?.pitch ?? defaultCalibration.pitch),
          roll: Number(parsed.calibration?.roll ?? defaultCalibration.roll),
        },
        vehicle: {
          wheelbaseCm: Number(parsed.vehicle?.wheelbaseCm ?? defaultVehicle.wheelbaseCm),
          trackWidthCm: Number(parsed.vehicle?.trackWidthCm ?? defaultVehicle.trackWidthCm),
          wedgeHeightsCm: Array.isArray(parsed.vehicle?.wedgeHeightsCm)
            ? parsed.vehicle.wedgeHeightsCm.map(Number).filter((n) => Number.isFinite(n) && n > 0)
            : [...defaultVehicle.wedgeHeightsCm],
        },
      };
    } catch {
      return {
        calibration: defaultCalibration,
        vehicle: defaultVehicle,
      };
    }
  }, []);

  const [calibration, setCalibration] = useState(loadedState.calibration);
  const [vehicle, setVehicle] = useState(loadedState.vehicle);
  const [wedgeHeightsInput, setWedgeHeightsInput] = useState(
    loadedState.vehicle.wedgeHeightsCm.join(', '),
  );
  const [sensorData, setSensorData] = useState({ pitch: 0, roll: 0, supported: false, permissionGranted: false });
  const sensorDataRef = useRef(sensorData);
  const [simulatedTilt, setSimulatedTilt] = useState({ pitch: 0, roll: 0 });
  const [usingDemoMode, setUsingDemoMode] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [isHoldingCalibration, setIsHoldingCalibration] = useState(false);
  const [calibrationComplete, setCalibrationComplete] = useState(false);
  const calibrationTimeout = useRef(null);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        calibration,
        vehicle,
      }),
    );
  }, [calibration, vehicle]);

  useEffect(() => {
    const hasSensorAPI = 'DeviceOrientationEvent' in window;
    if (!hasSensorAPI) {
      setSensorData((current) => ({ ...current, supported: false }));
      setUsingDemoMode(true);
      return undefined;
    }

    setSensorData((current) => ({ ...current, supported: true }));

    const onOrientation = (event) => {
      const pitch = Number.isFinite(event.beta) ? event.beta : 0;
      const roll = Number.isFinite(event.gamma) ? event.gamma : 0;
      const nextSensorData = {
        pitch,
        roll,
        supported: true,
        permissionGranted: true,
      };

      sensorDataRef.current = nextSensorData;
      setSensorData(nextSensorData);
    };

    window.addEventListener('deviceorientation', onOrientation, true);

    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
    };
  }, []);

  useEffect(() => {
    if (!activeMenu) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setActiveMenu(null);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activeMenu]);

  useEffect(
    () => () => {
      if (calibrationTimeout.current !== null) {
        window.clearTimeout(calibrationTimeout.current);
      }
    },
    [],
  );

  const currentRoll = usingDemoMode ? simulatedTilt.roll : sensorData.roll - calibration.roll;
  const currentPitch = usingDemoMode ? simulatedTilt.pitch : sensorData.pitch - calibration.pitch;

  const recommendation = useMemo(() => {
    const pitchAbs = Math.abs(currentPitch);
    const rollAbs = Math.abs(currentRoll);
    const wedgeHeights = [...vehicle.wedgeHeightsCm].sort((a, b) => a - b);

    if (pitchAbs < 0.2 && rollAbs < 0.2) {
      return {
        axis: 'level',
        title: 'Vehicle is level',
        description: 'The app is within the target tolerance. No wedge adjustment needed right now.',
        wheels: ['front-left', 'front-right', 'rear-left', 'rear-right'],
        level: 0,
        requiredLiftCm: 0,
      };
    }

    if (pitchAbs >= rollAbs) {
      const frontHigh = currentPitch > 0;
      const targetAxle = frontHigh ? 'rear' : 'front';
      const requiredLiftCm = (vehicle.wheelbaseCm / 2) * Math.tan((pitchAbs * Math.PI) / 180);
      const selectedLevel = chooseNearestHeight(wedgeHeights, requiredLiftCm);

      return {
        axis: 'pitch',
        title: frontHigh ? 'Front is high' : 'Rear is high',
        description: frontHigh
          ? 'The front is higher than the rear. Place the wedges under the rear axle to lift the rear and bring the vehicle level.'
          : 'The rear is higher than the front. Place the wedges under the front axle to lift the front and bring the vehicle level.',
        wheels: targetAxle === 'rear' ? ['rear-left', 'rear-right'] : ['front-left', 'front-right'],
        level: selectedLevel,
        requiredLiftCm,
      };
    }

    const rightLow = currentRoll > 0;
    const targetSide = rightLow ? 'right' : 'left';
    const requiredLiftCm = (vehicle.trackWidthCm / 2) * Math.tan((rollAbs * Math.PI) / 180);
    const selectedLevel = chooseNearestHeight(wedgeHeights, requiredLiftCm);

    return {
      axis: 'roll',
      title: rightLow ? 'Right side is low' : 'Left side is low',
      description: rightLow
        ? 'The right side is lower than the left. Place wedges under the right-side wheels to lift the right side.'
        : 'The left side is lower than the right. Place wedges under the left-side wheels to lift the left side.',
      wheels: targetSide === 'right' ? ['front-right', 'rear-right'] : ['front-left', 'rear-left'],
      level: selectedLevel,
      requiredLiftCm,
    };
  }, [currentPitch, currentRoll, vehicle]);

  const startCalibrationHold = () => {
    if (calibrationTimeout.current !== null) return;

    setCalibrationComplete(false);
    setIsHoldingCalibration(true);
    calibrationTimeout.current = window.setTimeout(() => {
      setCalibration({
        pitch: sensorDataRef.current.pitch,
        roll: sensorDataRef.current.roll,
      });
      calibrationTimeout.current = null;
      setIsHoldingCalibration(false);
      setCalibrationComplete(true);
    }, 3000);
  };

  const cancelCalibrationHold = () => {
    if (calibrationTimeout.current !== null) {
      window.clearTimeout(calibrationTimeout.current);
      calibrationTimeout.current = null;
      setIsHoldingCalibration(false);
    }
  };

  const vehicleInputs = {
    wheelbaseCm: vehicle.wheelbaseCm,
    trackWidthCm: vehicle.trackWidthCm,
  };

  const handleWheelbaseChange = (event) => {
    setVehicle((current) => ({
      ...current,
      wheelbaseCm: clamp(Number(event.target.value) || 0, 100, 500),
    }));
  };

  const handleTrackWidthChange = (event) => {
    setVehicle((current) => ({
      ...current,
      trackWidthCm: clamp(Number(event.target.value) || 0, 80, 400),
    }));
  };

  const handleWedgeHeightsChange = (event) => {
    const value = event.target.value;
    setWedgeHeightsInput(value);
    const list = parseListInput(value);
    if (list.length) {
      setVehicle((current) => ({
        ...current,
        wedgeHeightsCm: list,
      }));
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">CL</div>
          <div>
            <p className="eyebrow">FIELD UNIT · 01</p>
            <h1>CAMPER<span>LEVEL</span></h1>
          </div>
        </div>
        <span className={`status-pill ${usingDemoMode ? 'demo' : 'live'}`}>
          <span className="status-dot" />
          {usingDemoMode ? 'DEMO MODE' : sensorData.supported ? 'SENSOR LIVE' : 'SEARCHING'}
        </span>
      </header>

      <main className="main-screen">
        <div className="telemetry">
          <div className="telemetry-item">
            <span className="eyebrow">PITCH</span>
            <strong>{currentPitch.toFixed(1)}<small>°</small></strong>
          </div>
          <span className="telemetry-divider" />
          <div className="telemetry-item">
            <span className="eyebrow">ROLL</span>
            <strong>{currentRoll.toFixed(1)}<small>°</small></strong>
          </div>
        </div>

        <section className="hero-panel" aria-label="Leveling recommendation">
          <div className="hero-heading">
            <span className="eyebrow">LEVELING SYSTEM / 01</span>
            <h2>{recommendation.title}</h2>
          </div>

          <div className="vehicle-diagram">
            <div className="diagram-heading">
              <span>TOP VIEW</span>
              <span className="diagram-direction">FRONT ↑</span>
            </div>
            <svg
              className="vehicle-svg"
              style={{
                '--pitch-tilt': `${clamp(currentPitch * 0.15, -3, 3)}deg`,
                '--roll-tilt': `${clamp(currentRoll * 0.15, -3, 3)}deg`,
              }}
              viewBox="0 0 360 420"
              role="img"
              aria-labelledby="vehicle-diagram-title vehicle-diagram-description"
            >
              <title id="vehicle-diagram-title">Recommended wedge positions</title>
              <desc id="vehicle-diagram-description">
                {recommendation.axis === 'level'
                  ? 'The vehicle is level; no wedges are needed.'
                  : `Place ${recommendation.level.toFixed(1)} centimeter wedges at ${recommendation.wheels
                      .map((wheel) => wheelPositions.find((position) => position.id === wheel)?.label)
                      .join(' and ')}.`}
              </desc>

              <rect className="vehicle-body" x="116" y="25" width="128" height="370" rx="45" />
              <path className="vehicle-glass" d="M130 80 Q180 52 230 80 L222 130 Q180 143 138 130 Z" />
              <path className="vehicle-roof" d="M133 147 Q180 136 227 147 L227 272 Q180 284 133 272 Z" />
              <path className="vehicle-glass" d="M138 289 Q180 278 222 289 L230 337 Q180 360 130 337 Z" />
              <line className="vehicle-seam" x1="124" y1="279" x2="236" y2="279" />

              {wheelPositions.map((wheel) => {
                const active =
                  recommendation.axis !== 'level' && recommendation.wheels.includes(wheel.id);
                const labelX = wheel.side === 'left' ? 8 : 292;
                const wedgePoints =
                  wheel.side === 'left'
                    ? `${wheel.x - 19},${wheel.y + 24} ${wheel.x},${wheel.y + 16} ${wheel.x},${wheel.y + 36}`
                    : `${wheel.x + 53},${wheel.y + 24} ${wheel.x + 34},${wheel.y + 16} ${wheel.x + 34},${wheel.y + 36}`;

                return (
                  <g key={wheel.id} className={active ? 'diagram-wheel active' : 'diagram-wheel'}>
                    <title>
                      {active
                        ? `${wheel.label}: place a ${recommendation.level.toFixed(1)} cm wedge here`
                        : `${wheel.label}: no wedge recommended`}
                    </title>
                    <rect className="diagram-tire" x={wheel.x} y={wheel.y} width="34" height="48" rx="10" />
                    {active && (
                      <>
                        <polygon className="diagram-wedge" points={wedgePoints} />
                        <rect
                          className="diagram-height-bg"
                          x={labelX}
                          y={wheel.y + 12}
                          width="60"
                          height="24"
                          rx="12"
                        />
                        <text
                          className="diagram-height"
                          x={labelX + 30}
                          y={wheel.y + 28}
                          textAnchor="middle"
                        >
                          {recommendation.level.toFixed(1)} cm
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              <text className="diagram-axle-label" x="180" y="20" textAnchor="middle">
                FRONT
              </text>
              <text className="diagram-axle-label" x="180" y="413" textAnchor="middle">
                REAR
              </text>
            </svg>
          </div>

          <div className={`level-readout ${recommendation.axis === 'level' ? 'is-level' : ''}`}>
            <span>{recommendation.axis === 'level' ? 'STATUS' : 'RECOMMENDED STEP'}</span>
            <strong>
              {recommendation.axis === 'level'
                ? 'NO WEDGES NEEDED'
                : `${recommendation.level.toFixed(1)} CM`}
            </strong>
            {recommendation.axis !== 'level' && (
              <small>Required lift ≈ {recommendation.requiredLiftCm.toFixed(1)} cm</small>
            )}
          </div>
        </section>

        <div className="action-area">
          <button
            className={`calibrate-button ${isHoldingCalibration ? 'is-holding' : ''} ${
              calibrationComplete ? 'is-complete' : ''
            }`}
            type="button"
            aria-label="Hold for 3 seconds to calibrate on level ground"
            aria-describedby="calibration-hint"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              startCalibrationHold();
            }}
            onPointerUp={cancelCalibrationHold}
            onPointerCancel={cancelCalibrationHold}
            onLostPointerCapture={cancelCalibrationHold}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                if (!event.repeat) startCalibrationHold();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                cancelCalibrationHold();
              }
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <span className="calibrate-icon" aria-hidden="true">
              {calibrationComplete ? '✓' : isHoldingCalibration ? '···' : '◎'}
            </span>
            <span>
              {calibrationComplete
                ? 'CALIBRATION STORED'
                : isHoldingCalibration
                  ? 'KEEP HOLDING'
                  : 'HOLD TO CALIBRATE'}
            </span>
            {!calibrationComplete && <span className="hold-duration">3 SEC</span>}
          </button>
          <p className="hold-hint" id="calibration-hint" aria-live="polite">
            {calibrationComplete
              ? 'Zero point saved.'
              : isHoldingCalibration
                ? 'Keep holding to save the current zero point'
                : 'Park on level ground, then hold to set zero'}
          </p>
        </div>
      </main>

      <nav className="bottom-menu" aria-label="Configuration">
        <button
          className={activeMenu === 'vehicle' ? 'menu-button selected' : 'menu-button'}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setActiveMenu('vehicle')}
        >
          <span className="menu-icon" aria-hidden="true">▤</span>
          <span>VEHICLE</span>
        </button>
        <span className="menu-divider" />
        <button
          className={activeMenu === 'wedges' ? 'menu-button selected' : 'menu-button'}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setActiveMenu('wedges')}
        >
          <span className="menu-icon" aria-hidden="true">▰</span>
          <span>WEDGES</span>
        </button>
      </nav>

      {activeMenu && (
        <div
          className="menu-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setActiveMenu(null);
          }}
        >
          <section
            className="menu-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-title"
          >
            <header className="menu-header">
              <div>
                <span className="eyebrow">CONFIGURATION</span>
                <h2 id="menu-title">{activeMenu === 'vehicle' ? 'Vehicle setup' : 'Wedge setup'}</h2>
              </div>
              <button
                className="close-menu"
                type="button"
                aria-label="Close configuration"
                onClick={() => setActiveMenu(null)}
              >
                ×
              </button>
            </header>

            <div className="menu-tabs" role="tablist" aria-label="Configuration sections">
              <button
                className={activeMenu === 'vehicle' ? 'menu-tab active' : 'menu-tab'}
                type="button"
                role="tab"
                aria-selected={activeMenu === 'vehicle'}
                onClick={() => setActiveMenu('vehicle')}
              >
                VEHICLE
              </button>
              <button
                className={activeMenu === 'wedges' ? 'menu-tab active' : 'menu-tab'}
                type="button"
                role="tab"
                aria-selected={activeMenu === 'wedges'}
                onClick={() => setActiveMenu('wedges')}
              >
                WEDGES
              </button>
            </div>

            {activeMenu === 'vehicle' ? (
              <div className="menu-content">
                <div className="settings-card input-group">
                  <label>
                    Wheelbase <span>CM</span>
                    <input
                      type="number"
                      value={vehicleInputs.wheelbaseCm}
                      min={100}
                      max={500}
                      onChange={handleWheelbaseChange}
                    />
                  </label>
                  <label>
                    Track width <span>CM</span>
                    <input
                      type="number"
                      value={vehicleInputs.trackWidthCm}
                      min={80}
                      max={400}
                      onChange={handleTrackWidthChange}
                    />
                  </label>
                </div>

                <div className="settings-card sensor-settings">
                  <div className="setting-copy">
                    <strong>Input source</strong>
                    <span>{usingDemoMode ? 'Manual demo controls' : 'Phone orientation sensor'}</span>
                  </div>
                  <button
                    className="source-toggle"
                    type="button"
                    onClick={() => setUsingDemoMode((current) => !current)}
                  >
                    {usingDemoMode ? 'USE LIVE SENSOR' : 'USE DEMO MODE'}
                  </button>

                  {usingDemoMode && (
                    <div className="demo-controls">
                      <label>
                        Pitch <output>{simulatedTilt.pitch.toFixed(1)}°</output>
                        <input
                          type="range"
                          min={-15}
                          max={15}
                          step={0.5}
                          value={simulatedTilt.pitch}
                          onChange={(event) =>
                            setSimulatedTilt((current) => ({
                              ...current,
                              pitch: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Roll <output>{simulatedTilt.roll.toFixed(1)}°</output>
                        <input
                          type="range"
                          min={-15}
                          max={15}
                          step={0.5}
                          value={simulatedTilt.roll}
                          onChange={(event) =>
                            setSimulatedTilt((current) => ({
                              ...current,
                              roll: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="menu-content">
                <div className="settings-card input-group">
                  <label>
                    Available wedge heights <span>CM · COMMA SEPARATED</span>
                    <input
                      type="text"
                      value={wedgeHeightsInput}
                      onChange={handleWedgeHeightsChange}
                      placeholder="2.5, 5.5, 8.5"
                      aria-invalid={parseListInput(wedgeHeightsInput).length === 0}
                    />
                  </label>
                  {parseListInput(wedgeHeightsInput).length === 0 && (
                    <p className="settings-error" role="status">
                      Enter at least one positive height to update the wedge steps.
                    </p>
                  )}
                  <p className="settings-hint">
                    Enter the step heights available for your wedges. Settings are saved on this device.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
