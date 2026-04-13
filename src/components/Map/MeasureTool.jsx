import { useEffect } from 'react';
import { Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useMapStore from '../../store/useMapStore';

// Small pin icon for measurement points
function makePinIcon(label, color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};border:2px solid white;border-radius:50%;
      width:12px;height:12px;position:relative;
      box-shadow:0 1px 4px rgba(0,0,0,0.5)">
      <span style="position:absolute;left:14px;top:-4px;color:white;
        font-size:11px;font-weight:bold;text-shadow:0 1px 2px #000;
        white-space:nowrap">${label}</span>
    </div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

const iconA = makePinIcon('A', '#facc15');
const iconB = makePinIcon('B', '#f97316');

function MeasureEvents() {
  const map = useMap();
  const {
    drawingMode,
    measureStart, setMeasureStart,
    measureEnd, setMeasureEnd,
    clearMeasure,
  } = useMapStore();

  // Manage cursor style
  useEffect(() => {
    const el = map.getContainer();
    if (drawingMode === 'measure') {
      el.style.cursor = 'crosshair';
    } else {
      el.style.cursor = '';
      clearMeasure();
    }
    return () => { el.style.cursor = ''; };
  }, [drawingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useMapEvents({
    click(e) {
      if (drawingMode !== 'measure') return;
      if (!measureStart) {
        setMeasureStart(e.latlng);
      } else if (!measureEnd) {
        setMeasureEnd(e.latlng);
      } else {
        // Third click — reset
        clearMeasure();
        setMeasureStart(e.latlng);
      }
    },
  });

  return null;
}

// Marker rendered as a Leaflet Marker with divIcon
function MeasureMarker({ position, icon }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    const m = L.marker([position.lat, position.lng], { icon, interactive: false });
    m.addTo(map);
    return () => { m.remove(); };
  }, [position]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function MeasureTool() {
  const { drawingMode, measureStart, measureEnd, kmPerUnit } = useMapStore();

  if (drawingMode !== 'measure') return <MeasureEvents />;

  const distKm = measureStart && measureEnd
    ? (Math.hypot(measureEnd.lng - measureStart.lng, measureEnd.lat - measureStart.lat) / kmPerUnit).toFixed(1)
    : null;

  return (
    <>
      <MeasureEvents />
      <MeasureMarker position={measureStart} icon={iconA} />
      <MeasureMarker position={measureEnd} icon={iconB} />
      {measureStart && measureEnd && (
        <Polyline
          positions={[[measureStart.lat, measureStart.lng], [measureEnd.lat, measureEnd.lng]]}
          pathOptions={{ color: '#facc15', weight: 2, dashArray: '6 4' }}
          interactive={false}
        />
      )}
      {/* Distance result overlay — rendered outside MapContainer via portal-like absolute positioning */}
      {distKm && (
        <MeasureResultOverlay distKm={distKm} />
      )}
    </>
  );
}

// Overlay outside Leaflet canvas — rendered via map pane injection
function MeasureResultOverlay({ distKm }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const div = document.createElement('div');
    div.className = 'measure-result-overlay';
    div.style.cssText = `
      position:absolute;bottom:60px;right:8px;z-index:500;
      background:rgba(0,0,0,0.75);color:#facc15;
      font-size:13px;font-weight:bold;
      padding:6px 12px;border-radius:6px;
      pointer-events:none;white-space:nowrap;
      border:1px solid rgba(250,204,21,0.4);
    `;
    div.textContent = `距離: ${distKm} km`;
    container.appendChild(div);
    return () => { div.remove(); };
  }, [distKm]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
