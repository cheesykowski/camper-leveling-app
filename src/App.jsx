import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  calibrationSlotIds as calibrationSlotKeys,
  defaultCalibration,
  defaultCalibrationSlotIds,
  defaultCalibrationSlots,
  getActiveCalibration,
  getTrimmedMean,
  normalizeCalibrationSlotIds,
  normalizeCalibrationSlots,
  replaceCalibrationSlotOffsets,
} from './calibration.js';
import { calculateTwoWedgePlan, wheelCorners } from './leveling.js';

const STORAGE_KEY = 'camper-leveling-demo-v1';
const SIMULATION_MAX_TILT = 30;
const SENSOR_STALE_TIMEOUT_MS = 10000;
const FORMSPREE_ENDPOINT = import.meta.env.VITE_FORMSPREE_ENDPOINT?.trim() || '';

const formatCalibrationAngle = (angle) => `${angle >= 0 ? '+' : ''}${angle.toFixed(1)}°`;

const defaultVehicle = {
  wheelbaseCm: 240,
  trackWidthCm: 180,
  wedgeHeightsCm: [3, 6, 9],
};

const vehicleDimensionLimits = {
  wheelbaseCm: { min: 100, max: 500 },
  trackWidthCm: { min: 80, max: 400 },
};

const calibrationSourceLabels = {
  simulation: 'Simulation',
  phone: 'Phone sensor',
  external: 'External sensor',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getVehicleWheelPositions = ({ wheelbaseCm, trackWidthCm }) => {
  const trackHalfWidth = clamp(66 + ((trackWidthCm - 80) / 320) * 10, 66, 76);
  const axleHalfSpacing = clamp(
    60 + ((wheelbaseCm - 100) / 400) * 90,
    60,
    157,
  );
  const frontY = 219 - axleHalfSpacing;
  const rearY = 219 + axleHalfSpacing;

  return wheelCorners.map((wheel) => ({
    ...wheel,
    x: 180 + (wheel.side === 'left' ? -trackHalfWidth : trackHalfWidth) - 17,
    y: (wheel.axle === 'front' ? frontY : rearY) - 24,
  }));
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
      viewBox={showMeasurements ? '0 0 360 470' : '0 0 360 420'}
      role="img"
      aria-labelledby={`${id}-title ${id}-description`}
    >
      <title id={`${id}-title`}>Vehicle top view and wheel positions</title>
      <desc id={`${id}-description`}>
        {showMeasurements
          ? `Wheelbase ${vehicle.wheelbaseCm} centimeters and track width ${vehicle.trackWidthCm} centimeters.`
          : recommendation?.description}
      </desc>

      <rect className="vehicle-body" x="116" y="25" width="128" height="370" rx="45" />
      <path className="vehicle-glass" d="M130 80 Q180 52 230 80 L222 130 Q180 143 138 130 Z" />
      <path className="vehicle-roof" d="M133 147 Q180 136 227 147 L227 272 Q180 284 133 272 Z" />
      <path className="vehicle-glass" d="M138 289 Q180 278 222 289 L230 337 Q180 360 130 337 Z" />
      <text className="diagram-axle-label" x="180" y="20" textAnchor="middle">
        FRONT ↑
      </text>
      <text className="diagram-axle-label" x="180" y="413" textAnchor="middle">
        REAR ↓
      </text>

      {wheels.map((wheel) => {
        const placement = recommendation?.wedgePlacements?.find((item) => item.id === wheel.id);
        const active = Boolean(placement && (placement.step > 0 || placement.wedgeCapacityExceeded));
        const labelX = wheel.side === 'left' ? 8 : 292;
        const wedgePoints =
          wheel.side === 'left'
            ? `${wheel.x - 19},${wheel.y + 24} ${wheel.x},${wheel.y + 16} ${wheel.x},${wheel.y + 36}`
            : `${wheel.x + 53},${wheel.y + 24} ${wheel.x + 34},${wheel.y + 16} ${wheel.x + 34},${wheel.y + 36}`;

        return (
          <g key={wheel.id} className={active ? 'diagram-wheel active' : 'diagram-wheel'}>
            <title>
              {active
                ? `${wheel.label}: step ${placement.step}${
                    placement.wedgeCapacityExceeded ? ', required lift exceeds wedge capacity' : ''
                  }`
                : `${wheel.label}: no wedge recommended`}
            </title>
            <rect className="diagram-tire" x={wheel.x} y={wheel.y} width="34" height="48" rx="10" />
            {active && (
              <>
                <polygon
                  className={`diagram-wedge${placement.wedgeCapacityExceeded ? ' capacity-exceeded' : ''}`}
                  points={wedgePoints}
                />
                <rect
                  className={`diagram-height-bg${placement.wedgeCapacityExceeded ? ' capacity-exceeded' : ''}`}
                  x={labelX}
                  y={wheel.y + 12}
                  width="60"
                  height="24"
                  rx="12"
                />
                <text
                  className={`diagram-height${placement.wedgeCapacityExceeded ? ' capacity-exceeded' : ''}`}
                  x={labelX + 30}
                  y={wheel.y + 28}
                  textAnchor="middle"
                >
                  STEP {placement.step}
                </text>
              </>
            )}
          </g>
        );
      })}

      {showMeasurements && (
        <g className="vehicle-measurements">
          <line
            className="vehicle-dimension"
            x1={leftWheelCenterX}
            y1="436"
            x2={rightWheelCenterX}
            y2="436"
          />
          <path
            className="vehicle-dimension-arrow"
            d={`M${leftWheelCenterX - 6} 436 ${leftWheelCenterX + 2} 432v8z M${
              rightWheelCenterX + 6
            } 436 ${rightWheelCenterX - 2} 432v8z`}
          />
          <text
            className="vehicle-dimension-label"
            x="180"
            y="459"
            textAnchor="middle"
          >
            TRACK WIDTH
          </text>
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
            WHEELBASE
          </text>
        </g>
      )}

    </svg>
  );
}

function FeedbackForm({ endpoint }) {
  const [feedback, setFeedback] = useState({
    name: '',
    category: '',
    device: '',
    message: '',
    consent: false,
  });
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, type, value, checked } = event.target;
    setFeedback((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setStatus({ type: 'idle', message: '' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!endpoint) return;

    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        setStatus({
          type: 'error',
          message: `Feedback could not be sent (HTTP ${response.status}). Please try again later.`,
        });
        return;
      }

      setFeedback({ name: '', category: '', device: '', message: '', consent: false });
      setStatus({ type: 'success', message: 'Thanks — your feedback was sent.' });
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      setStatus({
        type: 'error',
        message: 'Could not reach the feedback service. Check your connection and try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!endpoint) {
    return (
      <div className="feedback-unconfigured" role="status">
        <span className="eyebrow">FORM NOT CONNECTED</span>
        <p>Feedback is not available yet. Please try again later.</p>
      </div>
    );
  }

  return (
    <form className="feedback-form" onSubmit={handleSubmit}>
      <input type="hidden" name="_subject" value="KEILOMAT friend beta feedback" />
      <label className="feedback-honeypot" aria-hidden="true">
        Leave this empty
        <input name="_gotcha" type="text" tabIndex="-1" autoComplete="off" />
      </label>
      <label className="feedback-field">
        <span>
          Your name <small>OPTIONAL</small>
        </span>
        <input
          name="name"
          type="text"
          autoComplete="name"
          maxLength={80}
          value={feedback.name}
          onChange={handleChange}
        />
      </label>
      <div className="feedback-meta-fields">
        <label className="feedback-field">
          <span>Category</span>
          <select name="category" required value={feedback.category} onChange={handleChange}>
            <option value="" disabled>
              Choose one
            </option>
            <option value="bug">Something did not work</option>
            <option value="usability">Something was unclear</option>
            <option value="idea">I have an idea</option>
            <option value="other">Other feedback</option>
          </select>
        </label>
        <label className="feedback-field">
          <span>
            Device <small>OPTIONAL</small>
          </span>
          <select name="device" value={feedback.device} onChange={handleChange}>
            <option value="">Choose one</option>
            <option value="smartphone">Smartphone</option>
            <option value="tablet">Tablet</option>
            <option value="laptop">Laptop</option>
            <option value="desktop">Desktop computer</option>
            <option value="other">Other / not listed</option>
          </select>
        </label>
      </div>
      <label className="feedback-field">
        <span>What would you like to share?</span>
        <textarea
          name="message"
          required
          maxLength={3000}
          rows={5}
          value={feedback.message}
          onChange={handleChange}
          placeholder="What were you trying to do? What felt unclear or could be better?"
        />
        <small className="feedback-count">{feedback.message.length}/3000</small>
      </label>
      <label className="feedback-consent">
        <input
          name="consent"
          type="checkbox"
          value="yes"
          required
          checked={feedback.consent}
          onChange={handleChange}
        />
        <span>
          I agree to send this feedback to the app owner by email and store it in their Formspree
          account. Only anonymized, reviewed takeaways may be added to the public repository. Please
          do not include sensitive personal information.
        </span>
      </label>
      {status.message && (
        <p
          className={`feedback-status ${status.type}`}
          role={status.type === 'error' ? 'alert' : 'status'}
        >
          {status.message}
        </p>
      )}
      <button className="feedback-submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'SENDING…' : 'SEND FEEDBACK'}
      </button>
    </form>
  );
}

function App() {
  const loadedState = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        calibrationSlots: defaultCalibrationSlots,
        calibrationSlotIds: defaultCalibrationSlotIds,
        vehicle: defaultVehicle,
      };
    }

    try {
      const parsed = JSON.parse(raw);
      const savedWedgeHeights = Array.isArray(parsed.vehicle?.wedgeHeightsCm)
        ? parsed.vehicle.wedgeHeightsCm
            .map(Number)
            .filter((height) => Number.isFinite(height) && height > 0)
            .sort((a, b) => a - b)
        : [];
      const calibrations = {
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
      };
      const calibrationSlots = normalizeCalibrationSlots(
        parsed.calibrationSlots,
        calibrations,
        parsed.calibrationProfiles,
        parsed.calibrationProfileIds,
      );
      return {
        calibrationSlots,
        calibrationSlotIds: normalizeCalibrationSlotIds(parsed.calibrationSlotIds),
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
        calibrationSlots: defaultCalibrationSlots,
        calibrationSlotIds: defaultCalibrationSlotIds,
        vehicle: defaultVehicle,
      };
    }
  }, []);

  const [calibrationSlots, setCalibrationSlots] = useState(
    loadedState.calibrationSlots,
  );
  const [calibrationSlotIds, setCalibrationSlotIds] = useState(
    loadedState.calibrationSlotIds,
  );
  const [calibrationSettingsSource, setCalibrationSettingsSource] = useState('phone');
  const [vehicle, setVehicle] = useState(loadedState.vehicle);
  const [vehicleInputs, setVehicleInputs] = useState({
    wheelbaseCm: String(loadedState.vehicle.wheelbaseCm),
    trackWidthCm: String(loadedState.vehicle.trackWidthCm),
  });
  const [vehicleInputErrors, setVehicleInputErrors] = useState({});
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
  const simulatedTiltRef = useRef(simulatedTilt);
  const [source, setSource] = useState('simulation');
  const [sourceMessage, setSourceMessage] = useState('');
  const sourceSelectionLocked = useRef(false);
  const dragStart = useRef(null);
  const sensorTimeout = useRef(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [isHoldingCalibration, setIsHoldingCalibration] = useState(false);
  const [calibrationComplete, setCalibrationComplete] = useState(false);
  const calibrationTimeout = useRef(null);
  const calibrationSamples = useRef([]);
  const calibrationCaptureSource = useRef(null);

  useEffect(() => {
    simulatedTiltRef.current = simulatedTilt;
  }, [simulatedTilt]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        calibrationSlots,
        calibrationSlotIds,
        vehicle,
      }),
    );
  }, [calibrationSlots, calibrationSlotIds, vehicle]);

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
      if (calibrationCaptureSource.current === 'phone') {
        calibrationSamples.current.push({ pitch, roll });
      }
      const nextSensorData = {
        pitch,
        roll,
        supported: true,
        available: true,
        permissionGranted: true,
      };

      sensorDataRef.current = nextSensorData;
      setSensorData(nextSensorData);
      if (!sourceSelectionLocked.current && calibrationCaptureSource.current !== 'simulation') {
        setSource('phone');
      }
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

  const activeCalibration = getActiveCalibration(source, calibrationSlots, calibrationSlotIds);
  const currentRoll =
    source === 'simulation'
      ? simulatedTilt.roll - activeCalibration.roll
      : source === 'phone' && sensorData.available
        ? sensorData.roll - activeCalibration.roll
        : null;
  const currentPitch =
    source === 'simulation'
      ? simulatedTilt.pitch - activeCalibration.pitch
      : source === 'phone' && sensorData.available
        ? sensorData.pitch - activeCalibration.pitch
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
        wedgePlacements: [],
      };
    }

    const pitchAbs = Math.abs(currentPitch);
    const rollAbs = Math.abs(currentRoll);

    if (pitchAbs < 0.2 && rollAbs < 0.2) {
      return {
        axis: 'level',
        title: 'Vehicle is level',
        description: 'The app is within the target tolerance. No wedge adjustment needed right now.',
        wedgePlacements: [],
      };
    }

    const plan = calculateTwoWedgePlan({
      pitchDegrees: currentPitch,
      rollDegrees: currentRoll,
      wheelbaseCm: vehicle.wheelbaseCm,
      trackWidthCm: vehicle.trackWidthCm,
      wedgeHeightsCm: vehicle.wedgeHeightsCm,
    });
    const title =
      plan.dominantAxis === 'pitch'
        ? `${plan.highAxle === 'front' ? 'Front' : 'Rear'} is high`
        : `${plan.highSide === 'left' ? 'Left' : 'Right'} side is high`;
    const placementSummary = plan.wedgePlacements
      .map(({ label, step, wedgeCapacityExceeded }) =>
        `${label}: ${step > 0 ? `step ${step}` : 'no wedge'}${
          wedgeCapacityExceeded ? ', required lift exceeds wedge capacity' : ''
        }`,
      )
      .join(' · ');

    return {
      axis: plan.dominantAxis,
      title,
      description: `${plan.dominantAxis === 'pitch' ? 'Pitch' : 'Roll'} dominant · ${placementSummary}`,
      ...plan,
    };
  }, [currentPitch, currentRoll, source, vehicle]);

  const startCalibrationHold = () => {
    if (
      calibrationTimeout.current !== null ||
      (source !== 'simulation' && (source !== 'phone' || !sensorData.available))
    ) return;

    setCalibrationComplete(false);
    setIsHoldingCalibration(true);
    const selectedSource = source;
    const selectedSlotId = calibrationSlotIds[selectedSource];
    calibrationCaptureSource.current = selectedSource;
    calibrationSamples.current = selectedSource === 'phone'
      ? [{ pitch: sensorDataRef.current.pitch, roll: sensorDataRef.current.roll }]
      : [];
    calibrationTimeout.current = window.setTimeout(() => {
      const { pitch, roll } = selectedSource === 'simulation'
        ? simulatedTiltRef.current
        : {
            pitch: getTrimmedMean(calibrationSamples.current.map((sample) => sample.pitch)),
            roll: getTrimmedMean(calibrationSamples.current.map((sample) => sample.roll)),
          };
      setCalibrationSlots((current) => ({
        ...current,
        [selectedSource]: replaceCalibrationSlotOffsets(current[selectedSource], selectedSlotId, {
          pitch,
          roll,
        }),
      }));
      calibrationSamples.current = [];
      calibrationCaptureSource.current = null;
      calibrationTimeout.current = null;
      setIsHoldingCalibration(false);
      setCalibrationComplete(true);
    }, 3000);
  };

  const cancelCalibrationHold = () => {
    if (calibrationTimeout.current !== null) {
      window.clearTimeout(calibrationTimeout.current);
      calibrationTimeout.current = null;
      calibrationSamples.current = [];
      calibrationCaptureSource.current = null;
      setIsHoldingCalibration(false);
    }
  };

  useEffect(() => {
    if (!sensorData.available && calibrationCaptureSource.current === 'phone') {
      cancelCalibrationHold();
    }
  }, [sensorData.available]);

  const updateCalibrationSlotName = (sourceName, slotId, name) => {
    setCalibrationSlots((current) => ({
      ...current,
      [sourceName]: current[sourceName].map((slot) =>
        slot.id === slotId ? { ...slot, name: name.slice(0, 60) } : slot,
      ),
    }));
  };

  const sortedWedgeHeights = [...vehicle.wedgeHeightsCm].sort((a, b) => a - b);
  const calibrationSlotSource = source;
  const activeSlotId = calibrationSlotIds[calibrationSlotSource];
  const activeSlot = calibrationSlots[calibrationSlotSource].find((slot) => slot.id === activeSlotId);
  const activeSlotLabel = activeSlot?.name.trim() || String(calibrationSlotKeys.indexOf(activeSlotId) + 1);
  const noCalibratedSlots = !calibrationSlots[calibrationSlotSource].some(
    (slot) => slot.pitch !== null && slot.roll !== null,
  );
  const additionalInfo = [
    recommendation.axis === 'unavailable' ? sourceMessage || recommendation.description : '',
    recommendation.wedgeCapacityExceeded ? 'Required lift exceeds wedge capacity.' : '',
    noCalibratedSlots ? 'No calibration slot has been set.' : '',
  ].filter(Boolean).join(' ') || (recommendation.axis === 'level' ? recommendation.description : '');
  const wedgeIllustrationHeights = [
    sortedWedgeHeights[sortedWedgeHeights.length - 1],
    sortedWedgeHeights[Math.floor((sortedWedgeHeights.length - 1) / 2)],
    sortedWedgeHeights[0],
  ];
  const handleVehicleDimensionChange = (event, dimension) => {
    const value = event.target.value;
    const { min, max } = vehicleDimensionLimits[dimension];
    setVehicleInputs((current) => ({ ...current, [dimension]: value }));
    setVehicleInputErrors((current) => ({ ...current, [dimension]: '' }));

    const parsedValue = Number(value);
    if (value !== '' && Number.isFinite(parsedValue) && parsedValue >= min && parsedValue <= max) {
      setVehicle((current) => ({ ...current, [dimension]: parsedValue }));
    }
  };

  const saveVehicleDimension = (dimension) => {
    const { min, max } = vehicleDimensionLimits[dimension];
    const value = vehicleInputs[dimension];
    const parsedValue = Number(value);
    if (
      value.trim() === '' ||
      !Number.isFinite(parsedValue) ||
      parsedValue < min ||
      parsedValue > max
    ) {
      setVehicleInputErrors((current) => ({
        ...current,
        [dimension]: `Enter a value between ${min} and ${max} cm.`,
      }));
      return;
    }

    setVehicle((current) => ({ ...current, [dimension]: parsedValue }));
    setVehicleInputs((current) => ({ ...current, [dimension]: String(parsedValue) }));
    setVehicleInputErrors((current) => ({ ...current, [dimension]: '' }));
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
    dragStart.current = null;
    cancelCalibrationHold();
    setCalibrationComplete(false);
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
      setSourceMessage('Check the device, browser permission, and HTTPS.');
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
                ) : option.id === 'phone' ? (
                  <svg viewBox="0 0 24 24" role="presentation">
                    <rect x="6.5" y="2.5" width="11" height="19" rx="2" />
                    <path d="M10 5h4M10 18.5h4" />
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

        <section className="hero-panel" aria-label="Leveling recommendation">
          <div className="hero-heading">
            <h2 className={recommendation.axis === 'unavailable' ? 'sensor-unavailable' : ''}>
              {recommendation.title}
            </h2>
            {additionalInfo && (
              <p className="hero-description" role="status">
                {additionalInfo}
              </p>
            )}
          </div>

          <div className="vehicle-diagram">
            <div className="diagram-heading">
              <span>TOP VIEW</span>
              {source === 'simulation' && (
                <div
                  className={`simulator-stage${vehicle.wheelbaseCm > 300 ? ' long-wheelbase' : ''}`}
                  role="application"
                  aria-label={`Simulate vehicle tilt. Drag vertically for pitch and horizontally for roll, or use the arrow keys. Calibrated pitch ${currentPitch.toFixed(1)} degrees, roll ${currentRoll.toFixed(1)} degrees. Simulated sensor range is ±${SIMULATION_MAX_TILT} degrees.`}
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
                  <svg className="simulator-arrows" viewBox="0 0 100 80" aria-hidden="true">
                    <path d="M17 51C8 42 13 27 25 22M20 20l5 2-1 5" />
                    <path d="M83 29c9 9 4 24-8 29m5 2-5-2 1-5" />
                    <path d="M33 12c12-6 28-5 38 1m-5-5 5 5-6 2" />
                    <path d="M67 68c-12 6-28 5-38-1m5 5-5-5 6-2" />
                  </svg>
                  <div className="sim-view" aria-hidden="true">
                    <div
                      className="sim-box"
                      style={{
                        transform: `rotateX(${currentPitch}deg) rotateZ(${currentRoll}deg)`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
            <VehicleDiagram
              className="vehicle-svg"
              vehicle={vehicle}
              recommendation={recommendation}
            />
          </div>

        </section>

        <div className="action-area">
          <button
            className={`calibrate-button ${isHoldingCalibration ? 'is-holding' : ''} ${
              calibrationComplete ? 'is-complete' : ''
            }`}
            type="button"
            disabled={source === 'external' || (source === 'phone' && !sensorData.available)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              startCalibrationHold();
            }}
            onPointerUp={cancelCalibrationHold}
            onPointerCancel={cancelCalibrationHold}
            onLostPointerCapture={cancelCalibrationHold}
            onBlur={cancelCalibrationHold}
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
            aria-label={`Hold for 3 seconds to overwrite calibration slot ${activeSlotLabel} on level ground`}
          >
            <span className="calibrate-icon" aria-hidden="true">
              {calibrationComplete ? '✓' : isHoldingCalibration ? '···' : '◎'}
            </span>
            <span>
              {calibrationComplete
                ? 'SLOT UPDATED'
                : isHoldingCalibration
                  ? 'KEEP HOLDING'
                  : `HOLD TO SET SLOT ${activeSlotLabel}`}
            </span>
            {!calibrationComplete && <span className="hold-duration">3 SEC</span>}
          </button>
          <div
            className="quick-calibrations"
            role="group"
            aria-label={`Select ${calibrationSlotSource} calibration slot`}
          >
            {calibrationSlots[calibrationSlotSource].map((slot, index) => {
              const isSelected = slot.id === activeSlotId;
              const isCalibrated = slot.pitch !== null && slot.roll !== null;
              const label = slot.name.trim() || `SLOT ${index + 1}`;

              return (
                <button
                  className={`quick-calibration-button${isSelected ? ' selected' : ''}${
                    isCalibrated ? ' calibrated' : ' empty'
                  }`}
                  key={slot.id}
                  type="button"
                  aria-label={`${label}, ${
                    isCalibrated ? 'calibrated' : 'not calibrated'
                  }${isSelected ? ', selected' : ''}`}
                  aria-pressed={isSelected}
                  title={`${label} · ${
                    isCalibrated ? 'Calibrated' : 'Not calibrated'
                  }`}
                  onClick={() => {
                    cancelCalibrationHold();
                    setCalibrationSlotIds((current) => ({
                      ...current,
                      [calibrationSlotSource]: slot.id,
                    }));
                    setCalibrationComplete(false);
                  }}
                >
                  <span className="quick-calibration-name">{label}</span>
                  <span className="quick-calibration-status">
                    {isCalibrated ? 'CALIBRATED' : 'NOT CALIBRATED'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <nav className="bottom-menu" aria-label="Configuration and feedback">
        <button
          className={activeMenu === 'vehicle' ? 'menu-button selected' : 'menu-button'}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setActiveMenu('vehicle')}
        >
          <span className="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M3 16v-4l2-1 2-4h9l3 4 2 1v4h-2m-11 0h8M3 16h1" />
              <circle cx="6" cy="16" r="2" />
              <circle cx="18" cy="16" r="2" />
              <path d="M7 11h11M12 7v4" />
            </svg>
          </span>
          <span>VEHICLE</span>
        </button>
        <span className="menu-divider" />
        <button
          className={activeMenu === 'wedges' ? 'menu-button selected' : 'menu-button'}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setActiveMenu('wedges')}
        >
          <span className="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 19h16L4 5Z" />
            </svg>
          </span>
          <span>WEDGES</span>
        </button>
        <span className="menu-divider" />
        <button
          className={activeMenu === 'calibration' ? 'menu-button selected' : 'menu-button'}
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            setCalibrationSettingsSource(source);
            setActiveMenu('calibration');
          }}
        >
          <span className="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 2v5m0 10v5M2 12h5m10 0h5" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </span>
          <span>CALIBRATION</span>
        </button>
        <span className="menu-divider" />
        <button
          className={
            activeMenu === 'feedback'
              ? 'menu-button feedback-button selected'
              : 'menu-button feedback-button'
          }
          type="button"
          aria-haspopup="dialog"
          aria-label="Send feedback"
          title="Send feedback"
          onClick={() => setActiveMenu('feedback')}
        >
          <span className="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M3 5.5h18v13H3zM3.5 6l8.5 7 8.5-7" />
            </svg>
          </span>
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
                <span className="eyebrow">
                  {activeMenu === 'feedback' ? 'FRIEND BETA' : 'CONFIGURATION'}
                </span>
                <h2 id="menu-title">
                  {activeMenu === 'vehicle'
                    ? 'Vehicle setup'
                    : activeMenu === 'wedges'
                      ? 'Wedge setup'
                      : activeMenu === 'calibration'
                      ? 'Rename calibration slots'
                        : 'Send feedback'}
                </h2>
              </div>
              <button
                className="close-menu"
                type="button"
                aria-label="Close dialog"
                onClick={() => setActiveMenu(null)}
              >
                ×
              </button>
            </header>

            {activeMenu !== 'feedback' && (
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
                <button
                  className={activeMenu === 'calibration' ? 'menu-tab active' : 'menu-tab'}
                  type="button"
                  role="tab"
                  aria-selected={activeMenu === 'calibration'}
                  onClick={() => setActiveMenu('calibration')}
                >
                  CALIBRATION
                </button>
              </div>
            )}

            {activeMenu === 'vehicle' ? (
              <div className="menu-content">
                <div className="settings-card vehicle-preview">
                  <span className="eyebrow">VEHICLE DIMENSIONS · TOP VIEW</span>
                  <VehicleDiagram
                    className="vehicle-svg"
                    vehicle={vehicle}
                    showMeasurements
                  />
                </div>
                <div className="settings-card input-group">
                  <label>
                    Wheelbase <span>CM</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      value={vehicleInputs.wheelbaseCm}
                      min={vehicleDimensionLimits.wheelbaseCm.min}
                      max={vehicleDimensionLimits.wheelbaseCm.max}
                      aria-invalid={Boolean(vehicleInputErrors.wheelbaseCm)}
                      aria-describedby={
                        vehicleInputErrors.wheelbaseCm ? 'wheelbase-error' : undefined
                      }
                      onChange={(event) => handleVehicleDimensionChange(event, 'wheelbaseCm')}
                      onBlur={() => saveVehicleDimension('wheelbaseCm')}
                    />
                    {vehicleInputErrors.wheelbaseCm && (
                      <small className="input-error" id="wheelbase-error">
                        {vehicleInputErrors.wheelbaseCm}
                      </small>
                    )}
                  </label>
                  <label>
                    Track width <span>CM</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      value={vehicleInputs.trackWidthCm}
                      min={vehicleDimensionLimits.trackWidthCm.min}
                      max={vehicleDimensionLimits.trackWidthCm.max}
                      aria-invalid={Boolean(vehicleInputErrors.trackWidthCm)}
                      aria-describedby={
                        vehicleInputErrors.trackWidthCm ? 'track-width-error' : undefined
                      }
                      onChange={(event) => handleVehicleDimensionChange(event, 'trackWidthCm')}
                      onBlur={() => saveVehicleDimension('trackWidthCm')}
                    />
                    {vehicleInputErrors.trackWidthCm && (
                      <small className="input-error" id="track-width-error">
                        {vehicleInputErrors.trackWidthCm}
                      </small>
                    )}
                  </label>
                </div>
              </div>
            ) : activeMenu === 'wedges' ? (
              <div className="menu-content">
                <div className="settings-card wedge-settings">
                  <div className="wedge-illustration">
                    <svg viewBox="0 0 320 200" role="img" aria-labelledby="wedge-example-title">
                      <title id="wedge-example-title">
                        Side view of a vehicle wheel resting on a stepped wedge
                      </title>
                      <path className="wedge-example-body" d="M20 123 300 190V197H20Z" />
                      <path className="wedge-example-seams" d="M112 145V197M205 167V197" />
                      <path className="wedge-example-car" d="M0 58H64C70 26 96 10 138 10S206 26 212 58H320" />
                      <circle className="wedge-example-wheel" cx="138" cy="83" r="66" />
                      <circle className="wedge-example-rim" cx="138" cy="83" r="42" />
                      <path className="wedge-example-spokes" d="M138 41V125M96 83H180M108 53 168 113M168 53 108 113" />
                      <circle className="wedge-example-hub" cx="138" cy="83" r="8" />
                      <text className="wedge-example-label" x="65" y="184">
                        {wedgeIllustrationHeights[0] ?? '—'}
                      </text>
                      <text className="wedge-example-label" x="158" y="189">
                        {wedgeIllustrationHeights[1] ?? '—'}
                      </text>
                      <text className="wedge-example-label" x="250" y="194">
                        {wedgeIllustrationHeights[2] ?? '—'}
                      </text>
                    </svg>
                    <span>Side view</span>
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
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                          </svg>
                        </button>
                      </label>
                    ))}
                  </div>
                  <button className="add-wedge" type="button" onClick={addWedgeHeight}>
                    + ADD STEP
                  </button>
                </div>
              </div>
            ) : activeMenu === 'calibration' ? (
              <div className="menu-content calibration-content">
                <div className="settings-card calibration-settings-card">
                  <div className="calibration-sensor">
                    <span>Sensor</span>
                    <details
                      className="calibration-sensor-dropdown"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          event.currentTarget.open = false;
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape' && event.currentTarget.open) {
                          event.preventDefault();
                          event.stopPropagation();
                          event.currentTarget.open = false;
                          event.currentTarget.querySelector('summary').focus();
                        }
                      }}
                    >
                      <summary aria-label={`Sensor: ${calibrationSourceLabels[calibrationSettingsSource]}`}>
                        {calibrationSourceLabels[calibrationSettingsSource]}
                      </summary>
                      <div className="calibration-sensor-options" role="group" aria-label="Sensor">
                        {[
                          { id: 'simulation', label: 'Simulation' },
                          { id: 'phone', label: 'Phone sensor' },
                          { id: 'external', label: 'External sensor' },
                        ].map((sensor) => (
                          <button
                            key={sensor.id}
                            type="button"
                            aria-pressed={calibrationSettingsSource === sensor.id}
                            onClick={(event) => {
                              setCalibrationSettingsSource(sensor.id);
                              const dropdown = event.currentTarget.closest('details');
                              dropdown.open = false;
                              dropdown.querySelector('summary').focus();
                            }}
                          >
                            {sensor.label}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                  <div className="calibration-slot-settings">
                    {calibrationSlots[calibrationSettingsSource].map((slot, index) => {
                      const hasCalibration = slot.pitch !== null && slot.roll !== null;
                      const isSelected =
                        calibrationSlotIds[calibrationSettingsSource] === slot.id;

                      return (
                        <div
                          className={`calibration-slot-card${isSelected ? ' selected' : ''}`}
                          key={slot.id}
                        >
                          <div className="calibration-slot-heading">
                            <span>SLOT {index + 1}</span>
                            <small>{isSelected ? 'SELECTED ON MAIN SCREEN' : ''}</small>
                          </div>
                          <div className="calibration-slot-detail">
                            <label className="calibration-slot-name">
                              <span>Name <small>OPTIONAL</small></span>
                              <input
                                type="text"
                                maxLength={60}
                                placeholder={`Slot ${index + 1}`}
                                value={slot.name}
                                aria-label={`Name for ${calibrationSettingsSource} slot ${
                                  index + 1
                                }`}
                                onChange={(event) =>
                                  updateCalibrationSlotName(
                                    calibrationSettingsSource,
                                    slot.id,
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <p
                              className={
                                hasCalibration
                                  ? 'calibration-slot-offsets'
                                  : 'calibration-slot-offsets empty'
                              }
                            >
                              {hasCalibration ? (
                                <>
                                  <span>Pitch {formatCalibrationAngle(slot.pitch)}</span>
                                  <span>Roll {formatCalibrationAngle(slot.roll)}</span>
                                </>
                              ) : (
                                'Not calibrated'
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {calibrationSettingsSource === 'external' && (
                  <p className="settings-hint">
                    External sensor calibration is unavailable until external sensor support is
                    connected.
                  </p>
                )}
              </div>
            ) : (
              <div className="menu-content">
                <FeedbackForm endpoint={FORMSPREE_ENDPOINT} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
