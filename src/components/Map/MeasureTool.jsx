import { useEffect, useRef, useMemo } from 'react';
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
    cities, facilities, layers,
  } = useMapStore();

  // Ref so click handler always reads current snap without being recreated
  const snapRef = useRef(null);

  // Precompute snap candidates with per-marker pixel radius matching icon size
  const snapCandidates = useMemo(() => {
    const list = [];
    if (layers.city) {
      cities.forEach(c => {
        const px = (c.type === 'capital' || c.type === 'major_city') ? 7
                 : c.type === 'state_capital' ? 5 : 4;
        list.push({ latlng: L.latLng(c.lat, c.lng), px });
      });
    }
    if (layers.facilities) {
      facilities.forEach(f => list.push({ latlng: L.latLng(f.lat, f.lng), px: 8 }));
    }
    return list;
  }, [cities, facilities, layers.city, layers.facilities]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manage cursor style and measure-mode class (disables label pointer-events)
  useEffect(() => {
    const el = map.getContainer();
    if (drawingMode === 'measure') {
      el.style.cursor = 'crosshair';
      el.classList.add('measure-mode');
    } else {
      el.style.cursor = '';
      el.classList.remove('measure-mode');
      clearMeasure();
      snapRef.current = null;
    }
    return () => {
      el.style.cursor = '';
      el.classList.remove('measure-mode');
    };
  }, [drawingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useMapEvents({
    mousemove(e) {
      if (drawingMode !== 'measure') return;
      let nearest = null;
      let nearestDist = Infinity;
      for (const { latlng, px } of snapCandidates) {
        const pt = map.latLngToContainerPoint(latlng);
        const d = e.containerPoint.distanceTo(pt);
        if (d <= px && d < nearestDist) {
          nearest = latlng;
          nearestDist = d;
        }
      }
      snapRef.current = nearest;
      map.getContainer().style.cursor = nearest ? 'pointer' : 'crosshair';
    },
    mouseout() {
      snapRef.current = null;
      map.getContainer().style.cursor = 'crosshair';
    },
    click(e) {
      if (drawingMode !== 'measure') return;
      const latlng = snapRef.current ?? e.latlng;
      if (!measureStart) {
        setMeasureStart(latlng);
      } else if (!measureEnd) {
        setMeasureEnd(latlng);
      } else {
        // Third click — reset
        clearMeasure();
        setMeasureStart(latlng);
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
