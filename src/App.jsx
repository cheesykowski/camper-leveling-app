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
import { normalizeLanguage, translate } from './i18n.js';
import { applyUpdate, checkForUpdates, installApp, refreshOfflineStatus, usePwa } from './pwa.js';
import { initialSensorSource } from './appMode.js';

const STORAGE_KEY = 'camper-leveling-demo-v1';
const SIMULATION_MAX_TILT = 30;
const SENSOR_STALE_TIMEOUT_MS = 10000;
const MAX_WEDGE_STEPS = 5;
const HEIGHT_MODE_TOLERANCE_CM = 3;
const FORMSPREE_ENDPOINT = import.meta.env.VITE_FORMSPREE_ENDPOINT?.trim() || '';

const formatCalibrationAngle = (angle) => `${angle >= 0 ? '+' : ''}${angle.toFixed(1)}°`;
const formatHeightCm = (height, language) => new Intl.NumberFormat(language, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
}).format(height);

const defaultVehicle = {
  wheelbaseCm: 240,
  trackWidthCm: 180,
  wedgeHeightsCm: [3, 6, 9],
  levelingMode: 'wedge',
  maximumHeightCm: 9,
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

function VehicleDiagram({ className, vehicle, recommendation, t, language, showMeasurements = false }) {
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
      <title id={`${id}-title`}>{t('Vehicle top view and wheel positions')}</title>
      <desc id={`${id}-description`}>
        {showMeasurements
          ? t('Wheelbase {wheelbase} centimeters and track width {trackWidth} centimeters.', {
              wheelbase: vehicle.wheelbaseCm,
              trackWidth: vehicle.trackWidthCm,
            })
          : recommendation?.description}
      </desc>

      <rect className="vehicle-body" x="116" y="25" width="128" height="370" rx="45" />
      <path className="vehicle-glass" d="M130 80 Q180 52 230 80 L222 130 Q180 143 138 130 Z" />
      <path className="vehicle-roof" d="M133 147 Q180 136 227 147 L227 272 Q180 284 133 272 Z" />
      <path className="vehicle-glass" d="M138 289 Q180 278 222 289 L230 337 Q180 360 130 337 Z" />
      <text className="diagram-axle-label" x="180" y="20" textAnchor="middle">
        {t('FRONT ↑')}
      </text>
      <text className="diagram-axle-label" x="180" y="413" textAnchor="middle">
        {t('REAR ↓')}
      </text>

      {wheels.map((wheel) => {
        const placement = recommendation?.wedgePlacements?.find((item) => item.id === wheel.id);
        const heightMode = vehicle.levelingMode === 'height';
        const active = Boolean(placement && (
          (heightMode ? placement.requiredHeightCm > 0 : placement.step > 0)
          || placement.wedgeCapacityExceeded
        ));
        const heightLabel = placement ? formatHeightCm(placement.requiredHeightCm, language) : '';
        const labelX = wheel.side === 'left' ? 8 : 292;
        const wedgePoints =
          wheel.side === 'left'
            ? `${wheel.x - 19},${wheel.y + 24} ${wheel.x},${wheel.y + 16} ${wheel.x},${wheel.y + 36}`
            : `${wheel.x + 53},${wheel.y + 24} ${wheel.x + 34},${wheel.y + 16} ${wheel.x + 34},${wheel.y + 36}`;

        return (
          <g key={wheel.id} className={active ? 'diagram-wheel active' : 'diagram-wheel'}>
            <title>
              {active
                ? heightMode
                  ? t('{wheel}: {height} cm{warning}', {
                      wheel: t(wheel.label),
                      height: heightLabel,
                      warning: placement.wedgeCapacityExceeded
                        ? t(', required lift exceeds maximum height')
                        : '',
                    })
                  : t('{wheel}: step {step}{warning}', {
                    wheel: t(wheel.label),
                    step: placement.step,
                    warning: placement.wedgeCapacityExceeded
                      ? t(', required lift exceeds wedge capacity')
                      : '',
                  })
                : t(heightMode ? '{wheel}: no lift recommended' : '{wheel}: no wedge recommended', {
                    wheel: t(wheel.label),
                  })}
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
                  {heightMode ? t('{height} cm', { height: heightLabel }) : t('STEP {step}', { step: placement.step })}
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
            {t('TRACK WIDTH')}
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
            {t('WHEELBASE')}
          </text>
        </g>
      )}

    </svg>
  );
}

function HelpTabs({ label, options, value, onChange, id, t }) {
  const handleKeyDown = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft') next = (index + options.length - 1) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;

    event.preventDefault();
    onChange(options[next].id);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
  };

  return (
    <div className="menu-tabs help-tabs" role="tablist" aria-label={t(label)}>
      {options.map((option, index) => (
        <button
          className={value === option.id ? 'menu-tab active' : 'menu-tab'}
          key={option.id}
          id={`${id}-${option.id}-tab`}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          aria-controls={`${id}-${option.id}-panel`}
          tabIndex={value === option.id ? 0 : -1}
          onClick={() => onChange(option.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {t(option.label)}
        </button>
      ))}
    </div>
  );
}

function HelpIllustration({ type }) {
  return (
    <svg viewBox="0 0 100 72" aria-hidden="true">
      {type === 'vehicle' ? (
        <>
          <path d="M12 48h76M22 48V33l8-5 8-11h29l8 11 7 5v15" />
          <circle cx="32" cy="48" r="6" /><circle cx="72" cy="48" r="6" />
          <path d="M19 62h25L19 53Z" />
        </>
      ) : type === 'phone' ? (
        <>
          <rect x="34" y="12" width="32" height="48" rx="4" />
          <path d="M45 17h10M47 54h6M50 10V2M46 6l4-4 4 4M20 64h60" />
        </>
      ) : type === 'external' ? (
        <>
          <rect x="24" y="16" width="52" height="40" rx="4" />
          <circle cx="31" cy="23" r="2" /><circle cx="69" cy="49" r="2" />
          <rect x="42" y="27" width="16" height="16" rx="2" />
          <path d="M39 29h3m-3 6h3m-3 6h3m16-12h3m-3 6h3m-3 6h3M20 60h60" />
        </>
      ) : type === 'level' ? (
        <>
          <path d="M14 55h72M20 48h60V30H20Z" />
          <circle cx="35" cy="48" r="6" /><circle cx="65" cy="48" r="6" />
          <path d="M36 21h28M50 13v16M44 16l6-5 6 5" />
        </>
      ) : (
        <>
          <rect x="35" y="9" width="30" height="46" rx="9" />
          <path d="M30 19h5v12h-5zM65 19h5v12h-5zM30 39h5v12h-5zM65 39h5v12h-5zM15 51h14L29 37ZM71 51h14L71 37Z" />
        </>
      )}
    </svg>
  );
}

function HelpContent({ t, source, levelingMode }) {
  const id = useId();
  const [phase, setPhase] = useState('setup');
  const [mode, setMode] = useState(source === 'external' ? 'external' : 'phone');
  const phases = [{ id: 'setup', label: 'SETUP' }, { id: 'use', label: 'USE' }];
  const modes = [{ id: 'phone', label: 'PHONE' }, { id: 'external', label: 'EXTERNAL' }];
  const isPhone = mode === 'phone';
  const steps = phase === 'setup'
    ? [
        { icon: 'vehicle', title: 'Set up vehicle and wedges', text: 'Enter your wheelbase, track width and wedge step heights in the settings.' },
        { icon: 'level', title: 'Find a level reference', text: 'First level the parked vehicle using a spirit level.' },
        isPhone
          ? { icon: 'phone', title: 'Place the phone', text: 'Place the phone flat and securely, screen up and top toward the front of the vehicle. Select PHONE and a calibration slot.' }
          : { icon: 'external', title: 'Mount the external sensor', text: 'Mount the sensor securely in the vehicle. Recalibrate if it moves.' },
        isPhone
          ? { icon: 'level', title: 'Calibrate', text: 'With the phone in place, hold the calibration button for 3 seconds. Calibrate a separate slot for each phone position.' }
          : { icon: 'level', title: 'Calibrate', text: 'Once external sensors are supported, select EXTERNAL and hold the calibration button for 3 seconds.' },
      ]
    : [
        isPhone
          ? { icon: 'phone', title: 'Place the phone', text: 'Place the phone in exactly the same position and orientation as during calibration. Select PHONE and the matching calibrated slot.' }
          : { icon: 'external', title: 'Select the external sensor', text: 'Once external sensors are supported, select EXTERNAL. The fixed sensor uses its saved calibration.' },
        levelingMode === 'height'
          ? { icon: 'wedges', title: 'Read the top view', text: 'Wait for a sensor signal. The top view shows the required lift in centimeters. Orange means it exceeds the maximum height.' }
          : { icon: 'wedges', title: 'Read the top view', text: 'Wait for a sensor signal. The top view shows the wheels and wedge steps. Orange means the required lift exceeds the wedge height.' },
        levelingMode === 'height'
          ? { icon: 'vehicle', title: 'Level the vehicle', text: 'Use suitable supports at the shown wheels. Check the vehicle and the display again.' }
          : { icon: 'vehicle', title: 'Level the vehicle', text: 'Place the wedges at the shown wheels and drive slowly onto the indicated steps. Stop and check the display again.' },
      ];

  return (
    <div className="menu-content help-content">
      <p className="help-intro">{t('The sensor measures vehicle tilt. The app uses your settings to recommend up to two wheels and wedge steps.')}</p>
      <HelpTabs label="Help section" options={phases} value={phase} onChange={setPhase} id={`${id}-phase`} t={t} />
      {phases.map((phaseOption) => (
        <section
          key={phaseOption.id}
          role="tabpanel"
          id={`${id}-phase-${phaseOption.id}-panel`}
          aria-labelledby={`${id}-phase-${phaseOption.id}-tab`}
          hidden={phase !== phaseOption.id}
        >
          <HelpTabs label="Sensor mode" options={modes} value={mode} onChange={setMode} id={`${id}-${phaseOption.id}-mode`} t={t} />
          {modes.map((modeOption) => (
            <section
              key={modeOption.id}
              className="help-steps"
              role="tabpanel"
              id={`${id}-${phaseOption.id}-mode-${modeOption.id}-panel`}
              aria-labelledby={`${id}-${phaseOption.id}-mode-${modeOption.id}-tab`}
              hidden={mode !== modeOption.id}
              tabIndex={0}
            >
              {phase === phaseOption.id && mode === modeOption.id && (
                <>
                  {!isPhone && <p className="help-notice">{t('External sensor support is not available yet.')}</p>}
                  {steps.map((step, index) => (
                    <article className="settings-card help-card" key={step.title}>
                      <HelpIllustration type={step.icon} />
                      <div>
                        <span className="eyebrow">{String(index + 1).padStart(2, '0')}</span>
                        <h3>{t(step.title)}</h3>
                        <p>{t(step.text)}</p>
                      </div>
                    </article>
                  ))}
                  <p className="settings-hint">{t('Verify sensor direction and recommendations on your vehicle before relying on them.')}</p>
                  {source === 'simulation' && <p className="settings-hint">{t('Simulation: drag the 3D box to try the app without a sensor. Its calibration slots are separate.')}</p>}
                </>
              )}
            </section>
          ))}
        </section>
      ))}
    </div>
  );
}

function AppDropdown({ label, value, options, onChange, placeholder, className = '', summaryRef, invalid, describedBy }) {
  const selected = options.find((option) => option.value === value);
  const selectedLabel = selected?.label ?? placeholder;

  return (
    <details
      className={`app-dropdown ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
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
      <summary
        ref={summaryRef}
        aria-label={`${label}: ${selectedLabel}`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        {selectedLabel}
      </summary>
      <div className="app-dropdown-options" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={(event) => {
              const dropdown = event.currentTarget.closest('details');
              onChange(option.value);
              dropdown.open = false;
              dropdown.querySelector('summary').focus();
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function FeedbackForm({ endpoint, t, online }) {
  const [feedback, setFeedback] = useState({
    name: '',
    category: '',
    device: '',
    message: '',
    consent: false,
  });
  const [status, setStatus] = useState({ type: 'idle', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categoryError, setCategoryError] = useState(false);
  const categoryRef = useRef(null);
  const categoryErrorId = useId();

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
    if (!feedback.category) {
      setCategoryError(true);
      categoryRef.current.focus();
      return;
    }

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
          message: 'Feedback could not be sent (HTTP {status}). Please try again later.',
          values: { status: response.status },
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
        <span className="eyebrow">{t('FORM NOT CONNECTED')}</span>
        <p>{t('Feedback is not available yet. Please try again later.')}</p>
      </div>
    );
  }

  return (
    <form className="feedback-form" onSubmit={handleSubmit}>
      <input type="hidden" name="_subject" value="KEILOMAT friend beta feedback" />
      <label className="feedback-honeypot" aria-hidden="true">
        {t('Leave this empty')}
        <input name="_gotcha" type="text" tabIndex="-1" autoComplete="off" />
      </label>
      <label className="feedback-field">
        <span>
          {t('Your name')} <small>{t('OPTIONAL')}</small>
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
        <div className="feedback-field">
          <span>{t('Category')}</span>
          <input type="hidden" name="category" value={feedback.category} />
          <AppDropdown
            label={t('Category')}
            value={feedback.category}
            placeholder={t('Choose one')}
            options={[
              { value: 'bug', label: t('Something did not work') },
              { value: 'usability', label: t('Something was unclear') },
              { value: 'idea', label: t('I have an idea') },
              { value: 'other', label: t('Other feedback') },
            ]}
            summaryRef={categoryRef}
            invalid={categoryError}
            describedBy={categoryError ? categoryErrorId : undefined}
            onChange={(value) => {
              setFeedback((current) => ({ ...current, category: value }));
              setCategoryError(false);
              setStatus({ type: 'idle', message: '' });
            }}
          />
          {categoryError && <small className="input-error" id={categoryErrorId} role="alert">{t('Choose a category.')}</small>}
        </div>
        <div className="feedback-field">
          <span>
            {t('Device')} <small>{t('OPTIONAL')}</small>
          </span>
          <input type="hidden" name="device" value={feedback.device} />
          <AppDropdown
            label={t('Device')}
            value={feedback.device}
            options={[
              { value: '', label: t('Choose one') },
              { value: 'smartphone', label: t('Smartphone') },
              { value: 'tablet', label: t('Tablet') },
              { value: 'laptop', label: t('Laptop') },
              { value: 'desktop', label: t('Desktop computer') },
              { value: 'other', label: t('Other / not listed') },
            ]}
            onChange={(value) => {
              setFeedback((current) => ({ ...current, device: value }));
              setStatus({ type: 'idle', message: '' });
            }}
          />
        </div>
      </div>
      <label className="feedback-field">
        <span>{t('What would you like to share?')}</span>
        <textarea
          name="message"
          required
          maxLength={3000}
          rows={5}
          value={feedback.message}
          onChange={handleChange}
          placeholder={t('What were you trying to do? What felt unclear or could be better?')}
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
          {t('I agree to send this feedback to the app owner by email and store it in their Formspree account. Only anonymized, reviewed takeaways may be added to the public repository. Please do not include sensitive personal information.')}
        </span>
      </label>
      {!online && <p className="feedback-status" role="status">{t('Feedback requires an internet connection.')}</p>}
      {status.message && (
        <p
          className={`feedback-status ${status.type}`}
          role={status.type === 'error' ? 'alert' : 'status'}
        >
          {t(status.message, status.values)}
        </p>
      )}
      <button className="feedback-submit" type="submit" disabled={isSubmitting || !online}>
        {t(isSubmitting ? 'SENDING…' : 'SEND FEEDBACK')}
      </button>
    </form>
  );
}

function App() {
  const pwa = usePwa();
  const simulationEnabled = initialSensorSource(window.location.search, pwa.standalone) === 'simulation';
  const loadedState = useMemo(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        language: 'en',
        calibrationSlots: defaultCalibrationSlots,
        calibrationSlotIds: defaultCalibrationSlotIds,
        vehicle: defaultVehicle,
        setupConfirmed: { vehicle: false, wedges: false, height: false },
      };
    }

    try {
      const parsed = JSON.parse(raw);
      const savedWedgeHeights = Array.isArray(parsed.vehicle?.wedgeHeightsCm)
        ? parsed.vehicle.wedgeHeightsCm
            .map(Number)
            .filter((height) => Number.isFinite(height) && height > 0)
            .sort((a, b) => a - b)
            .slice(0, MAX_WEDGE_STEPS)
        : [];
      const savedMaximumHeight = Number(parsed.vehicle?.maximumHeightCm);
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
        language: normalizeLanguage(parsed.language),
        calibrationSlots,
        calibrationSlotIds: normalizeCalibrationSlotIds(parsed.calibrationSlotIds),
        setupConfirmed: {
          vehicle: parsed.setupConfirmed?.vehicle === true,
          wedges: parsed.setupConfirmed?.wedges === true,
          height: parsed.setupConfirmed?.height === true,
        },
        vehicle: {
          wheelbaseCm: Number(parsed.vehicle?.wheelbaseCm ?? defaultVehicle.wheelbaseCm),
          trackWidthCm: Number(parsed.vehicle?.trackWidthCm ?? defaultVehicle.trackWidthCm),
          wedgeHeightsCm: savedWedgeHeights.length
            ? savedWedgeHeights
            : [...defaultVehicle.wedgeHeightsCm],
          levelingMode: parsed.vehicle?.levelingMode === 'height' ? 'height' : 'wedge',
          maximumHeightCm: Number.isFinite(savedMaximumHeight) && savedMaximumHeight > 0
            ? savedMaximumHeight
            : (savedWedgeHeights[savedWedgeHeights.length - 1] ?? defaultVehicle.maximumHeightCm),
        },
      };
    } catch {
      return {
        language: 'en',
        calibrationSlots: defaultCalibrationSlots,
        calibrationSlotIds: defaultCalibrationSlotIds,
        vehicle: defaultVehicle,
        setupConfirmed: { vehicle: false, wedges: false, height: false },
      };
    }
  }, []);

  const [language, setLanguage] = useState(loadedState.language);
  const t = useMemo(() => (message, values) => translate(language, message, values), [language]);
  const [calibrationSlots, setCalibrationSlots] = useState(
    loadedState.calibrationSlots,
  );
  const [calibrationSlotIds, setCalibrationSlotIds] = useState(
    loadedState.calibrationSlotIds,
  );
  const [calibrationSettingsSource, setCalibrationSettingsSource] = useState('phone');
  const [vehicle, setVehicle] = useState(loadedState.vehicle);
  const [setupConfirmed, setSetupConfirmed] = useState(loadedState.setupConfirmed);
  const wedgesConfirmed = setupConfirmed[vehicle.levelingMode === 'height' ? 'height' : 'wedges'];
  const [vehicleInputs, setVehicleInputs] = useState({
    wheelbaseCm: String(loadedState.vehicle.wheelbaseCm),
    trackWidthCm: String(loadedState.vehicle.trackWidthCm),
  });
  const [vehicleInputErrors, setVehicleInputErrors] = useState({});
  const [wedgeHeightInputs, setWedgeHeightInputs] = useState(
    loadedState.vehicle.wedgeHeightsCm.map(String),
  );
  const [wedgeHeightErrors, setWedgeHeightErrors] = useState([]);
  const [maximumHeightInput, setMaximumHeightInput] = useState(String(loadedState.vehicle.maximumHeightCm));
  const [maximumHeightError, setMaximumHeightError] = useState(false);
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
  const [selectedSource, setSource] = useState(() => initialSensorSource(window.location.search, pwa.standalone));
  const source = pwa.standalone && selectedSource === 'simulation' ? 'phone' : selectedSource;
  const [sourceMessage, setSourceMessage] = useState('');
  const sourceSelectionLocked = useRef(simulationEnabled);
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
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.title = `KEILOMAT ${pwa.standalone ? 'APP' : 'WEB'}`;
  }, [pwa.standalone]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        language,
        calibrationSlots,
        calibrationSlotIds,
        vehicle,
        setupConfirmed,
      }),
    );
  }, [language, calibrationSlots, calibrationSlotIds, vehicle, setupConfirmed]);

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
        title: t(source === 'external' ? 'External sensor unavailable' : 'No sensor signal'),
        description:
          source === 'external'
            ? t('The external Bluetooth connection is not available yet.')
            : t('Check the device, browser permission, and HTTPS.'),
        wedgePlacements: [],
      };
    }

    const heightMode = vehicle.levelingMode === 'height';
    const plan = calculateTwoWedgePlan({
      pitchDegrees: currentPitch,
      rollDegrees: currentRoll,
      wheelbaseCm: vehicle.wheelbaseCm,
      trackWidthCm: vehicle.trackWidthCm,
      wedgeHeightsCm: vehicle.wedgeHeightsCm,
      maximumHeightCm: heightMode ? vehicle.maximumHeightCm : undefined,
      levelToleranceCm: heightMode ? HEIGHT_MODE_TOLERANCE_CM : Math.min(...vehicle.wedgeHeightsCm),
    });
    if (plan.isLevel) {
      return {
        axis: 'level',
        title: t('Vehicle is level'),
        description: t(heightMode
          ? 'The app is within the target tolerance. No height adjustment needed right now.'
          : 'The app is within the target tolerance. No wedge adjustment needed right now.'),
        wedgePlacements: [],
      };
    }

    const title =
      plan.dominantAxis === 'pitch'
        ? t(plan.lowAxle === 'front' ? 'Front is low' : 'Rear is low')
        : t(plan.lowSide === 'left' ? 'Left side is low' : 'Right side is low');
    const placementSummary = plan.wedgePlacements
      .map(({ label, step, requiredHeightCm, wedgeCapacityExceeded }) =>
        `${t(label)}: ${heightMode
          ? t('{height} cm', { height: formatHeightCm(requiredHeightCm, language) })
          : step > 0 ? t('step {step}', { step }) : t('no wedge')}${
          wedgeCapacityExceeded
            ? t(heightMode ? ', required lift exceeds maximum height' : ', required lift exceeds wedge capacity')
            : ''
        }`,
      )
      .join(' · ');

    return {
      axis: plan.dominantAxis,
      title,
      description: t('{axis} dominant · {placements}', {
        axis: t(plan.dominantAxis === 'pitch' ? 'Pitch' : 'Roll'),
        placements: placementSummary,
      }),
      ...plan,
    };
  }, [currentPitch, currentRoll, source, vehicle, t, language]);

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

  useEffect(() => {
    if (pwa.standalone && selectedSource === 'simulation') {
      cancelCalibrationHold();
      sourceSelectionLocked.current = true;
      setSource('phone');
      setCalibrationSettingsSource('phone');
    }
  }, [pwa.standalone, selectedSource]);

  const updateCalibrationSlotName = (sourceName, slotId, name) => {
    setCalibrationSlots((current) => ({
      ...current,
      [sourceName]: current[sourceName].map((slot) =>
        slot.id === slotId ? { ...slot, name: name.slice(0, 60) } : slot,
      ),
    }));
  };

  const calibrationSlotSource = source;
  const activeSlotId = calibrationSlotIds[calibrationSlotSource];
  const activeSlot = calibrationSlots[calibrationSlotSource].find((slot) => slot.id === activeSlotId);
  const needsCalibration = !activeSlot || activeSlot.pitch === null || activeSlot.roll === null;
  const activeSlotLabel = activeSlot?.name.trim() || String(calibrationSlotKeys.indexOf(activeSlotId) + 1);
  const noCalibration = source === 'external'
    ? !activeSlot || activeSlot.pitch === null || activeSlot.roll === null
    : !calibrationSlots[calibrationSlotSource].some(
        (slot) => slot.pitch !== null && slot.roll !== null,
      );
  const localizedSourceMessage = sourceMessage.startsWith('Sensor access failed: ')
    ? t('Sensor access failed: {error}', { error: sourceMessage.slice('Sensor access failed: '.length) })
    : sourceMessage ? t(sourceMessage) : '';
  const additionalInfo = [
    recommendation.axis === 'unavailable' ? localizedSourceMessage || recommendation.description : '',
    recommendation.wedgeCapacityExceeded
      ? t(vehicle.levelingMode === 'height'
        ? 'Required lift exceeds maximum height.'
        : 'Required lift exceeds wedge capacity.')
      : '',
    noCalibration
      ? t(source === 'external' ? 'External sensor has not been calibrated.' : 'No calibration slot has been set.')
      : '',
  ].filter(Boolean).join(' ') || (recommendation.axis === 'level' ? recommendation.description : '');
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
        [dimension]: { min, max },
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
    setWedgeHeightErrors((current) => current.map((error, heightIndex) => heightIndex === index ? false : error));
  };

  const saveWedgeHeight = (index) => {
    const heights = wedgeHeightInputs.map((value) => Number(value.replace(',', '.')));
    const errors = heights.map((height) => !Number.isFinite(height) || height <= 0);
    if (errors.some(Boolean)) {
      setWedgeHeightErrors((current) => errors.map((error, heightIndex) =>
        heightIndex === index ? error : Boolean(current[heightIndex]),
      ));
      return;
    }
    heights.sort((a, b) => a - b);
    setVehicle((current) => ({ ...current, wedgeHeightsCm: heights }));
    setWedgeHeightInputs(heights.map(String));
    setWedgeHeightErrors([]);
  };

  const addWedgeHeight = () => {
    if (vehicle.wedgeHeightsCm.length >= MAX_WEDGE_STEPS) return;
    const highest = Math.max(...vehicle.wedgeHeightsCm);
    const heights = [...vehicle.wedgeHeightsCm, highest + 3].sort((a, b) => a - b);
    setVehicle((current) => ({ ...current, wedgeHeightsCm: heights }));
    setWedgeHeightInputs(heights.map(String));
    setWedgeHeightErrors([]);
  };

  const saveMaximumHeight = () => {
    const height = Number(maximumHeightInput.replace(',', '.'));
    if (!Number.isFinite(height) || height <= 0) {
      setMaximumHeightError(true);
      return;
    }
    setVehicle((current) => ({ ...current, maximumHeightCm: height }));
    setMaximumHeightInput(String(height));
    setMaximumHeightError(false);
  };

  const removeWedgeHeight = (index) => {
    if (vehicle.wedgeHeightsCm.length <= 1) return;
    const heights = vehicle.wedgeHeightsCm.filter((_, heightIndex) => heightIndex !== index);
    setVehicle((current) => ({ ...current, wedgeHeightsCm: heights }));
    setWedgeHeightInputs((current) => current.filter((_, heightIndex) => heightIndex !== index));
    setWedgeHeightErrors((current) => current.filter((_, heightIndex) => heightIndex !== index));
  };

  const confirmVehicle = () => {
    const errors = {};
    for (const dimension of Object.keys(vehicleDimensionLimits)) {
      const { min, max } = vehicleDimensionLimits[dimension];
      const value = vehicleInputs[dimension];
      const number = Number(value);
      if (!value.trim() || !Number.isFinite(number) || number < min || number > max) {
        errors[dimension] = { min, max };
      }
    }
    setVehicleInputErrors(errors);
    if (Object.keys(errors).length) return;
    setVehicle((current) => ({
      ...current,
      wheelbaseCm: Number(vehicleInputs.wheelbaseCm),
      trackWidthCm: Number(vehicleInputs.trackWidthCm),
    }));
    setSetupConfirmed((current) => ({ ...current, vehicle: true }));
  };

  const confirmWedges = () => {
    if (vehicle.levelingMode === 'height') {
      const height = Number(maximumHeightInput.replace(',', '.'));
      if (!Number.isFinite(height) || height <= 0) {
        setMaximumHeightError(true);
        return;
      }
      setVehicle((current) => ({ ...current, maximumHeightCm: height }));
      setMaximumHeightInput(String(height));
    } else {
      const heights = wedgeHeightInputs.map((value) => Number(value.replace(',', '.')));
      const errors = heights.map((height) => !Number.isFinite(height) || height <= 0);
      setWedgeHeightErrors(errors);
      if (errors.some(Boolean)) return;
      heights.sort((a, b) => a - b);
      setVehicle((current) => ({ ...current, wedgeHeightsCm: heights }));
      setWedgeHeightInputs(heights.map(String));
    }
    setSetupConfirmed((current) => ({
      ...current,
      [vehicle.levelingMode === 'height' ? 'height' : 'wedges']: true,
    }));
  };

  const selectSource = async (nextSource) => {
    dragStart.current = null;
    cancelCalibrationHold();
    setCalibrationComplete(false);
    setSourceMessage('');
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
          <div className="brand-heading">
            <h1>KEIL<span>OMAT</span> <small>{pwa.standalone ? 'APP' : 'WEB'}</small></h1>
            <button
              className={`offline-button${pwa.updateAvailable ? ' has-update' : ''}`}
              type="button"
              aria-haspopup="dialog"
              aria-label={`${t('App and updates')}${pwa.updateAvailable ? ` · ${t('An update is available.')}` : ''}`}
              title={`${t('App and updates')}${pwa.updateAvailable ? ` · ${t('An update is available.')}` : ''}`}
              onClick={() => {
                refreshOfflineStatus();
                setActiveMenu('offline');
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v11m-4-4 4 4 4-4M4 16v4h16v-4" />
              </svg>
            </button>
            <AppDropdown
              className="language-select"
              label={t('Language')}
              value={language}
              options={[{ value: 'en', label: 'EN' }, { value: 'de', label: 'DE' }]}
              onChange={(value) => setLanguage(normalizeLanguage(value))}
            />
          </div>
        </div>
        <div className="source-picker" role="group" aria-label={t('Select data source')}>
          {[
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
              aria-label={`${t(option.label)}: ${t(option.available ? 'available' : 'unavailable')}`}
              onClick={() => selectSource(option.id)}
            >
              <span className="source-icon" aria-hidden="true">
                {option.id === 'external' ? (
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M7 7 17 17 12 22V2l5 5L7 17" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" role="presentation">
                    <rect x="6.5" y="2.5" width="11" height="19" rx="2" />
                    <path d="M10 5h4M10 18.5h4" />
                  </svg>
                )}
              </span>
              <span>{t(option.label)}</span>
              <span className="source-availability">
                {t(option.available ? 'LIVE' : 'OFFLINE')}
              </span>
            </button>
          ))}
        </div>
      </header>

      {pwa.updateAvailable && (
        <div className="pwa-update" role="status">
          <span>{t('An update is available.')}</span>
          <button type="button" onClick={applyUpdate} disabled={pwa.updating}>
            {t(pwa.updating ? 'UPDATING…' : 'UPDATE')}
          </button>
          {pwa.error && <span role="alert">{t(pwa.error)}</span>}
        </div>
      )}

      <main className="main-screen">
        <div className="telemetry">
          <div className="telemetry-item">
            <span className="eyebrow">{t('PITCH')}</span>
            <strong>
              {currentPitch === null ? '—' : currentPitch.toFixed(1)}
              {currentPitch !== null && <small>°</small>}
            </strong>
          </div>
          <span className="telemetry-divider" />
          <div className="telemetry-item">
            <span className="eyebrow">{t('ROLL')}</span>
            <strong>
              {currentRoll === null ? '—' : currentRoll.toFixed(1)}
              {currentRoll !== null && <small>°</small>}
            </strong>
          </div>
        </div>

        <section className="hero-panel" aria-label={t('Leveling recommendation')}>
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
              <span>{t('TOP VIEW')}{source === 'simulation' ? ` · ${t('SIMULATION')}` : ''}</span>
              {source === 'simulation' && (
                <div
                  className={`simulator-stage${vehicle.wheelbaseCm > 300 ? ' long-wheelbase' : ''}`}
                  role="application"
                  aria-label={t('Simulate vehicle tilt. Drag vertically for pitch and horizontally for roll, or use the arrow keys. Calibrated pitch {pitch} degrees, roll {roll} degrees. Simulated sensor range is ±{max} degrees.', {
                    pitch: currentPitch.toFixed(1),
                    roll: currentRoll.toFixed(1),
                    max: SIMULATION_MAX_TILT,
                  })}
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
                        transform: `rotateX(${currentPitch}deg) rotateY(${currentRoll}deg)`,
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
              t={t}
              language={language}
            />
          </div>

        </section>

        <div className="action-area">
          <button
            className={`calibrate-button${needsCalibration ? ' needs-calibration' : ''} ${isHoldingCalibration ? 'is-holding' : ''} ${
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
            aria-label={`${source === 'external'
              ? t('Hold for 3 seconds to calibrate the sensor on level ground')
              : t('Hold for 3 seconds to overwrite calibration slot {slot} on level ground', {
                  slot: activeSlotLabel,
                })}${needsCalibration ? ` · ${t('Calibration needed')}` : ''}`}
          >
            <span className="calibrate-icon" aria-hidden="true">
              {calibrationComplete ? '✓' : isHoldingCalibration ? '···' : '◎'}
            </span>
            <span>
              {calibrationComplete
                ? t(source === 'external' ? 'SENSOR CALIBRATED' : 'SLOT UPDATED')
                : isHoldingCalibration
                  ? t('KEEP HOLDING')
                  : source === 'external'
                    ? t('HOLD TO CALIBRATE SENSOR')
                    : t('HOLD TO SET SLOT {slot}', { slot: activeSlotLabel })}
            </span>
            {!calibrationComplete && <span className="hold-duration">{t('3 SEC')}</span>}
          </button>
          {source !== 'external' && (
            <div
              className="quick-calibrations"
              role="group"
              aria-label={t('Select {source} calibration slot', {
                source: t(calibrationSourceLabels[calibrationSlotSource]),
              })}
            >
              {calibrationSlots[calibrationSlotSource].map((slot, index) => {
                const isSelected = slot.id === activeSlotId;
                const isCalibrated = slot.pitch !== null && slot.roll !== null;
                const label = slot.name.trim() || t('SLOT {slot}', { slot: index + 1 });

                return (
                  <button
                    className={`quick-calibration-button${isSelected ? ' selected' : ''}${
                      isCalibrated ? ' calibrated' : ' empty'
                    }`}
                    key={slot.id}
                    type="button"
                    aria-label={`${label}, ${
                      t(isCalibrated ? 'calibrated' : 'not calibrated')
                    }${isSelected ? t(', selected') : ''}`}
                    aria-pressed={isSelected}
                    title={`${label} · ${
                      t(isCalibrated ? 'Calibrated' : 'Not calibrated')
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
                      {t(isCalibrated ? 'CALIBRATED' : 'NOT CALIBRATED')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <nav className="bottom-menu" aria-label={t('Configuration, help and feedback')}>
        <button
          className={`menu-button${activeMenu === 'vehicle' ? ' selected' : ''}${!setupConfirmed.vehicle ? ' needs-setup' : ''}`}
          type="button"
          aria-haspopup="dialog"
          aria-label={`${t('VEHICLE')}${!setupConfirmed.vehicle ? ` · ${t('Confirmation needed')}` : ''}`}
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
          <span>{t('VEHICLE')}</span>
        </button>
        <span className="menu-divider" />
        <button
          className={`menu-button${activeMenu === 'wedges' ? ' selected' : ''}${!wedgesConfirmed ? ' needs-setup' : ''}`}
          type="button"
          aria-haspopup="dialog"
          aria-label={`${t('WEDGES')}${!wedgesConfirmed ? ` · ${t('Confirmation needed')}` : ''}`}
          onClick={() => setActiveMenu('wedges')}
        >
          <span className="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 19h16L4 5Z" />
            </svg>
          </span>
          <span>{t('WEDGES')}</span>
        </button>
        <span className="menu-divider" />
        <button
          className={activeMenu === 'calibration' ? 'menu-button selected' : 'menu-button'}
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            setCalibrationSettingsSource(source === 'external' ? 'phone' : source);
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
          <span>{t('CALIBRATION')}</span>
        </button>
        <span className="menu-divider" />
        <button
          className={activeMenu === 'help' ? 'menu-button help-button selected' : 'menu-button help-button'}
          type="button"
          aria-haspopup="dialog"
          aria-label={t('Help')}
          title={t('Help')}
          onClick={() => setActiveMenu('help')}
        >
          <span className="menu-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 9a2.5 2.5 0 1 1 3.9 2.1c-1 .7-1.4 1.1-1.4 2.4M12 17h.01" />
            </svg>
          </span>
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
          aria-label={t('Send feedback')}
          title={t('Send feedback')}
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
                  {t(activeMenu === 'feedback' ? 'FRIEND BETA' : activeMenu === 'help' ? 'GUIDE' : activeMenu === 'offline' ? 'APP' : 'CONFIGURATION')}
                </span>
                <h2 id="menu-title">
                  {t(activeMenu === 'vehicle'
                    ? 'Vehicle setup'
                    : activeMenu === 'wedges'
                      ? 'Wedge setup'
                      : activeMenu === 'calibration'
                        ? 'Rename calibration slots'
                        : activeMenu === 'help'
                          ? 'How it works'
                          : activeMenu === 'offline'
                            ? 'App and updates'
                          : 'Send feedback')}
                </h2>
              </div>
              <button
                className="close-menu"
                type="button"
                aria-label={t('Close dialog')}
                onClick={() => setActiveMenu(null)}
              >
                ×
              </button>
            </header>

            {activeMenu !== 'feedback' && activeMenu !== 'help' && activeMenu !== 'offline' && (
              <div className="menu-tabs" role="tablist" aria-label={t('Configuration sections')}>
                <button
                  className={`menu-tab${activeMenu === 'vehicle' ? ' active' : ''}${!setupConfirmed.vehicle ? ' needs-setup' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={activeMenu === 'vehicle'}
                  aria-label={`${t('VEHICLE')}${!setupConfirmed.vehicle ? ` · ${t('Confirmation needed')}` : ''}`}
                  onClick={() => setActiveMenu('vehicle')}
                >
                  {t('VEHICLE')}
                </button>
                <button
                  className={`menu-tab${activeMenu === 'wedges' ? ' active' : ''}${!wedgesConfirmed ? ' needs-setup' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={activeMenu === 'wedges'}
                  aria-label={`${t('WEDGES')}${!wedgesConfirmed ? ` · ${t('Confirmation needed')}` : ''}`}
                  onClick={() => setActiveMenu('wedges')}
                >
                  {t('WEDGES')}
                </button>
                <button
                  className={activeMenu === 'calibration' ? 'menu-tab active' : 'menu-tab'}
                  type="button"
                  role="tab"
                  aria-selected={activeMenu === 'calibration'}
                  onClick={() => setActiveMenu('calibration')}
                >
                  {t('CALIBRATION')}
                </button>
              </div>
            )}

            {activeMenu === 'vehicle' ? (
              <div className="menu-content">
                <div className="settings-card vehicle-preview">
                  <span className="eyebrow">{t('VEHICLE DIMENSIONS · TOP VIEW')}</span>
                  <VehicleDiagram
                    className="vehicle-svg"
                    vehicle={vehicle}
                    t={t}
                    language={language}
                    showMeasurements
                  />
                </div>
                <div className="settings-card input-group">
                  <label>
                    {t('Wheelbase')} <span>CM</span>
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
                        {t('Enter a value between {min} and {max} cm.', vehicleInputErrors.wheelbaseCm)}
                      </small>
                    )}
                  </label>
                  <label>
                    {t('Track width')} <span>CM</span>
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
                        {t('Enter a value between {min} and {max} cm.', vehicleInputErrors.trackWidthCm)}
                      </small>
                    )}
                  </label>
                </div>
                {!setupConfirmed.vehicle && (
                  <button className="feedback-submit" type="button" onClick={confirmVehicle}>
                    {t('CONFIRM VEHICLE DIMENSIONS')}
                  </button>
                )}
              </div>
            ) : activeMenu === 'wedges' ? (
              <div className="menu-content">
                <div className="settings-card wedge-settings">
                  <label className="level-mode-switch">
                    <span>{t('WEDGES')}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={t('Height mode')}
                      checked={vehicle.levelingMode === 'height'}
                      onChange={(event) => {
                        setVehicle((current) => ({
                          ...current,
                          levelingMode: event.target.checked ? 'height' : 'wedge',
                        }));
                      }}
                    />
                    <span className="level-mode-track" aria-hidden="true" />
                    <span>{t('HEIGHT')}</span>
                  </label>
                  <div className="wedge-illustration">
                    <svg viewBox="0 0 320 220" role="img" aria-labelledby="wedge-example-title">
                      <title id="wedge-example-title">
                        {t(vehicle.levelingMode === 'height'
                          ? 'Side view of a vehicle wheel resting on a rock'
                          : 'Side view of a vehicle wheel resting on a stepped wedge')}
                      </title>
                      {vehicle.levelingMode === 'height' ? (
                        <path className="wedge-example-body" d="M20 188 28 174 49 170 61 158 85 160 99 150 122 152 139 145 158 153 177 151 194 160 215 160 232 171 253 172 270 183 290 185 300 197H20Z" />
                      ) : (
                        <>
                          <path className="wedge-example-body" d="M20 123 300 190V197H20Z" />
                          {vehicle.wedgeHeightsCm.slice(1).map((_, index) => {
                            const fraction = (index + 1) / vehicle.wedgeHeightsCm.length;
                            const x = 20 + 280 * fraction;
                            return (
                              <line
                                key={index}
                                className="wedge-example-seams"
                                x1={x}
                                y1={123 + 67 * fraction}
                                x2={x}
                                y2="197"
                              />
                            );
                          })}
                          {vehicle.wedgeHeightsCm.map((_, index) => (
                            <text
                              className="wedge-example-label"
                              key={index}
                              x={20 + (280 * (index + 0.5)) / vehicle.wedgeHeightsCm.length}
                              y="213"
                            >
                              {vehicle.wedgeHeightsCm.length - index}
                            </text>
                          ))}
                        </>
                      )}
                      <path className="wedge-example-car" d="M0 58H64C70 26 96 10 138 10S206 26 212 58H320" />
                      <circle className="wedge-example-wheel" cx="138" cy="83" r="66" />
                      <circle className="wedge-example-rim" cx="138" cy="83" r="42" />
                      <path className="wedge-example-spokes" d="M138 41V125M96 83H180M108 53 168 113M168 53 108 113" />
                      <circle className="wedge-example-hub" cx="138" cy="83" r="8" />
                    </svg>
                    <span>{t('Side view')}</span>
                  </div>
                  {vehicle.levelingMode === 'height' ? (
                    <label className="maximum-height">
                      <span>{t('Maximum height')} <span className="wedge-unit">CM</span></span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={maximumHeightInput}
                        aria-invalid={maximumHeightError}
                        aria-describedby={maximumHeightError ? 'maximum-height-error' : undefined}
                        onChange={(event) => {
                          setMaximumHeightInput(event.target.value);
                          setMaximumHeightError(false);
                        }}
                        onBlur={saveMaximumHeight}
                      />
                      {maximumHeightError && (
                        <small className="input-error" id="maximum-height-error">
                          {t('Enter a height greater than 0 cm.')}
                        </small>
                      )}
                    </label>
                  ) : (
                    <>
                      <div className="wedge-list">
                        {wedgeHeightInputs.map((height, index) => (
                          <label className="wedge-row" key={`wedge-${index}`}>
                            <span>{t('STEP {step}', { step: index + 1 })}</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={height}
                              aria-label={t('Height of step {step} in centimeters', { step: index + 1 })}
                              aria-invalid={Boolean(wedgeHeightErrors[index])}
                              aria-describedby={wedgeHeightErrors[index] ? `wedge-height-error-${index}` : undefined}
                              onChange={(event) => handleWedgeHeightChange(index, event.target.value)}
                              onBlur={() => saveWedgeHeight(index)}
                            />
                            <span className="wedge-unit">CM</span>
                            <button
                              className="remove-wedge"
                              type="button"
                              aria-label={t('Remove step {step}', { step: index + 1 })}
                              disabled={wedgeHeightInputs.length <= 1}
                              onClick={() => removeWedgeHeight(index)}
                            >
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" />
                              </svg>
                            </button>
                            {wedgeHeightErrors[index] && (
                              <small className="input-error wedge-height-error" id={`wedge-height-error-${index}`}>
                                {t('Enter a height greater than 0 cm.')}
                              </small>
                            )}
                          </label>
                        ))}
                      </div>
                      <button
                        className="add-wedge"
                        type="button"
                        disabled={vehicle.wedgeHeightsCm.length >= MAX_WEDGE_STEPS
                          || wedgeHeightInputs.some((value) => {
                            const height = Number(value.replace(',', '.'));
                            return !Number.isFinite(height) || height <= 0;
                          })}
                        onClick={addWedgeHeight}
                      >
                        {t('+ ADD STEP')}
                      </button>
                    </>
                  )}
                </div>
                {!wedgesConfirmed && (
                  <button className="feedback-submit" type="button" onClick={confirmWedges}>
                    {t(vehicle.levelingMode === 'height' ? 'CONFIRM MAXIMUM HEIGHT' : 'CONFIRM WEDGE HEIGHTS')}
                  </button>
                )}
              </div>
            ) : activeMenu === 'calibration' ? (
              <div className="menu-content calibration-content">
                <div className="settings-card calibration-settings-card">
                  {simulationEnabled && (
                    <div className="calibration-sensor">
                      <span>{t('Sensor')}</span>
                      <AppDropdown
                        label={t('Sensor')}
                        value={calibrationSettingsSource}
                        options={[
                          { value: 'simulation', label: t('Simulation') },
                          { value: 'phone', label: t('Phone sensor') },
                        ]}
                        onChange={setCalibrationSettingsSource}
                      />
                    </div>
                  )}
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
                            <span>{t('SLOT {slot}', { slot: index + 1 })}</span>
                            <small>{isSelected ? t('SELECTED ON MAIN SCREEN') : ''}</small>
                          </div>
                          <div className="calibration-slot-detail">
                            <label className="calibration-slot-name">
                              <span>{t('Name')} <small>{t('OPTIONAL')}</small></span>
                              <input
                                type="text"
                                maxLength={60}
                                placeholder={t('Slot {slot}', { slot: index + 1 })}
                                value={slot.name}
                                aria-label={t('Name for {source} slot {slot}', {
                                  source: t(calibrationSourceLabels[calibrationSettingsSource]),
                                  slot: index + 1,
                                })}
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
                                  <span>{t('Pitch')} {formatCalibrationAngle(slot.pitch)}</span>
                                  <span>{t('Roll')} {formatCalibrationAngle(slot.roll)}</span>
                                </>
                              ) : (
                                t('Not calibrated')
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : activeMenu === 'help' ? (
              <HelpContent t={t} source={source} levelingMode={vehicle.levelingMode} />
            ) : activeMenu === 'offline' ? (
              <div className="menu-content pwa-content">
                {pwa.offline !== 'ready' && (
                  <div className="settings-card">
                    <p role="status">
                      {t(pwa.offline === 'checking'
                        ? 'Preparing offline access…'
                        : 'Offline access is unavailable.')}
                    </p>
                  </div>
                )}
                {!pwa.online && <p>{t('You are offline.')}</p>}
                {!pwa.standalone && !pwa.installed && /Android/i.test(navigator.userAgent) && (
                  pwa.canInstall ? (
                    <button className="feedback-submit" type="button" onClick={installApp}>
                      {t('ADD TO HOME SCREEN')}
                    </button>
                  ) : (
                    <p>{t('If not installed, use “Install app” or “Add to Home screen” in your browser menu.')}</p>
                  )
                )}
                {pwa.updateCheckResult && <p role="status">{t(pwa.updateCheckResult)}</p>}
                <button
                  className="feedback-submit"
                  type="button"
                  disabled={(!pwa.online && !pwa.updateAvailable) || pwa.checkingUpdate || pwa.updating}
                  onClick={pwa.updateAvailable ? applyUpdate : checkForUpdates}
                >
                  {t(pwa.updating ? 'UPDATING…' : pwa.checkingUpdate ? 'CHECKING…' : pwa.updateAvailable ? 'UPDATE' : 'CHECK FOR UPDATES')}
                </button>
                {pwa.error && <p className="input-error" role="alert">{t(pwa.error)}</p>}
              </div>
            ) : (
              <div className="menu-content">
                <FeedbackForm endpoint={FORMSPREE_ENDPOINT} t={t} online={pwa.online} />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
