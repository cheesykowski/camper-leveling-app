import { useEffect, useMemo, useState } from 'react';

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
  const [sensorData, setSensorData] = useState({ pitch: 0, roll: 0, supported: false, permissionGranted: false });
  const [simulatedTilt, setSimulatedTilt] = useState({ pitch: 0, roll: 0 });
  const [usingDemoMode, setUsingDemoMode] = useState(false);

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

      setSensorData({
        pitch,
        roll,
        supported: true,
        permissionGranted: true,
      });
    };

    window.addEventListener('deviceorientation', onOrientation, true);

    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
    };
  }, []);

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

  const handleCalibration = () => {
    setCalibration({
      pitch: sensorData.pitch,
      roll: sensorData.roll,
    });
  };

  const handleReset = () => {
    setCalibration(defaultCalibration);
    setSimulatedTilt({ pitch: 0, roll: 0 });
  };

  const vehicleInputs = {
    wheelbaseCm: vehicle.wheelbaseCm,
    trackWidthCm: vehicle.trackWidthCm,
    wedgeHeightsCm: vehicle.wedgeHeightsCm.join(', '),
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Camper leveling helper</p>
          <h1>Vehicle levelling guide</h1>
        </div>
        <button className="secondary" onClick={handleReset}>Reset</button>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-header">
            <h2>Sensor</h2>
            <span className={`status ${sensorData.supported || usingDemoMode ? 'good' : 'bad'}`}>
              {usingDemoMode ? 'Demo mode' : sensorData.supported ? 'Live sensor' : 'No sensor'}
            </span>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <span>Pitch</span>
              <strong>{currentPitch.toFixed(1)}°</strong>
            </div>
            <div className="metric-card">
              <span>Roll</span>
              <strong>{currentRoll.toFixed(1)}°</strong>
            </div>
            <div className="metric-card">
              <span>Wheelbase</span>
              <strong>{vehicle.wheelbaseCm} cm</strong>
            </div>
            <div className="metric-card">
              <span>Track width</span>
              <strong>{vehicle.trackWidthCm} cm</strong>
            </div>
          </div>

          <div className="sensor-actions">
            <button onClick={handleCalibration}>Calibrate on level ground</button>
            <button className="ghost" onClick={() => setUsingDemoMode((prev) => !prev)}>
              {usingDemoMode ? 'Use live sensor' : 'Use demo values'}
            </button>
          </div>

          {usingDemoMode && (
            <div className="demo-panel">
              <label>
                Pitch
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.5}
                  value={simulatedTilt.pitch}
                  onChange={(event) =>
                    setSimulatedTilt((current) => ({ ...current, pitch: Number(event.target.value) }))
                  }
                />
                <span>{simulatedTilt.pitch.toFixed(1)}°</span>
              </label>
              <label>
                Roll
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={0.5}
                  value={simulatedTilt.roll}
                  onChange={(event) =>
                    setSimulatedTilt((current) => ({ ...current, roll: Number(event.target.value) }))
                  }
                />
                <span>{simulatedTilt.roll.toFixed(1)}°</span>
              </label>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Vehicle setup</h2>
          </div>

          <div className="input-group">
            <label>
              Wheelbase (cm)
              <input
                type="number"
                value={vehicleInputs.wheelbaseCm}
                min={100}
                max={500}
                onChange={(event) =>
                  setVehicle((current) => ({
                    ...current,
                    wheelbaseCm: clamp(Number(event.target.value) || 0, 100, 500),
                  }))
                }
              />
            </label>
            <label>
              Track width (cm)
              <input
                type="number"
                value={vehicleInputs.trackWidthCm}
                min={80}
                max={400}
                onChange={(event) =>
                  setVehicle((current) => ({
                    ...current,
                    trackWidthCm: clamp(Number(event.target.value) || 0, 80, 400),
                  }))
                }
              />
            </label>
            <label>
              Wedge heights (cm, comma separated)
              <input
                type="text"
                value={vehicleInputs.wedgeHeightsCm}
                onChange={(event) => {
                  const list = parseListInput(event.target.value);
                  setVehicle((current) => ({
                    ...current,
                    wedgeHeightsCm: list.length ? list : [...defaultVehicle.wedgeHeightsCm],
                  }));
                }}
              />
            </label>
          </div>
        </section>

        <section className="panel recommendation-panel">
          <div className="panel-header">
            <h2>Recommendation</h2>
            <span className="tag">{recommendation.axis === 'level' ? 'Level' : recommendation.axis}</span>
          </div>

          <h3>{recommendation.title}</h3>
          <p>{recommendation.description}</p>

          <div className="vehicle-diagram">
            <div className="diagram-heading">
              <strong>Top-down view</strong>
              <span>Front of vehicle ↑</span>
            </div>
            <svg
              className="vehicle-svg"
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
            <p className="diagram-note">
              {recommendation.axis === 'level'
                ? 'No wedges needed.'
                : `Place ${recommendation.level.toFixed(1)} cm wedges at the highlighted wheels.`}
            </p>
          </div>

          {recommendation.level > 0 ? (
            <div className="recommendation-box">
              <strong>Use wedge level: {recommendation.level.toFixed(1)} cm</strong>
              <span>Required lift ≈ {recommendation.requiredLiftCm.toFixed(1)} cm</span>
            </div>
          ) : (
            <div className="recommendation-box neutral">
              <strong>No wedge adjustment required.</strong>
            </div>
          )}

          <div className="wheel-grid">
            {wheelPositions.map((wheel) => {
              const active =
                recommendation.axis !== 'level' && recommendation.wheels.includes(wheel.id);
              return (
                <div key={wheel.id} className={`wheel-card ${active ? 'active' : ''}`}>
                  <span>{wheel.label}</span>
                  <strong>{active ? `${recommendation.level.toFixed(1)} cm` : '—'}</strong>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
