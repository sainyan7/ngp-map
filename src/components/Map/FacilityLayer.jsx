import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useMapStore from '../../store/useMapStore';
import { updateFacility } from '../../firebase/facilities';

// Compute ruby font size: 75% of main, but minimum 9px and maximum = main size
function calcRubyPx(mainPx) {
  return Math.min(mainPx, Math.max(Math.round(mainPx * 0.75), 9));
}

// ── Icon definitions ──────────────────────────────────────────────────────────

// Text color for each facility type (dark enough to read with white text-shadow)
const FACILITY_TEXT_COLOR = {
  airport:  '#1E40AF',  // dark blue
  port:     '#115E59',  // dark teal
  military: '#3F6212',  // dark olive
  other:    '#4C1D95',  // dark purple
};

const FACILITY_ICON_CONFIG = {
  // Airport
  international:  { symbol: '✈', bg: '#1D4ED8', size: 16, label: '国際空港' },
  regional:       { symbol: '✈', bg: '#3B82F6', size: 14, label: '地方空港' },
  other_airfield: { symbol: '✈', bg: '#7DD3FC', size: 13, label: 'その他飛行場' },
  // Port (civilian — blue tones)
  major_port:     { symbol: '⚓', bg: '#1565C0', size: 16, label: '重要港' },
  regional_port:  { symbol: '⚓', bg: '#134E4A', size: 14, label: '地方港' },
  // Military
  garrison:       { symbol: '★', bg: '#4D7C0F', size: 15, label: '駐屯地' },
  air_base:       { symbol: '✈', bg: '#365314', size: 15, label: '航空基地', rotate: 45 },
  naval_base:     { symbol: '⚓', bg: '#7C1D1D', size: 15, label: '軍港', badge: '★' },
  other_military: { symbol: '✦', bg: '#7F1D1D', size: 14, label: 'その他軍事施設' },
  // Other
  other:          { symbol: '◆', bg: '#7C3AED', size: 14, label: 'その他重要施設' },
};

// Render a small badge (e.g. ★) in the top-right corner of the icon
// offset: extra pixels added to both cx and cy (used when icon has padding, e.g. drag icon)
function badgeSvg(size, text, offset = 0) {
  const r = Math.round(size * 0.28);
  const cx = size + offset - r + 1;
  const cy = offset + r - 1;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#F59E0B" stroke="white" stroke-width="0.8"/>
    <text x="${cx}" y="${cy}" dominant-baseline="central" text-anchor="middle"
          font-size="${Math.round(r * 1.1)}" fill="white">${text}</text>`;
}

function makeFacilityIcon(facility) {
  const subtype = facility.subtype ?? (facility.type === 'other' ? 'other' : null);
  const cfg = FACILITY_ICON_CONFIG[subtype] ?? FACILITY_ICON_CONFIG.other;
  const { symbol, bg, size } = cfg;
  const rotate = cfg.rotate ? `rotate(${cfg.rotate}deg)` : '';
  const half = size / 2;

  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))">
      <circle cx="${half}" cy="${half}" r="${half}" fill="${bg}" stroke="rgba(255,255,255,0.7)" stroke-width="1.2"/>
      <text x="${half}" y="${half}" dominant-baseline="central" text-anchor="middle"
            font-size="${Math.round(size * 0.78)}" fill="white"
            style="transform-origin:${half}px ${half}px;transform:${rotate}">${symbol}</text>
      ${cfg.badge ? badgeSvg(size, cfg.badge) : ''}
    </svg>`,
    iconSize:   [size, size],
    iconAnchor: [half, half],
  });
}

function makeFacilityDragIcon(facility) {
  const subtype = facility.subtype ?? (facility.type === 'other' ? 'other' : null);
  const cfg = FACILITY_ICON_CONFIG[subtype] ?? FACILITY_ICON_CONFIG.other;
  const { symbol, bg, size } = cfg;
  const rotate = cfg.rotate ? `rotate(${cfg.rotate}deg)` : '';
  const half = size / 2;

  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 8}" height="${size + 8}" viewBox="0 0 ${size + 8} ${size + 8}" style="overflow:visible;cursor:grab">
      <circle cx="${half + 4}" cy="${half + 4}" r="${half + 3}" fill="none" stroke="rgba(245,158,11,0.85)" stroke-width="2"/>
      <circle cx="${half + 4}" cy="${half + 4}" r="${half}" fill="${bg}" stroke="rgba(255,255,255,0.7)" stroke-width="1.2"/>
      <text x="${half + 4}" y="${half + 4}" dominant-baseline="central" text-anchor="middle"
            font-size="${Math.round(size * 0.78)}" fill="white"
            style="transform-origin:${half + 4}px ${half + 4}px;transform:${rotate}">${symbol}</text>
      ${cfg.badge ? badgeSvg(size, cfg.badge, 4) : ''}
    </svg>`,
    iconSize:   [size + 8, size + 8],
    iconAnchor: [half + 4, half + 4],
  });
}

// ── Draggable marker ──────────────────────────────────────────────────────────
const DragFacilityMarker = memo(function DragFacilityMarker({ facility, showRuby, showFacilityLabel }) {
  const { setSelectedFacility } = useMapStore();
  const ref = useRef(facility);
  useEffect(() => { ref.current = facility; });

  const pos = useMemo(() => [facility.lat, facility.lng], [facility.lat, facility.lng]);
  const icon = useMemo(() => makeFacilityDragIcon(facility), [facility.subtype, facility.type]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlers = useMemo(() => ({
    click(e) {
      e?.originalEvent?.stopPropagation?.();
      setSelectedFacility(ref.current);
    },
    dragend(e) {
      const latlng = e.target.getLatLng();
      updateFacility(ref.current.id, {
        lat: Math.round(latlng.lat),
        lng: Math.round(latlng.lng),
      });
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const displayLabel = facility.name || '名称未設定';
  const label = (showRuby && facility.ruby)
    ? (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
        <span>{displayLabel}</span>
        <span style={{ fontSize: calcRubyPx(11) + 'px', lineHeight: 0.85, opacity: 0.85, fontStyle: 'normal', fontWeight: 'normal', letterSpacing: 0 }}>{facility.ruby}</span>
      </span>
    )
    : displayLabel;

  return (
    <Marker position={pos} icon={icon} draggable eventHandlers={handlers}>
      {showFacilityLabel && (
        <Tooltip permanent direction="right" offset={[6, 0]} className="city-label">
          <span style={{ fontSize: '10px', color: FACILITY_TEXT_COLOR[facility.type] ?? '#1F2937' }}>{label}</span>
        </Tooltip>
      )}
    </Marker>
  );
});

// ── Main component ────────────────────────────────────────────────────────────
export default function FacilityLayer() {
  const {
    facilities, layers, drawingMode,
    setSelectedFacility, selectedFacility,
    facilityDragEnabled,
    setDrawingMode,
    showRuby, showFacilityLabel,
  } = useMapStore();
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const minZoom = map.getMinZoom();
  const showRubyAtZoom = showRuby && zoom >= minZoom + 2;

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = drawingMode === 'add_facility' ? 'crosshair' : '';
    return () => { container.style.cursor = ''; };
  }, [drawingMode, map]);

  useMapEvents({
    zoom() { setZoom(map.getZoom()); },
    click(e) {
      if (drawingMode !== 'add_facility') return;
      const lat = Math.round(e.latlng.lat);
      const lng = Math.round(e.latlng.lng);
      // Show popup immediately (id: null = new facility, saved on form submit)
      setSelectedFacility({ id: null, lat, lng, name: '', type: 'airport', subtype: 'international' });
      setDrawingMode('select');
    },
  });

  if (!layers.facilities) return null;

  const handleClick = (facility, e) => {
    e?.originalEvent?.stopPropagation?.();
    setSelectedFacility(facility);
  };

  return (
    <>
      {facilities.map((facility) => {
        const { id } = facility;
        const isDragTarget = facilityDragEnabled && selectedFacility?.id === id;
        const displayLabel = facility.name || '名称未設定';
        const label = (showRubyAtZoom && facility.ruby)
          ? (
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              <span>{displayLabel}</span>
              <span style={{ fontSize: calcRubyPx(11) + 'px', lineHeight: 0.85, opacity: 0.85, fontStyle: 'normal', fontWeight: 'normal', letterSpacing: 0 }}>{facility.ruby}</span>
            </span>
          )
          : displayLabel;

        if (isDragTarget) {
          return <DragFacilityMarker key={id} facility={facility} showRuby={showRubyAtZoom} showFacilityLabel={showFacilityLabel} />;
        }

        const icon = makeFacilityIcon(facility);

        return (
          <Marker
            key={id}
            position={[facility.lat, facility.lng]}
            icon={icon}
            eventHandlers={{ click: (e) => handleClick(facility, e) }}
          >
            {showFacilityLabel && (
              <Tooltip permanent direction="right" offset={[6, 0]} className="city-label">
                <span style={{ fontSize: '10px', color: FACILITY_TEXT_COLOR[facility.type] ?? '#1F2937' }}>{label}</span>
              </Tooltip>
            )}
          </Marker>
        );
      })}
    </>
  );
}
