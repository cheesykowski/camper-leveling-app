import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
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
import { updateMotionOrientation } from './motionOrientation.js';
import { getSetupProgress, nextSetupStep } from './setupProgress.js';
import { calculateSunEvents, compassHeading, sunArcPoints, sunLabelPositions, sunMarkerPosition } from './sun.js';

const STORAGE_KEY = 'camper-leveling-demo-v1';
const SIMULATION_MAX_TILT = 30;
const SENSOR_STALE_TIMEOUT_MS = 10000;
const MAX_WEDGE_STEPS = 5;
const HEIGHT_MODE_TOLERANCE_CM = 3;
const FORMSPREE_ENDPOINT = import.meta.env.VITE_FORMSPREE_ENDPOINT?.trim() || '';

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
  phoneMotion: 'Phone sensor',
  external: 'External sensor',
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function CalibrationSlotButtons({ slots, selectedId, sourceName, t, onSelect, onStartHold, onCancelHold, holdingSlotId }) {
  const canHold = Boolean(onStartHold);
  return (
    <div
      className="quick-calibrations"
      role="group"
      aria-label={t('Select {source} calibration slot', { source: t(calibrationSourceLabels[sourceName]) })}
    >
      {slots.map((slot, index) => {
        const isSelected = slot.id === selectedId;
        const isCalibrated = slot.pitch !== null && slot.roll !== null;
        const label = slot.name.trim() || t('SLOT {slot}', { slot: index + 1 });
        const status = t(isCalibrated ? 'calibrated' : 'not calibrated');
        return (
          <button
            className={`quick-calibration-button${isSelected ? ' selected' : ''}${isCalibrated ? ' calibrated' : ' empty'}${holdingSlotId === slot.id ? ' is-holding' : ''}${canHold ? ' can-hold' : ''}`}
            key={slot.id}
            type="button"
            aria-label={`${label}, ${status}${isSelected ? t(', selected') : ''}${canHold ? ` · ${t('Hold for 3 seconds to calibrate')}` : ''}`}
            aria-pressed={isSelected}
            title={`${label} · ${t(isCalibrated ? 'Calibrated' : 'Not calibrated')}`}
            onClick={() => onSelect(slot.id)}
            onPointerDown={canHold ? (event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              onStartHold(slot.id);
            } : undefined}
            onPointerUp={canHold ? onCancelHold : undefined}
            onPointerCancel={canHold ? onCancelHold : undefined}
            onLostPointerCapture={canHold ? onCancelHold : undefined}
            onBlur={canHold ? onCancelHold : undefined}
            onKeyDown={canHold ? (event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                if (!event.repeat) onStartHold(slot.id);
              }
            } : undefined}
            onKeyUp={canHold ? (event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                onCancelHold();
                onSelect(slot.id);
              }
            } : undefined}
            onContextMenu={canHold ? (event) => event.preventDefault() : undefined}
          >
            <span className="quick-calibration-name">{label}</span>
            <span className="quick-calibration-status">{t(isCalibrated ? 'CALIBRATED' : 'NOT CALIBRATED')}</span>
          </button>
        );
      })}
    </div>
  );
}

function SunSymbol({ event }) {
  return (
    <g className="sun-symbol">
      <circle cx="0" cy="-2" r="4" />
      {event === 'solarNoon' ? (
        <path d="M0-10v2M0 4v2M-8-2h2M6-2h2M-6-8l1.5 1.5M4.5 2.5 6 4M6-8 4.5-6.5M-4.5 2.5-6 4" />
      ) : (
        <>
          <path d="M-8 4h16" />
          {event === 'sunrise' ? <path d="M9 1v-8m-3 3 3-3 3 3" /> : <path d="M9-7v8m-3-3 3 3 3-3" />}
        </>
      )}
    </g>
  );
}

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
              {recommendation?.axis === 'unavailable'
                ? t('{wheel}: recommendation unavailable', { wheel: t(wheel.label) })
                : active
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

function requestSunData() {
  const location = new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ error: 'Location is unavailable in this browser.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => resolve({ error: error.code === 1
        ? 'Location permission was denied. Allow access and reopen this view.'
        : 'Could not get your location. Check GPS and reopen this view.' }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
  let compass;
  if (!('DeviceOrientationEvent' in window)) {
    compass = Promise.resolve('unavailable');
  } else if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
    try {
      compass = window.DeviceOrientationEvent.requestPermission(true).then(
        (permission) => permission === 'granted' ? 'granted' : 'denied',
        () => 'failed',
      );
    } catch {
      compass = Promise.resolve('failed');
    }
  } else {
    compass = Promise.resolve('granted');
  }
  return { location, compass };
}

function SunView({ vehicle, t, language, request }) {
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('Finding your location…');
  const [compassStatus, setCompassStatus] = useState('Waiting for compass…');
  const [compassEnabled, setCompassEnabled] = useState(false);
  const [heading, setHeading] = useState(null);
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    request.location.then(
      (result) => {
        if (!active) return;
        if (result.error) setLocationStatus(result.error);
        else {
          setLocation(result);
          setLocationStatus('');
        }
      },
      () => {
        if (active) setLocationStatus('Could not get your location. Check GPS and reopen this view.');
      },
    );
    request.compass.then((result) => {
      if (!active) return;
      if (result === 'granted') setCompassEnabled(true);
      else setCompassStatus(result === 'denied'
        ? 'Compass permission was denied. Times are still shown.'
        : result === 'failed'
          ? 'Compass permission failed. Times are still shown.'
          : 'Compass unavailable. Times are still shown.');
    });
    return () => { active = false; };
  }, [request]);

  useEffect(() => {
    if (!compassEnabled) return undefined;
    let timeout;
    const noSignal = () => {
      setHeading(null);
      setCompassStatus('Compass unavailable. Times are still shown.');
    };
    const onOrientation = (event) => {
      const angle = window.screen.orientation?.angle ?? window.orientation ?? 0;
      if (angle !== 0) {
        setHeading(null);
        setCompassStatus('Use portrait orientation for compass directions.');
        return;
      }
      const value = compassHeading(event, angle);
      if (value === null) return;
      setHeading(value);
      setCompassStatus('');
      window.clearTimeout(timeout);
      timeout = window.setTimeout(noSignal, 10000);
    };
    timeout = window.setTimeout(noSignal, 10000);
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('deviceorientationabsolute', onOrientation);
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [compassEnabled]);

  const events = useMemo(
    () => location ? calculateSunEvents(today, location.latitude, location.longitude) : null,
    [today, location],
  );
  const items = [
    { key: 'sunrise', label: 'Sunrise', x: 45, y: 94 },
    { key: 'solarNoon', label: 'Highest point', x: 180, y: 23 },
    { key: 'sunset', label: 'Sunset', x: 315, y: 94 },
  ];
  const markers = events && heading !== null
    ? sunLabelPositions(items.filter((item) => events[item.key]).map((item) => ({
        key: item.key,
        azimuth: events[item.key].azimuth,
        heading,
      })))
    : [];
  const arcs = useMemo(() => events ? [
    sunArcPoints(events.sunrise, events.solarNoon, location.latitude, location.longitude, 0),
    sunArcPoints(events.solarNoon, events.sunset, location.latitude, location.longitude, 0),
  ] : [], [events, location]);
  const timeFormatter = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="sun-view">
      {locationStatus && <p role="status">{t(locationStatus)}</p>}
      {compassStatus && <p role="status">{t(compassStatus)}</p>}
      {events && (
        <>
          <p>{new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(today)}</p>
          {heading === null ? (
            <svg className="sun-arc" viewBox="0 0 360 135" role="img" aria-label={items.map((item) => {
              const event = events[item.key];
              return `${t(item.label)}: ${event ? timeFormatter.format(event.time) : t('No event today')}`;
            }).join(' · ')}>
              <path className="sun-arc-line" d="M45 94 A135 71 0 0 1 315 94" />
              {items.map((item) => (
                <g key={item.key} transform={`translate(${item.x} ${item.y})`}>
                  <SunSymbol event={item.key} />
                  <text y="28" textAnchor="middle">{events[item.key] ? timeFormatter.format(events[item.key].time) : '—'}</text>
                </g>
              ))}
            </svg>
          ) : (
            <div className="sun-diagram">
              <svg className="sun-directions" viewBox="0 0 480 480" role="img" aria-label={items.map((item) => {
                const event = events[item.key];
                return `${t(item.label)}: ${event ? timeFormatter.format(event.time) : t('No event today')}`;
              }).join(' · ')}>
                <g transform={`rotate(${-heading} 240 240)`}>
                  {arcs.map((points, index) => points.length > 0 && (
                    <polyline className="sun-arc-line" key={index} points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
                  ))}
                </g>
                {markers.map((marker) => {
                  const point = sunMarkerPosition(marker.azimuth, heading);
                  return (
                    <g key={marker.key}>
                      <line className="sun-label-line" x1={point.x} y1={point.y} x2={marker.x} y2={marker.y} />
                      <g transform={`translate(${point.x} ${point.y}) scale(1.5)`}><SunSymbol event={marker.key} /></g>
                      <text x={marker.x} y={marker.y + 5} textAnchor="middle">{timeFormatter.format(events[marker.key].time)}</text>
                    </g>
                  );
                })}
              </svg>
              <VehicleDiagram className="sun-vehicle-svg" vehicle={vehicle} t={t} language={language} />
            </div>
          )}
          {heading !== null && items.filter((item) => !events[item.key]).map((item) => (
            <p key={item.key}>{t(item.label)}: {t('No event today')}</p>
          ))}
          <details className="sun-info">
            <summary aria-label={t('Sun view information')}>ⓘ</summary>
            <p>{t('See today’s sun directions relative to your vehicle. Place the phone flat, screen up, in portrait orientation with its top toward the vehicle’s front.')}</p>
            <p>{t('Bearings are true north. Compass directions are approximate and may use magnetic north; calibrate your phone and keep it away from metal. Solar noon can be below the horizon.')}</p>
            <p>{t('Times use the device time zone. A dash means no event today.')}</p>
          </details>
        </>
      )}
    </div>
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
      ) : type === 'calibration-level' ? (
        <>
          <path d="M12 59h76M19 54V40l8-5 7-10h31l8 10 8 5v14" />
          <circle cx="32" cy="54" r="5" /><circle cx="68" cy="54" r="5" />
          <rect x="29" y="9" width="42" height="10" rx="2" />
          <circle cx="50" cy="14" r="3" /><path d="M36 12v4M64 12v4" />
        </>
      ) : type === 'calibration-hold' ? (
        <>
          <rect x="9" y="12" width="82" height="24" rx="3" />
          <path d="M36 12v24M64 12v24M17 24h11M45 24h10M72 24h11" />
          <path d="M44 64 34 51c-2-3 1-6 4-4l6 5V29c0-5 7-5 7 0v12c2-3 6-1 6 2 3-3 7-1 7 2 3-2 7 0 7 4l-3 15" />
          <path d="M42 20l-4-4m21 0-4 4" />
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

function CalibrationInstructions({ t }) {
  const steps = [
    {
      icon: 'calibration-level',
      title: 'Find a level reference',
      text: 'First level the parked vehicle using a spirit level.',
    },
    {
      icon: 'phone',
      title: 'Place the phone',
      text: 'Place it flat and securely, screen up and top toward the vehicle’s front.',
    },
    {
      icon: 'calibration-hold',
      title: 'Calibrate a slot',
      text: 'Keep the phone in place and hold a slot for 3 seconds.',
    },
  ];

  return (
    <>
      <ol className="calibration-steps">
        {steps.map((step, index) => (
          <li key={step.title}>
            <div className="calibration-step-illustration">
              <HelpIllustration type={step.icon} />
              <span aria-hidden="true">{index + 1}</span>
            </div>
            <div>
              <strong>{t(step.title)}</strong>
              <p>{t(step.text)}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="calibration-position-hint">
        {t('Use a separate slot for each phone position, such as the dashboard or table. When measuring, select the matching slot and use the same position and orientation as during calibration.')}
      </p>
    </>
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
          ? { icon: 'level', title: 'Calibrate', text: 'With the phone in place, open Calibration and hold a slot for 3 seconds. Calibrate a separate slot for each phone position.' }
          : { icon: 'level', title: 'Calibrate', text: 'Once external sensors are supported, select EXTERNAL and calibrate the sensor in Calibration.' },
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
  const [motionSensorData, setMotionSensorData] = useState({ pitch: 0, roll: 0, available: false });
  const motionSensorDataRef = useRef(motionSensorData);
  const [motionSensorStatus, setMotionSensorStatus] = useState('');
  const [motionPermissionGranted, setMotionPermissionGranted] = useState(
    () => !!window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission !== 'function',
  );
  const motionRequestId = useRef(0);
  const [simulatedTilt, setSimulatedTilt] = useState({ pitch: 0, roll: 0 });
  const simulatedTiltRef = useRef(simulatedTilt);
  const [selectedSource, setSource] = useState(() => initialSensorSource(window.location.search, pwa.standalone));
  const source = pwa.standalone && selectedSource === 'simulation' ? 'phone' : selectedSource;
  const phoneSensorData = motionSensorData;
  const calibrationSlotSource = source === 'phone' ? 'phoneMotion' : source;
  const [sourceMessage, setSourceMessage] = useState('');
  const dragStart = useRef(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [setupFlowActive, setSetupFlowActive] = useState(false);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const sideMenuRef = useRef(null);
  const sideMenuButtonRef = useRef(null);
  const sideMenuCloseRef = useRef(null);
  const menuSheetRef = useRef(null);
  const menuDialogCloseRef = useRef(null);
  const sideDialogOriginRef = useRef(null);
  const [sunRequest, setSunRequest] = useState(null);
  const [holdingSlotId, setHoldingSlotId] = useState(null);
  const [calibrationComplete, setCalibrationComplete] = useState(null);
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
    const { phoneRelative: _relativeSlots, ...storedSlots } = calibrationSlots;
    const { phoneRelative: _relativeSlotId, ...storedSlotIds } = calibrationSlotIds;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        language,
        calibrationSlots: storedSlots,
        calibrationSlotIds: storedSlotIds,
        vehicle,
        setupConfirmed,
      }),
    );
  }, [language, calibrationSlots, calibrationSlotIds, vehicle, setupConfirmed]);

  useEffect(() => {
    if (source !== 'phone') return undefined;
    if (!window.DeviceMotionEvent) {
      setMotionSensorStatus('Motion sensor is not supported by this browser.');
      return undefined;
    }
    if (!motionPermissionGranted) {
      setMotionSensorStatus('Tap PHONE to allow motion sensor access.');
      return undefined;
    }
    let filter = null;
    let timeout;
    const unavailable = (message) => {
      window.clearTimeout(timeout);
      filter = null;
      if (calibrationCaptureSource.current === 'phoneMotion') cancelCalibrationHold();
      const next = { ...motionSensorDataRef.current, available: false };
      motionSensorDataRef.current = next;
      setMotionSensorData(next);
      setMotionSensorStatus(message);
      setCalibrationComplete(null);
    };
    const waitForSignal = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(
        () => unavailable('No signal from the motion sensor.'),
        SENSOR_STALE_TIMEOUT_MS,
      );
    };
    const onMotion = (event) => {
      if (document.hidden) return;
      try {
        filter = updateMotionOrientation(filter, event.accelerationIncludingGravity, event.rotationRate, event.timeStamp);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        unavailable('Invalid motion sensor reading. Accelerometer and gyroscope are required.');
        return;
      }
      const next = { pitch: filter.pitch, roll: filter.roll, available: true };
      if (calibrationCaptureSource.current === 'phoneMotion') calibrationSamples.current.push(next);
      motionSensorDataRef.current = next;
      setMotionSensorData(next);
      setMotionSensorStatus('');
      waitForSignal();
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        unavailable('No signal from the motion sensor.');
      } else {
        setMotionSensorStatus('Waiting for the motion sensor…');
        waitForSignal();
      }
    };
    setMotionSensorStatus('Waiting for the motion sensor…');
    waitForSignal();
    window.addEventListener('devicemotion', onMotion);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('devicemotion', onMotion);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      motionSensorDataRef.current = { ...motionSensorDataRef.current, available: false };
      setMotionSensorData(motionSensorDataRef.current);
    };
  }, [source, motionPermissionGranted]);

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

  useEffect(() => {
    if (!activeMenu) setSetupFlowActive(false);
    else if (menuSheetRef.current) menuSheetRef.current.scrollTop = 0;
  }, [activeMenu]);

  useEffect(() => {
    if (!sideMenuOpen) return undefined;
    sideMenuCloseRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSideMenuOpen(false);
        sideMenuButtonRef.current?.focus();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(sideMenuRef.current.querySelectorAll(
          'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getClientRects().length > 0
          && (element.tagName === 'SUMMARY' || !element.closest('details:not([open])')));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [sideMenuOpen]);

  useEffect(() => {
    if (!sideDialogOriginRef.current) return;
    if (activeMenu) {
      if (!document.activeElement?.closest('.menu-sheet')) menuDialogCloseRef.current?.focus();
    } else {
      const returnTarget = sideDialogOriginRef.current;
      (returnTarget?.isConnected ? returnTarget : sideMenuButtonRef.current)?.focus();
      sideDialogOriginRef.current = null;
    }
  }, [activeMenu]);

  useEffect(
    () => () => {
      if (calibrationTimeout.current !== null) {
        window.clearTimeout(calibrationTimeout.current);
      }
    },
    [],
  );

  const activeSlotId = calibrationSlotIds[calibrationSlotSource];
  const activeSlot = calibrationSlots[calibrationSlotSource].find((slot) => slot.id === activeSlotId);
  const activeSlotNumber = calibrationSlots[calibrationSlotSource].findIndex((slot) => slot.id === activeSlotId) + 1;
  const activeCalibration = getActiveCalibration(calibrationSlotSource, calibrationSlots, calibrationSlotIds);
  const needsCalibration = activeCalibration === null;
  const setupSensorAvailable = source === 'simulation' || (source === 'phone' && phoneSensorData.available);
  const currentRoll =
    !activeCalibration
      ? null
      : source === 'simulation'
        ? simulatedTilt.roll - activeCalibration.roll
        : source === 'phone' && phoneSensorData.available
          ? phoneSensorData.roll - activeCalibration.roll
          : null;
  const currentPitch =
    !activeCalibration
      ? null
      : source === 'simulation'
        ? simulatedTilt.pitch - activeCalibration.pitch
        : source === 'phone' && phoneSensorData.available
          ? phoneSensorData.pitch - activeCalibration.pitch
          : null;

  const recommendation = useMemo(() => {
    if (!setupSensorAvailable) {
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

    if (needsCalibration) {
      return {
        axis: 'unavailable',
        reason: 'calibration',
        title: t('Calibration needed'),
        description: t('Calibrate the selected slot before using leveling recommendations.'),
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
  }, [currentPitch, currentRoll, source, vehicle, t, language, needsCalibration, setupSensorAvailable]);

  const startCalibrationHold = (slotId) => {
    if (
      calibrationTimeout.current !== null ||
      (source !== 'simulation' && (source !== 'phone' || !phoneSensorData.available))
    ) return;

    setCalibrationComplete(null);
    setHoldingSlotId(slotId);
    const selectedSource = calibrationSlotSource;
    calibrationCaptureSource.current = selectedSource;
    const selectedSensor = motionSensorDataRef.current;
    calibrationSamples.current = selectedSource !== 'simulation'
      ? [{ pitch: selectedSensor.pitch, roll: selectedSensor.roll }]
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
        [selectedSource]: replaceCalibrationSlotOffsets(current[selectedSource], slotId, {
          pitch,
          roll,
        }),
      }));
      setCalibrationSlotIds((current) => ({ ...current, [selectedSource]: slotId }));
      calibrationSamples.current = [];
      calibrationCaptureSource.current = null;
      calibrationTimeout.current = null;
      setHoldingSlotId(null);
      setCalibrationComplete(slotId);
    }, 3000);
  };

  const cancelCalibrationHold = () => {
    if (calibrationTimeout.current !== null) {
      window.clearTimeout(calibrationTimeout.current);
      calibrationTimeout.current = null;
      calibrationSamples.current = [];
      calibrationCaptureSource.current = null;
      setHoldingSlotId(null);
    }
  };

  useEffect(() => {
    if (!phoneSensorData.available && calibrationCaptureSource.current === 'phoneMotion') {
      cancelCalibrationHold();
    }
  }, [phoneSensorData.available]);

  useEffect(() => () => cancelCalibrationHold(), [activeMenu, calibrationSlotSource]);

  useEffect(() => {
    if (pwa.standalone && selectedSource === 'simulation') {
      cancelCalibrationHold();
      setSource('phone');
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

  const setupProgress = getSetupProgress({
    vehicleConfirmed: setupConfirmed.vehicle,
    wedgesConfirmed,
    calibrated: !needsCalibration,
    sensorAvailable: setupSensorAvailable,
  });
  const additionalInfo = [
    recommendation.axis === 'unavailable'
      ? recommendation.reason === 'calibration'
        ? recommendation.description
        : source === 'phone' && motionSensorStatus
          ? t(motionSensorStatus)
          : sourceMessage ? t(sourceMessage) : recommendation.description
      : '',
    recommendation.wedgeCapacityExceeded
      ? t(vehicle.levelingMode === 'height'
        ? 'Required lift exceeds maximum height.'
        : 'Required lift exceeds wedge capacity.')
      : '',
    needsCalibration && !setupSensorAvailable
      ? t('Calibration needed')
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
    if (Object.keys(errors).length) return false;
    setVehicle((current) => ({
      ...current,
      wheelbaseCm: Number(vehicleInputs.wheelbaseCm),
      trackWidthCm: Number(vehicleInputs.trackWidthCm),
    }));
    setSetupConfirmed((current) => ({ ...current, vehicle: true }));
    return true;
  };

  const confirmWedges = () => {
    if (vehicle.levelingMode === 'height') {
      const height = Number(maximumHeightInput.replace(',', '.'));
      if (!Number.isFinite(height) || height <= 0) {
        setMaximumHeightError(true);
        return false;
      }
      setVehicle((current) => ({ ...current, maximumHeightCm: height }));
      setMaximumHeightInput(String(height));
    } else {
      const heights = wedgeHeightInputs.map((value) => Number(value.replace(',', '.')));
      const errors = heights.map((height) => !Number.isFinite(height) || height <= 0);
      setWedgeHeightErrors(errors);
      if (errors.some(Boolean)) return false;
      heights.sort((a, b) => a - b);
      setVehicle((current) => ({ ...current, wedgeHeightsCm: heights }));
      setWedgeHeightInputs(heights.map(String));
    }
    setSetupConfirmed((current) => ({
      ...current,
      [vehicle.levelingMode === 'height' ? 'height' : 'wedges']: true,
    }));
    return true;
  };

  const selectSource = async (nextSource) => {
    const requestId = ++motionRequestId.current;
    dragStart.current = null;
    cancelCalibrationHold();
    setCalibrationComplete(null);
    setSourceMessage('');
    if (nextSource === 'external') {
      setSource(nextSource);
      setSourceMessage('No external sensor is connected. Bluetooth support is not available yet.');
      return;
    }
    setSource(nextSource);
    if (!window.DeviceMotionEvent) {
      setMotionSensorStatus('Motion sensor is not supported by this browser.');
      return;
    }
    if (!motionPermissionGranted && typeof window.DeviceMotionEvent.requestPermission === 'function') {
      try {
        const permission = await window.DeviceMotionEvent.requestPermission();
        if (requestId !== motionRequestId.current) return;
        if (permission !== 'granted') {
          setMotionSensorStatus('Motion sensor access was denied.');
          return;
        }
        setMotionPermissionGranted(true);
      } catch (error) {
        if (requestId !== motionRequestId.current) return;
        console.error('Unable to access motion sensors:', error);
        setMotionSensorStatus('Motion sensor access failed.');
        return;
      }
    }
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

  const closeSideMenu = () => {
    setSideMenuOpen(false);
    sideMenuButtonRef.current?.focus();
  };

  const openSideDialog = (menu) => {
    sideDialogOriginRef.current = sideMenuOpen ? sideMenuButtonRef.current : document.activeElement;
    setSideMenuOpen(false);
    setActiveMenu(menu);
  };

  const selectCalibrationSlot = (sourceName, slotId) => {
    cancelCalibrationHold();
    setCalibrationSlotIds((current) => ({ ...current, [sourceName]: slotId }));
    if (calibrationComplete !== slotId) setCalibrationComplete(null);
  };

  const openCalibration = () => {
    setCalibrationComplete(null);
  };

  const advanceSetup = () => {
    const next = nextSetupStep(setupProgress.steps, activeMenu);
    if (next === 'calibration') openCalibration();
    if (!next) setSetupFlowActive(false);
    setActiveMenu(next);
  };

  const beginSetup = () => {
    setSetupFlowActive(true);
    if (setupProgress.next === 'calibration') openCalibration();
    openSideDialog(setupProgress.next);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>KEIL<span>OMAT</span> <small>{pwa.standalone ? 'APP' : 'WEB'}</small></h1>
        </div>
        <button
          ref={sideMenuButtonRef}
          className={`side-menu-toggle${pwa.updateAvailable || !setupConfirmed.vehicle || !wedgesConfirmed ? ' has-notice' : ''}`}
          type="button"
          aria-label={t('Open menu')}
          aria-expanded={sideMenuOpen}
          aria-controls="side-menu"
          onClick={() => setSideMenuOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
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

        {setupProgress.next && (
          <section className="setup-guide" aria-label={t('Setup progress')}>
            <div className="setup-guide-heading">
              <span>{t('Setup')}</span>
              <span>{t('{completed} of {total}', { completed: setupProgress.completed, total: setupProgress.steps.length })}</span>
            </div>
            <ol className="setup-guide-steps">
              {setupProgress.steps.map((step) => (
                <li key={step.id} className={step.complete ? 'complete' : ''}>
                  <span aria-hidden="true">{step.complete ? '✓' : '○'}</span>
                  {t(step.id === 'vehicle' ? 'VEHICLE' : step.id === 'wedges' ? (vehicle.levelingMode === 'height' ? 'HEIGHT' : 'WEDGES') : 'CALIBRATION')}
                  <span className="visually-hidden"> {t(step.complete ? 'Complete' : step.id === 'calibration' && !setupSensorAvailable ? 'unavailable' : 'Not complete')}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={beginSetup}
            >
              {t(setupProgress.next === 'vehicle'
                ? 'SET UP VEHICLE'
                : setupProgress.next === 'wedges'
                  ? 'SET UP SUPPORT'
                  : 'GO TO CALIBRATION')}
              <span aria-hidden="true"> →</span>
            </button>
          </section>
        )}

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
                  aria-label={t(needsCalibration
                    ? 'Simulate vehicle tilt. Drag vertically for pitch and horizontally for roll, or use the arrow keys. Uncalibrated simulated pitch {pitch} degrees, roll {roll} degrees. Simulated sensor range is ±{max} degrees.'
                    : 'Simulate vehicle tilt. Drag vertically for pitch and horizontally for roll, or use the arrow keys. Calibrated pitch {pitch} degrees, roll {roll} degrees. Simulated sensor range is ±{max} degrees.', {
                    pitch: (currentPitch === null ? simulatedTilt.pitch : currentPitch).toFixed(1),
                    roll: (currentRoll === null ? simulatedTilt.roll : currentRoll).toFixed(1),
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
                        transform: `rotateX(${currentPitch === null ? simulatedTilt.pitch : currentPitch}deg) rotateY(${currentRoll === null ? simulatedTilt.roll : currentRoll}deg)`,
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
          {source !== 'external' && (
            <CalibrationSlotButtons
              slots={calibrationSlots[calibrationSlotSource]}
              selectedId={activeSlotId}
              sourceName={calibrationSlotSource}
              t={t}
              onSelect={(slotId) => {
                const slot = calibrationSlots[calibrationSlotSource].find((item) => item.id === slotId);
                selectCalibrationSlot(calibrationSlotSource, slotId);
                if (slot.pitch === null || slot.roll === null) {
                  openCalibration();
                  openSideDialog('calibration');
                }
              }}
            />
          )}
        </div>
      </main>

      {sideMenuOpen && (
        <div
          className="side-menu-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSideMenu();
          }}
        >
          <aside
            ref={sideMenuRef}
            id="side-menu"
            className="side-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="side-menu-title"
          >
            <header className="side-menu-header">
              <h2 id="side-menu-title">{t('Menu')}</h2>
              <button
                ref={sideMenuCloseRef}
                className="close-menu"
                type="button"
                aria-label={t('Close menu')}
                onClick={closeSideMenu}
              >
                ×
              </button>
            </header>
            <div className="side-section">
              <span className="eyebrow">{t('Select data source')}</span>
              <div className="source-picker" role="group" aria-label={t('Select data source')}>
                {[
                  { id: 'phone', label: 'PHONE', available: phoneSensorData.available },
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
                    onClick={() => {
                      selectSource(option.id);
                      closeSideMenu();
                    }}
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
            </div>
            <nav className="side-nav" aria-label={t('Configuration, help and feedback')}>
              <button
                className={`menu-button${activeMenu === 'vehicle' ? ' selected' : ''}${!setupConfirmed.vehicle ? ' needs-setup' : ''}`}
                type="button"
                aria-haspopup="dialog"
                aria-label={`${t('VEHICLE')}${!setupConfirmed.vehicle ? ` · ${t('Confirmation needed')}` : ''}`}
                onClick={() => openSideDialog('vehicle')}
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
              <button
                className={`menu-button${activeMenu === 'wedges' ? ' selected' : ''}${!wedgesConfirmed ? ' needs-setup' : ''}`}
                type="button"
                aria-haspopup="dialog"
                aria-label={`${t('WEDGES')}${!wedgesConfirmed ? ` · ${t('Confirmation needed')}` : ''}`}
                onClick={() => openSideDialog('wedges')}
              >
                <span className="menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 19h16L4 5Z" />
                  </svg>
                </span>
                <span>{t('WEDGES')}</span>
              </button>
              <button
                className={activeMenu === 'calibration' ? 'menu-button selected' : 'menu-button'}
                type="button"
                aria-haspopup="dialog"
                onClick={() => {
                  openCalibration();
                  openSideDialog('calibration');
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
              <button
                className={activeMenu === 'help' ? 'menu-button selected' : 'menu-button'}
                type="button"
                aria-haspopup="dialog"
                aria-label={t('Help')}
                onClick={() => openSideDialog('help')}
              >
                <span className="menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.5 9a2.5 2.5 0 1 1 3.9 2.1c-1 .7-1.4 1.1-1.4 2.4M12 17h.01" />
                  </svg>
                </span>
                <span>{t('Help')}</span>
              </button>
              <button
                className={activeMenu === 'feedback' ? 'menu-button selected' : 'menu-button'}
                type="button"
                aria-haspopup="dialog"
                aria-label={t('Send feedback')}
                onClick={() => openSideDialog('feedback')}
              >
                <span className="menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M3 5.5h18v13H3zM3.5 6l8.5 7 8.5-7" />
                  </svg>
                </span>
                <span>{t('Send feedback')}</span>
              </button>
              <button
                className={`menu-button${pwa.updateAvailable ? ' has-update' : ''}`}
                type="button"
                aria-haspopup="dialog"
                aria-label={`${t('App and updates')}${pwa.updateAvailable ? ` · ${t('An update is available.')}` : ''}`}
                onClick={() => {
                  refreshOfflineStatus();
                  openSideDialog('offline');
                }}
              >
                <span className="menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3v11m-4-4 4 4 4-4M4 16v4h16v-4" />
                  </svg>
                </span>
                <span>{t('App and updates')}</span>
              </button>
            </nav>
            <div className="side-language">
              <span className="eyebrow">{t('Language')}</span>
              <AppDropdown
                className="language-select"
                label={t('Language')}
                value={language}
                options={[{ value: 'en', label: 'EN' }, { value: 'de', label: 'DE' }]}
                onChange={(value) => setLanguage(normalizeLanguage(value))}
              />
            </div>
          </aside>
        </div>
      )}

      {activeMenu && (
        <div
          className="menu-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setActiveMenu(null);
          }}
        >
          <section
            ref={menuSheetRef}
            className="menu-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-title"
          >
            <header className="menu-header">
              <div>
                <span className="eyebrow">
                  {t(activeMenu === 'feedback' ? 'FRIEND BETA' : activeMenu === 'help' ? 'GUIDE' : activeMenu === 'offline' ? 'APP' : activeMenu === 'sun' ? 'TOP VIEW' : 'CONFIGURATION')}
                </span>
                <h2 id="menu-title">
                  {t(activeMenu === 'vehicle'
                    ? 'Vehicle setup'
                    : activeMenu === 'wedges'
                      ? 'Wedge setup'
                      : activeMenu === 'calibration'
                        ? 'Calibration'
                        : activeMenu === 'help'
                          ? 'How it works'
                          : activeMenu === 'offline'
                            ? 'App and updates'
                          : activeMenu === 'sun'
                            ? 'Sun directions'
                          : 'Send feedback')}
                </h2>
              </div>
              <button
                ref={menuDialogCloseRef}
                className="close-menu"
                type="button"
                aria-label={t('Close dialog')}
                onClick={() => setActiveMenu(null)}
              >
                ×
              </button>
            </header>

            {activeMenu === 'sun' && <SunView vehicle={vehicle} t={t} language={language} request={sunRequest} />}

            {!setupFlowActive && activeMenu !== 'feedback' && activeMenu !== 'help' && activeMenu !== 'offline' && activeMenu !== 'sun' && (
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
                  onClick={() => { openCalibration(); setActiveMenu('calibration'); }}
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
                {setupFlowActive ? (
                  <div className="setup-flow-actions">
                    <button className="feedback-submit" type="button" onClick={() => { if (confirmVehicle()) advanceSetup(); }}>{t('ACCEPT AND NEXT')}</button>
                    <button className="setup-skip" type="button" onClick={advanceSetup}>{t('SKIP')}</button>
                  </div>
                ) : !setupConfirmed.vehicle && (
                  <button className="feedback-submit" type="button" onClick={confirmVehicle}>{t('CONFIRM VEHICLE DIMENSIONS')}</button>
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
                {setupFlowActive ? (
                  <div className="setup-flow-actions">
                    <button className="feedback-submit" type="button" onClick={() => { if (confirmWedges()) advanceSetup(); }}>{t('ACCEPT AND NEXT')}</button>
                    <button className="setup-skip" type="button" onClick={advanceSetup}>{t('SKIP')}</button>
                  </div>
                ) : !wedgesConfirmed && (
                  <button className="feedback-submit" type="button" onClick={confirmWedges}>{t(vehicle.levelingMode === 'height' ? 'CONFIRM MAXIMUM HEIGHT' : 'CONFIRM WEDGE HEIGHTS')}</button>
                )}
              </div>
            ) : activeMenu === 'calibration' ? (
              <div className="menu-content calibration-content">
                <div className="settings-card calibration-settings-card">
                  {source === 'external' ? (
                    <p className="calibration-instructions" role="status">{t('External sensor support is not available yet.')}</p>
                  ) : (
                    <>
                      {source === 'phone' && <CalibrationInstructions t={t} />}
                      {!setupSensorAvailable && (
                        <p className="calibration-instructions" role="status">{t(motionSensorStatus === 'Tap PHONE to allow motion sensor access.'
                          ? 'Allow sensor access to calibrate.'
                          : motionSensorStatus || 'No sensor signal')}</p>
                      )}
                      {source === 'phone' && !motionPermissionGranted && typeof window.DeviceMotionEvent?.requestPermission === 'function' && (
                        <button type="button" className="setup-skip" onClick={() => selectSource('phone')}>
                          {t('ALLOW SENSOR ACCESS')}
                        </button>
                      )}
                      <CalibrationSlotButtons
                        slots={calibrationSlots[calibrationSlotSource]}
                        selectedId={activeSlotId}
                        sourceName={calibrationSlotSource}
                        t={t}
                        onSelect={(slotId) => selectCalibrationSlot(calibrationSlotSource, slotId)}
                        onStartHold={setupSensorAvailable ? startCalibrationHold : undefined}
                        onCancelHold={cancelCalibrationHold}
                        holdingSlotId={holdingSlotId}
                      />
                      {calibrationComplete && <p className="calibration-instructions" role="status">{t('SLOT UPDATED')}</p>}
                      {activeSlot && (
                        <label className="calibration-slot-name">
                          <span>{t('Name for slot {slot}', { slot: activeSlotNumber })} <small>{t('OPTIONAL')}</small></span>
                          <input
                            type="text"
                            maxLength={60}
                            placeholder={t('Slot {slot}', { slot: activeSlotNumber })}
                            value={activeSlot.name}
                            onChange={(event) => updateCalibrationSlotName(calibrationSlotSource, activeSlot.id, event.target.value)}
                          />
                        </label>
                      )}
                    </>
                  )}
                </div>
                {setupFlowActive && (
                  <div className="setup-flow-actions">
                    <button className="feedback-submit" type="button" disabled={needsCalibration || !setupSensorAvailable} onClick={advanceSetup}>{t('FINISH')}</button>
                    <button className="setup-skip" type="button" onClick={advanceSetup}>{t('SKIP')}</button>
                  </div>
                )}
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
            ) : activeMenu === 'feedback' ? (
              <div className="menu-content">
                <FeedbackForm endpoint={FORMSPREE_ENDPOINT} t={t} online={pwa.online} />
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
