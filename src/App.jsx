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
      const savedWedgeHeights = Array.isArray(parsed.vehicle?.wedgeHeightsCm)
        ? parsed.vehicle.wedgeHeightsCm
            .map(Number)
            .filter((height) => Number.isFinite(height) && height > 0)
        : [];
      return {
        calibration: {
          pitch: Number(parsed.calibration?.pitch ?? defaultCalibration.pitch),
          roll: Number(parsed.calibration?.roll ?? defaultCalibration.roll),
        },
        vehicle: {
          wheelbaseCm: Number(parsed.vehicle?.wheelbaseCm ?? defaultVehicle.wheelbaseCm),
          trackWidthCm: Number(parsed.vehicle?.trackWidthCm ?? defaultVehicle.trackWidthCm),
          wedgeHeightsCm: savedWedgeHeights.length
            ? savedWedgeHeights
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
  const [wedgeHeightInputs, setWedgeHeightInputs] = useState(
    loadedState.vehicle.wedgeHeightsCm.map(String),
  );
  const [sensorData, setSensorData] = useState({
    pitch: 0,
    roll: 0,
    supported: false,
    available: false,
    permissionGranted: false,
  });
  const sensorDataRef = useRef(sensorData);
  const [simulatedTilt, setSimulatedTilt] = useState({ pitch: 0, roll: 0 });
  const [source, setSource] = useState('simulation');
  const [sourceMessage, setSourceMessage] = useState('');
  const sourceSelectionLocked = useRef(false);
  const dragStart = useRef(null);
  const sensorTimeout = useRef(null);
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
      setSensorData((current) => ({ ...current, supported: false, available: false }));
      return undefined;
    }

    setSensorData((current) => ({ ...current, supported: true }));
    sensorTimeout.current = window.setTimeout(() => {
      setSensorData((current) => ({ ...current, available: false }));
    }, 2500);

    const onOrientation = (event) => {
      if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
      const pitch = event.beta;
      const roll = event.gamma;
      const nextSensorData = {
        pitch,
        roll,
        supported: true,
        available: true,
        permissionGranted: true,
      };

      sensorDataRef.current = nextSensorData;
      setSensorData(nextSensorData);
      if (!sourceSelectionLocked.current) setSource('phone');
      setSourceMessage((current) =>
        current.includes('externer Sensor') ? current : '',
      );
      if (sensorTimeout.current !== null) {
        window.clearTimeout(sensorTimeout.current);
      }
      sensorTimeout.current = window.setTimeout(() => {
        setSensorData((current) => ({ ...current, available: false }));
        sensorTimeout.current = null;
      }, 2500);
    };

    window.addEventListener('deviceorientation', onOrientation, true);

    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
      if (sensorTimeout.current !== null) window.clearTimeout(sensorTimeout.current);
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

  const currentRoll =
    source === 'simulation'
      ? simulatedTilt.roll
      : source === 'phone' && sensorData.available
        ? sensorData.roll - calibration.roll
        : null;
  const currentPitch =
    source === 'simulation'
      ? simulatedTilt.pitch
      : source === 'phone' && sensorData.available
        ? sensorData.pitch - calibration.pitch
        : null;

  const recommendation = useMemo(() => {
    if (currentPitch === null || currentRoll === null) {
      return {
        axis: 'unavailable',
        title: source === 'external' ? 'Externer Sensor nicht verfügbar' : 'Kein Sensorsignal',
        description:
          source === 'external'
            ? 'Die externe Bluetooth-Verbindung ist noch nicht verfügbar.'
            : 'Wähle die Simulation oder warte auf ein Signal vom Smartphone-Sensor.',
        wheels: [],
        level: 0,
        requiredLiftCm: 0,
      };
    }

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
      const step = Math.max(0, wedgeHeights.indexOf(selectedLevel) + 1);

      return {
        axis: 'pitch',
        title: frontHigh ? 'Front is high' : 'Rear is high',
        description: frontHigh
          ? 'The front is higher than the rear. Place the wedges under the rear axle to lift the rear and bring the vehicle level.'
          : 'The rear is higher than the front. Place the wedges under the front axle to lift the front and bring the vehicle level.',
        wheels: targetAxle === 'rear' ? ['rear-left', 'rear-right'] : ['front-left', 'front-right'],
        level: selectedLevel,
        step,
        requiredLiftCm,
      };
    }

    const rightLow = currentRoll > 0;
    const targetSide = rightLow ? 'right' : 'left';
    const requiredLiftCm = (vehicle.trackWidthCm / 2) * Math.tan((rollAbs * Math.PI) / 180);
    const selectedLevel = chooseNearestHeight(wedgeHeights, requiredLiftCm);
    const step = Math.max(0, wedgeHeights.indexOf(selectedLevel) + 1);

    return {
      axis: 'roll',
      title: rightLow ? 'Right side is low' : 'Left side is low',
      description: rightLow
        ? 'The right side is lower than the left. Place wedges under the right-side wheels to lift the right side.'
        : 'The left side is lower than the right. Place wedges under the left-side wheels to lift the left side.',
      wheels: targetSide === 'right' ? ['front-right', 'rear-right'] : ['front-left', 'rear-left'],
      level: selectedLevel,
      step,
      requiredLiftCm,
    };
  }, [currentPitch, currentRoll, source, vehicle]);

  const startCalibrationHold = () => {
    if (calibrationTimeout.current !== null || !sensorData.available || source !== 'phone') return;

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
  const graphicTrackHalfWidth =
    35 + ((vehicle.trackWidthCm - 80) / (400 - 80)) * 8;
  const graphicAxleHalfSpacing =
    22 + ((vehicle.wheelbaseCm - 100) / (500 - 100)) * 12;
  const frontAxleY = 90 - graphicAxleHalfSpacing;
  const rearAxleY = 90 + graphicAxleHalfSpacing;

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

  const handleWedgeHeightChange = (index, value) => {
    setWedgeHeightInputs((current) =>
      current.map((height, heightIndex) => (heightIndex === index ? value : height)),
    );
  };

  const saveWedgeHeight = (index) => {
    const height = Number(wedgeHeightInputs[index].replace(',', '.'));
    if (!Number.isFinite(height) || height <= 0) {
      setWedgeHeightInputs(vehicle.wedgeHeightsCm.map(String));
      return;
    }

    const heights = vehicle.wedgeHeightsCm.map((current, heightIndex) =>
      heightIndex === index ? height : current,
    );
    heights.sort((a, b) => a - b);
    setVehicle((current) => ({ ...current, wedgeHeightsCm: heights }));
    setWedgeHeightInputs(heights.map(String));
  };

  const addWedgeHeight = () => {
    const highest = Math.max(...vehicle.wedgeHeightsCm);
    const heights = [...vehicle.wedgeHeightsCm, highest + 3].sort((a, b) => a - b);
    setVehicle((current) => ({ ...current, wedgeHeightsCm: heights }));
    setWedgeHeightInputs(heights.map(String));
  };

  const removeWedgeHeight = (index) => {
    if (vehicle.wedgeHeightsCm.length <= 1) return;
    const heights = vehicle.wedgeHeightsCm.filter((_, heightIndex) => heightIndex !== index);
    setVehicle((current) => ({ ...current, wedgeHeightsCm: heights }));
    setWedgeHeightInputs(heights.map(String));
  };

  const selectSource = async (nextSource) => {
    setSourceMessage('');
    if (nextSource === 'simulation') {
      sourceSelectionLocked.current = true;
      setSource(nextSource);
      return;
    }
    if (nextSource === 'external') {
      sourceSelectionLocked.current = true;
      setSource(nextSource);
      setSourceMessage('Kein externer Sensor verbunden. Die BLE-Anbindung ist noch nicht verfügbar.');
      return;
    }
    sourceSelectionLocked.current = true;
    setSource(nextSource);
    if (sensorData.available) {
      return;
    }
    if (!sensorData.supported) {
      setSourceMessage('Dieser Browser unterstützt keine Smartphone-Bewegungssensoren.');
      return;
    }

    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await window.DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          setSourceMessage('Der Zugriff auf den Smartphone-Sensor wurde nicht erlaubt.');
          return;
        }
        setSensorData((current) => ({ ...current, permissionGranted: true }));
      } catch (error) {
        setSourceMessage(`Sensorzugriff fehlgeschlagen: ${error.message}`);
        return;
      }
    } else {
      setSourceMessage('Kein Sensorsignal verfügbar. Prüfe Gerät, Browserberechtigung und HTTPS.');
      return;
    }

    setSourceMessage('Warte auf ein Signal vom Smartphone-Sensor …');
  };

  const startSimulationDrag = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      pitch: simulatedTilt.pitch,
      roll: simulatedTilt.roll,
    };
  };

  const updateSimulationDrag = (event) => {
    if (!dragStart.current) return;
    const scale = 0.18;
    setSimulatedTilt({
      pitch: clamp(dragStart.current.pitch + (dragStart.current.y - event.clientY) * scale, -12, 12),
      roll: clamp(dragStart.current.roll + (event.clientX - dragStart.current.x) * scale, -12, 12),
    });
  };

  const stopSimulationDrag = () => {
    dragStart.current = null;
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div>
            <p className="eyebrow">FIELD UNIT · 01</p>
            <h1>KEIL<span>OMAT</span></h1>
          </div>
        </div>
        <div className="source-picker" role="group" aria-label="Datenquelle auswählen">
          {[
            { id: 'simulation', icon: '◇', label: 'SIMULATION', available: true },
            {
              id: 'phone',
              icon: '▯',
              label: 'HANDY',
              available: sensorData.available,
            },
            { id: 'external', label: 'EXTERN', available: false },
          ].map((option) => (
            <button
              key={option.id}
              className={`source-option ${source === option.id ? 'selected' : ''} ${
                option.available ? '' : 'unavailable'
              }`}
              type="button"
              aria-pressed={source === option.id}
              aria-label={`${option.label}: ${
                option.available ? 'verfügbar' : 'nicht verfügbar'
              }`}
              onClick={() => selectSource(option.id)}
            >
              <span className="source-icon" aria-hidden="true">
                {option.id === 'external' ? (
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M7 7 17 17 12 22V2l5 5L7 17" />
                  </svg>
                ) : (
                  option.icon
                )}
              </span>
              <span>{option.label}</span>
              <span className="source-availability">
                {option.available ? (option.id === 'phone' ? 'LIVE' : 'BEREIT') : 'OFFLINE'}
              </span>
            </button>
          ))}
          {sourceMessage && <span className="source-message" role="status">{sourceMessage}</span>}
        </div>
      </header>

      <main className="main-screen">
        <div className="telemetry">
          <div className="telemetry-item">
            <span className="eyebrow">PITCH</span>
            <strong>            {currentPitch === null ? '—' : currentPitch.toFixed(1)}{currentPitch !== null && <small>°</small>}</strong>
          </div>
          <span className="telemetry-divider" />
          <div className="telemetry-item">
            <span className="eyebrow">ROLL</span>
            <strong>{currentRoll === null ? '—' : currentRoll.toFixed(1)}{currentRoll !== null && <small>°</small>}</strong>
          </div>
        </div>

        {source === 'simulation' && (
          <section className="simulator" aria-label="Neigung simulieren">
            <div className="simulator-heading">
              <span className="eyebrow">3D-SIMULATION</span>
              <span>Ziehen: ↑↓ Pitch · ←→ Roll · max. ±12°</span>
            </div>
            <div
              className="simulator-stage"
              role="application"
              aria-label="Wohnmobil mit Maus oder Touch ziehen. Vertikal steuert Pitch, horizontal Roll; Pfeiltasten ändern die Neigung in Ein-Grad-Schritten."
              onPointerDown={startSimulationDrag}
              onPointerMove={updateSimulationDrag}
              onPointerUp={stopSimulationDrag}
              onPointerCancel={stopSimulationDrag}
              onLostPointerCapture={stopSimulationDrag}
              onKeyDown={(event) => {
                const adjustments = {
                  ArrowUp: { pitch: 1, roll: 0 },
                  ArrowDown: { pitch: -1, roll: 0 },
                  ArrowRight: { pitch: 0, roll: 1 },
                  ArrowLeft: { pitch: 0, roll: -1 },
                };
                const adjustment = adjustments[event.key];
                if (!adjustment) return;
                event.preventDefault();
                setSimulatedTilt((current) => ({
                  pitch: clamp(current.pitch + adjustment.pitch, -12, 12),
                  roll: clamp(current.roll + adjustment.roll, -12, 12),
                }));
              }}
              tabIndex={0}
            >
              <div className="sim-view">
                <div
                  className="sim-vehicle"
                  style={{
                    transform: `rotateX(${simulatedTilt.pitch}deg) rotateY(${simulatedTilt.roll}deg)`,
                  }}
                >
                  <div className="sim-face sim-top" />
                  <div className="sim-face sim-bottom" />
                  <div className="sim-face sim-left" />
                  <div className="sim-face sim-right" />
                  <div className="sim-face sim-front" />
                  <div className="sim-face sim-rear" />
                </div>
              </div>
            </div>
            <div className="simulator-readout" aria-live="polite">
              <span>Pitch {simulatedTilt.pitch.toFixed(1)}°</span>
              <span>Roll {simulatedTilt.roll.toFixed(1)}°</span>
            </div>
          </section>
        )}

        <section className="hero-panel" aria-label="Leveling recommendation">
          <div className="hero-heading">
            <h2>{recommendation.title}</h2>
          </div>

          <div className="vehicle-diagram">
            <div className="diagram-heading">
              <span>TOP VIEW</span>
            </div>
            <svg
              className="vehicle-svg"
              viewBox="0 0 360 420"
              role="img"
              aria-labelledby="vehicle-diagram-title vehicle-diagram-description"
            >
              <title id="vehicle-diagram-title">Recommended wedge positions</title>
              <desc id="vehicle-diagram-description">
                {recommendation.axis === 'unavailable'
                  ? recommendation.description
                  : recommendation.axis === 'level'
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
                        ? `${wheel.label}: place wedge step ${recommendation.step} (${recommendation.level.toFixed(1)} cm) here`
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
                          {recommendation.step}
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
            <span>{recommendation.axis === 'level' || recommendation.axis === 'unavailable' ? 'STATUS' : 'RECOMMENDED STEP'}</span>
            <strong>
              {recommendation.axis === 'level'
                ? 'NO WEDGES NEEDED'
                : recommendation.axis === 'unavailable'
                  ? 'SOURCE UNAVAILABLE'
                  : `STEP ${recommendation.step}`}
            </strong>
            {recommendation.axis !== 'level' && recommendation.axis !== 'unavailable' && (
              <small>
                {recommendation.level.toFixed(1)} cm wedge · required lift ≈{' '}
                {recommendation.requiredLiftCm.toFixed(1)} cm
              </small>
            )}
          </div>
        </section>

        <div className="action-area">
          <button
            className={`calibrate-button ${isHoldingCalibration ? 'is-holding' : ''} ${
              calibrationComplete ? 'is-complete' : ''
            }`}
            type="button"
            disabled={source !== 'phone' || !sensorData.available}
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
            {source !== 'phone' || !sensorData.available
              ? 'Für die Kalibrierung Smartphone-Sensor auswählen und Signal abwarten.'
              : calibrationComplete
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
                <div className="settings-card vehicle-preview">
                  <span className="eyebrow">TOP VIEW · FAHRZEUGMASSE</span>
                  <svg
                    viewBox="0 0 220 165"
                    role="img"
                    aria-labelledby="vehicle-measurements-title vehicle-measurements-description"
                  >
                    <title id="vehicle-measurements-title">Radstand und Spurweite</title>
                    <desc id="vehicle-measurements-description">
                      Radstand {vehicle.wheelbaseCm} Zentimeter zwischen den Achsen und
                      Spurweite {vehicle.trackWidthCm} Zentimeter zwischen den Rädern.
                    </desc>
                    <text className="vehicle-dimension-label" x="110" y="13" textAnchor="middle">
                      SPURWEITE · {vehicle.trackWidthCm} CM
                    </text>
                    <line
                      className="vehicle-dimension"
                      x1={110 - graphicTrackHalfWidth}
                      y1="26"
                      x2={110 + graphicTrackHalfWidth}
                      y2="26"
                    />
                    <path
                      className="vehicle-dimension-arrow"
                      d={`M${104 - graphicTrackHalfWidth} 26 ${112 - graphicTrackHalfWidth} 22v8z M${
                        116 + graphicTrackHalfWidth
                      } 26 ${108 + graphicTrackHalfWidth} 22v8z`}
                    />
                    <rect className="vehicle-measurement-body" x="83" y="39" width="54" height="105" rx="18" />
                    <path className="vehicle-measurement-glass" d="M89 57 Q110 47 131 57 L128 75 Q110 81 92 75 Z" />
                    <path className="vehicle-measurement-roof" d="M92 83h42v35H92z" />
                    <path className="vehicle-measurement-glass" d="M92 125 Q110 119 128 125 L131 137 Q110 145 89 137 Z" />
                    <rect
                      className="vehicle-measurement-wheel"
                      x={104 - graphicTrackHalfWidth}
                      y={frontAxleY - 10}
                      width="12"
                      height="20"
                      rx="4"
                    />
                    <rect
                      className="vehicle-measurement-wheel"
                      x={104 + graphicTrackHalfWidth}
                      y={frontAxleY - 10}
                      width="12"
                      height="20"
                      rx="4"
                    />
                    <rect
                      className="vehicle-measurement-wheel"
                      x={104 - graphicTrackHalfWidth}
                      y={rearAxleY - 10}
                      width="12"
                      height="20"
                      rx="4"
                    />
                    <rect
                      className="vehicle-measurement-wheel"
                      x={104 + graphicTrackHalfWidth}
                      y={rearAxleY - 10}
                      width="12"
                      height="20"
                      rx="4"
                    />
                    <line
                      className="vehicle-dimension"
                      x1="48"
                      y1={frontAxleY}
                      x2="48"
                      y2={rearAxleY}
                    />
                    <path
                      className="vehicle-dimension-arrow"
                      d={`m48 ${frontAxleY - 7} -4 8h8z m48 ${rearAxleY + 7} -4-8h8z`}
                    />
                    <text
                      className="vehicle-dimension-label"
                      x="22"
                      y="98"
                      textAnchor="middle"
                      transform="rotate(-90 22 98)"
                    >
                      RADSTAND · {vehicle.wheelbaseCm} CM
                    </text>
                  </svg>
                </div>
              </div>
            ) : (
              <div className="menu-content">
                <div className="settings-card wedge-settings">
                  <div className="wedge-list">
                    {wedgeHeightInputs.map((height, index) => (
                      <label className="wedge-row" key={`wedge-${index}`}>
                        <span>STUFE {index + 1}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={height}
                          aria-label={`Höhe Stufe ${index + 1} in Zentimetern`}
                          onChange={(event) => handleWedgeHeightChange(index, event.target.value)}
                          onBlur={() => saveWedgeHeight(index)}
                        />
                        <span className="wedge-unit">CM</span>
                        <button
                          className="remove-wedge"
                          type="button"
                          aria-label={`Stufe ${index + 1} entfernen`}
                          disabled={wedgeHeightInputs.length <= 1}
                          onClick={() => removeWedgeHeight(index)}
                        >
                          −
                        </button>
                      </label>
                    ))}
                  </div>
                  <button className="add-wedge" type="button" onClick={addWedgeHeight}>
                    + STUFE HINZUFÜGEN
                  </button>
                  <p className="settings-hint">
                    Stufenhöhen in Zentimetern. Ungültige Eingaben werden verworfen; Änderungen werden auf diesem Gerät gespeichert.
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
