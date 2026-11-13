import { useEffect, useId, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'camper-leveling-demo-v1';
const SIMULATION_MAX_TILT = 30;
const SENSOR_STALE_TIMEOUT_MS = 10000;

const defaultVehicle = {
  wheelbaseCm: 240,
  trackWidthCm: 180,
  wedgeHeightsCm: [2.5, 5.5, 8.5],
};

const defaultCalibration = {
  pitch: 0,
  roll: 0,
};

const defaultCalibrations = {
  phone: defaultCalibration,
  external: defaultCalibration,
};

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

const getVehicleWheelPositions = ({ wheelbaseCm, trackWidthCm }) => {
  const trackHalfWidth = clamp(58 + ((trackWidthCm - 80) / 320) * 38, 58, 96);
  const axleHalfSpacing = clamp(60 + ((wheelbaseCm - 100) / 400) * 90, 60, 150);
  const frontY = 219 - axleHalfSpacing;
  const rearY = 219 + axleHalfSpacing;

  return [
    { id: 'front-left', label: 'Front left', x: 180 - trackHalfWidth - 17, y: frontY - 24, side: 'left' },
    { id: 'front-right', label: 'Front right', x: 180 + trackHalfWidth - 17, y: frontY - 24, side: 'right' },
    { id: 'rear-left', label: 'Rear left', x: 180 - trackHalfWidth - 17, y: rearY - 24, side: 'left' },
    { id: 'rear-right', label: 'Rear right', x: 180 + trackHalfWidth - 17, y: rearY - 24, side: 'right' },
  ];
};

function VehicleDiagram({ className, vehicle, recommendation, showMeasurements = false }) {
  const id = useId();
  const wheels = getVehicleWheelPositions(vehicle);
  const frontAxleY = wheels[0].y + 24;
  const rearAxleY = wheels[2].y + 24;
  const leftWheelCenterX = wheels[0].x + 17;
  const rightWheelCenterX = wheels[1].x + 17;

  return (
    <svg
      className={className}
      viewBox="0 0 360 420"
      role="img"
      aria-labelledby={`${id}-title ${id}-description`}
    >
      <title id={`${id}-title`}>Vehicle top view and wheel positions</title>
      <desc id={`${id}-description`}>
        {showMeasurements
          ? `Wheelbase ${vehicle.wheelbaseCm} centimeters and track width ${vehicle.trackWidthCm} centimeters.`
          : recommendation?.axis === 'unavailable'
            ? recommendation.description
            : recommendation?.axis === 'level'
              ? 'The vehicle is level; no wedges are needed.'
              : `Place ${recommendation?.level.toFixed(1)} centimeter wedges at ${recommendation?.wheels
                  .map((wheel) => wheels.find((position) => position.id === wheel)?.label)
                  .join(' and ')}.`}
      </desc>

      <rect className="vehicle-body" x="116" y="25" width="128" height="370" rx="45" />
      <path className="vehicle-glass" d="M130 80 Q180 52 230 80 L222 130 Q180 143 138 130 Z" />
      <path className="vehicle-roof" d="M133 147 Q180 136 227 147 L227 272 Q180 284 133 272 Z" />
      <path className="vehicle-glass" d="M138 289 Q180 278 222 289 L230 337 Q180 360 130 337 Z" />
      <line className="vehicle-seam" x1="124" y1="279" x2="236" y2="279" />

      {wheels.map((wheel) => {
        const active = Boolean(
          recommendation &&
            recommendation.axis !== 'level' &&
            recommendation.axis !== 'unavailable' &&
            recommendation.wheels.includes(wheel.id),
        );
        const labelX =
          wheel.side === 'left'
            ? Math.max(4, wheel.x - 60)
            : Math.min(316, wheel.x + 56);
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
                  width="40"
                  height="24"
                  rx="12"
                />
                <text className="diagram-height" x={labelX + 20} y={wheel.y + 28} textAnchor="middle">
                  {recommendation.step}
                </text>
              </>
            )}
          </g>
        );
      })}

      {showMeasurements && (
        <g className="vehicle-measurements">
          <text className="vehicle-dimension-label" x="180" y="58" textAnchor="middle">
            TRACK WIDTH · {vehicle.trackWidthCm} CM
          </text>
          <line
            className="vehicle-dimension"
            x1={leftWheelCenterX}
            y1="68"
            x2={rightWheelCenterX}
            y2="68"
          />
          <path
            className="vehicle-dimension-arrow"
            d={`M${leftWheelCenterX - 6} 68 ${leftWheelCenterX + 2} 64v8z M${
              rightWheelCenterX + 6
            } 68 ${rightWheelCenterX - 2} 64v8z`}
          />
          <line
            className="vehicle-dimension"
            x1="44"
            y1={frontAxleY}
            x2="44"
            y2={rearAxleY}
          />
          <path
            className="vehicle-dimension-arrow"
            d={`M44 ${frontAxleY - 7} l-4 8h8z M44 ${rearAxleY + 7} l-4-8h8z`}
          />
          <text
            className="vehicle-dimension-label"
            x="22"
            y={(frontAxleY + rearAxleY) / 2}
            textAnchor="middle"
            transform={`rotate(-90 22 ${(frontAxleY + rearAxleY) / 2})`}
          >
            WHEELBASE · {vehicle.wheelbaseCm} CM
          </text>
        </g>
      )}

    </svg>
  );
}

function App() {
  const loadedState = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        calibrations: defaultCalibrations,
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
        calibrations: {
          phone: {
            pitch: Number(
              parsed.calibrations?.phone?.pitch ??
                parsed.calibration?.pitch ??
                defaultCalibration.pitch,
            ),
            roll: Number(
              parsed.calibrations?.phone?.roll ??
                parsed.calibration?.roll ??
                defaultCalibration.roll,
            ),
          },
          external: {
            pitch: Number(parsed.calibrations?.external?.pitch ?? defaultCalibration.pitch),
            roll: Number(parsed.calibrations?.external?.roll ?? defaultCalibration.roll),
          },
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
        calibrations: defaultCalibrations,
        vehicle: defaultVehicle,
      };
    }
  }, []);

  const [calibrations, setCalibrations] = useState(loadedState.calibrations);
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
        calibrations,
        calibration: calibrations.phone,
        vehicle,
      }),
    );
  }, [calibrations, vehicle]);

  useEffect(() => {
    const hasSensorAPI = 'DeviceOrientationEvent' in window;
    if (!hasSensorAPI) {
      setSensorData((current) => ({ ...current, supported: false, available: false }));
      return undefined;
    }

    setSensorData((current) => ({ ...current, supported: true }));
    sensorTimeout.current = window.setTimeout(() => {
      setSensorData((current) => ({ ...current, available: false }));
      sensorTimeout.current = null;
    }, SENSOR_STALE_TIMEOUT_MS);

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
        current.toLowerCase().includes('external sensor') ? current : '',
      );
      if (sensorTimeout.current !== null) {
        window.clearTimeout(sensorTimeout.current);
      }
      sensorTimeout.current = window.setTimeout(() => {
        setSensorData((current) => ({ ...current, available: false }));
        setSourceMessage((current) =>
          current.startsWith('Waiting for a signal')
            ? 'Phone sensor signal lost. Check the device and browser permission.'
            : current,
        );
        sensorTimeout.current = null;
      }, SENSOR_STALE_TIMEOUT_MS);
    };

    window.addEventListener('deviceorientation', onOrientation, true);

    return () => {
      window.removeEventListener('deviceorientation', onOrientation, true);
      if (sensorTimeout.current !== null) window.clearTimeout(sensorTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (!activeMenu) return undefined;

    const scrollPosition = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setActiveMenu(null);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, scrollPosition);
    };
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
        ? sensorData.roll - calibrations.phone.roll
        : null;
  const currentPitch =
    source === 'simulation'
      ? simulatedTilt.pitch
      : source === 'phone' && sensorData.available
        ? sensorData.pitch - calibrations.phone.pitch
        : null;

  const recommendation = useMemo(() => {
    if (currentPitch === null || currentRoll === null) {
      return {
        axis: 'unavailable',
        title: source === 'external' ? 'External sensor unavailable' : 'No sensor signal',
        description:
          source === 'external'
            ? 'The external Bluetooth connection is not available yet.'
            : 'Choose simulation or wait for a signal from the phone sensor.',
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
      setCalibrations((current) => ({
        ...current,
        phone: {
          pitch: sensorDataRef.current.pitch,
          roll: sensorDataRef.current.roll,
        },
      }));
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
      setSourceMessage('No external sensor is connected. Bluetooth support is not available yet.');
      return;
    }
    sourceSelectionLocked.current = true;
    setSource(nextSource);
    if (sensorData.available) {
      return;
    }
    if (!sensorData.supported) {
      setSourceMessage('This browser does not support phone motion sensors.');
      return;
    }

    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await window.DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          setSourceMessage('Phone sensor access was not allowed.');
          return;
        }
        setSensorData((current) => ({ ...current, permissionGranted: true }));
      } catch (error) {
        setSourceMessage(`Sensor access failed: ${error.message}`);
        return;
      }
    } else {
      setSourceMessage('No sensor signal available. Check the device, browser permission, and HTTPS.');
      return;
    }

    setSourceMessage('Waiting for a signal from the phone sensor…');
    if (sensorTimeout.current !== null) window.clearTimeout(sensorTimeout.current);
    sensorTimeout.current = window.setTimeout(() => {
      setSensorData((current) => ({ ...current, available: false }));
      setSourceMessage((current) =>
        current.startsWith('Waiting for a signal')
          ? 'No signal was received from the phone sensor.'
          : current,
      );
      sensorTimeout.current = null;
    }, SENSOR_STALE_TIMEOUT_MS);
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
      pitch: clamp(
        dragStart.current.pitch + (dragStart.current.y - event.clientY) * scale,
        -SIMULATION_MAX_TILT,
        SIMULATION_MAX_TILT,
      ),
      roll: clamp(
        dragStart.current.roll + (event.clientX - dragStart.current.x) * scale,
        -SIMULATION_MAX_TILT,
        SIMULATION_MAX_TILT,
      ),
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
        <div className="source-picker" role="group" aria-label="Select data source">
          {[
            { id: 'simulation', icon: '◇', label: 'SIMULATION', available: true },
            {
              id: 'phone',
              icon: '▯',
              label: 'PHONE',
              available: sensorData.available,
            },
            { id: 'external', label: 'EXTERNAL', available: false },
          ].map((option) => (
            <button
              key={option.id}
              className={`source-option ${source === option.id ? 'selected' : ''} ${
                option.available ? '' : 'unavailable'
              }`}
              type="button"
              aria-pressed={source === option.id}
              aria-label={`${option.label}: ${option.available ? 'available' : 'unavailable'}`}
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
                {option.available ? (option.id === 'phone' ? 'LIVE' : 'READY') : 'OFFLINE'}
              </span>
            </button>
          ))}
          {sourceMessage && (
            <span className="source-message" role="status">
              {sourceMessage}
            </span>
          )}
        </div>
      </header>

      <main className="main-screen">
        <div className="telemetry">
          <div className="telemetry-item">
            <span className="eyebrow">PITCH</span>
            <strong>
              {currentPitch === null ? '—' : currentPitch.toFixed(1)}
              {currentPitch !== null && <small>°</small>}
            </strong>
          </div>
          <span className="telemetry-divider" />
          <div className="telemetry-item">
            <span className="eyebrow">ROLL</span>
            <strong>
              {currentRoll === null ? '—' : currentRoll.toFixed(1)}
              {currentRoll !== null && <small>°</small>}
            </strong>
          </div>
        </div>

        {source === 'simulation' && (
          <section className="simulator" aria-label="Simulate vehicle tilt">
            <div className="simulator-heading">
              <span className="eyebrow">3D SIMULATION</span>
              <span>Drag: ↑↓ Pitch · ←→ Roll · max. ±{SIMULATION_MAX_TILT}°</span>
            </div>
            <div
              className="simulator-stage"
              role="application"
              aria-label="Drag the vehicle with a mouse or touch. Vertical movement controls pitch, horizontal movement controls roll. Arrow keys adjust tilt in one-degree steps."
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
                  pitch: clamp(
                    current.pitch + adjustment.pitch,
                    -SIMULATION_MAX_TILT,
                    SIMULATION_MAX_TILT,
                  ),
                  roll: clamp(
                    current.roll + adjustment.roll,
                    -SIMULATION_MAX_TILT,
                    SIMULATION_MAX_TILT,
                  ),
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
                  <span className="sim-wheel sim-wheel-left-front" />
                  <span className="sim-wheel sim-wheel-left-rear" />
                  <span className="sim-wheel sim-wheel-right-front" />
                  <span className="sim-wheel sim-wheel-right-rear" />
                  <div className="sim-cabin">
                    <div className="sim-cabin-face sim-cabin-roof" />
                    <div className="sim-cabin-face sim-cabin-bottom" />
                    <div className="sim-cabin-face sim-cabin-left" />
                    <div className="sim-cabin-face sim-cabin-right" />
                    <div className="sim-cabin-face sim-cabin-front" />
                    <div className="sim-cabin-face sim-cabin-rear" />
                  </div>
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
            <VehicleDiagram
              className="vehicle-svg"
              vehicle={vehicle}
              recommendation={recommendation}
            />
          </div>

          <div className={`level-readout ${recommendation.axis === 'level' ? 'is-level' : ''}`}>
            <span>
              {recommendation.axis === 'level' || recommendation.axis === 'unavailable'
                ? 'STATUS'
                : 'RECOMMENDED STEP'}
            </span>
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
              ? 'Select the phone sensor and wait for a signal to calibrate.'
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
                  <span className="eyebrow">VEHICLE DIMENSIONS · TOP VIEW</span>
                  <VehicleDiagram
                    className="vehicle-svg"
                    vehicle={vehicle}
                    showMeasurements
                  />
                </div>
              </div>
            ) : (
              <div className="menu-content">
                <div className="settings-card wedge-settings">
                  <div className="wedge-illustration">
                    <svg viewBox="0 0 220 110" role="img" aria-labelledby="wedge-example-title">
                      <title id="wedge-example-title">
                        Three example wedge levels with a wheel resting on the highest step
                      </title>
                      <path className="wedge-example-body" d="M24 96H54V78H90V60H126V42H180V96Z" />
                      <path className="wedge-example-seams" d="M54 96V78H90V60H126V42H180" />
                      <text className="wedge-example-label" x="38" y="91">
                        {vehicle.wedgeHeightsCm[0]?.toFixed(1) ?? '—'}
                      </text>
                      <text className="wedge-example-label" x="72" y="73">
                        {vehicle.wedgeHeightsCm[1]?.toFixed(1) ?? '—'}
                      </text>
                      <text className="wedge-example-label" x="108" y="55">
                        {vehicle.wedgeHeightsCm[2]?.toFixed(1) ?? '—'}
                      </text>
                      <circle className="wedge-example-wheel" cx="180" cy="22" r="20" />
                      <circle className="wedge-example-hub" cx="180" cy="22" r="7" />
                    </svg>
                    <span>Example step heights in cm · wheel shown on the highest step</span>
                  </div>
                  <div className="wedge-list">
                    {wedgeHeightInputs.map((height, index) => (
                      <label className="wedge-row" key={`wedge-${index}`}>
                        <span>STEP {index + 1}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={height}
                          aria-label={`Height of step ${index + 1} in centimeters`}
                          onChange={(event) => handleWedgeHeightChange(index, event.target.value)}
                          onBlur={() => saveWedgeHeight(index)}
                        />
                        <span className="wedge-unit">CM</span>
                        <button
                          className="remove-wedge"
                          type="button"
                          aria-label={`Remove step ${index + 1}`}
                          disabled={wedgeHeightInputs.length <= 1}
                          onClick={() => removeWedgeHeight(index)}
                        >
                          −
                        </button>
                      </label>
                    ))}
                  </div>
                  <button className="add-wedge" type="button" onClick={addWedgeHeight}>
                    + ADD STEP
                  </button>
                  <p className="settings-hint">
                    Wedge step heights in centimeters. Invalid entries are discarded; changes are saved on this device.
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
