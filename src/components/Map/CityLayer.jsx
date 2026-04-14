import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { CircleMarker, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useMapStore from '../../store/useMapStore';
import { addCity, updateCity, deleteCity } from '../../firebase/cities';

// Compute ruby font size: 75% of main, but minimum 9px and maximum = main size
function calcRubyPx(mainPx) {
  return Math.min(mainPx, Math.max(Math.round(mainPx * 0.75), 9));
}

// ── Icon definitions ─────────────────────────────────────────────────────────

// 首都: 赤■（通常）
function makeCapitalIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;
      background:#EF4444;
      transform:rotate(45deg);
      border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,0.6);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// 首都: 赤■（ドラッグ時 — amber リング）
function makeCapitalDragIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;
      background:#EF4444;
      transform:rotate(45deg);
      border:2px solid #fff;
      box-shadow:0 0 0 3px rgba(245,158,11,0.85), 0 1px 6px rgba(0,0,0,0.6);
      cursor:grab;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// 大都市: 赤枠黒塗り■（通常）
function makeMajorCityIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;
      background:#111827;
      transform:rotate(45deg);
      border:3px solid #EF4444;
      box-shadow:0 1px 4px rgba(0,0,0,0.6);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// 大都市: 赤枠黒塗り■（ドラッグ時 — amber リング）
function makeMajorCityDragIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;
      background:#111827;
      transform:rotate(45deg);
      border:3px solid #EF4444;
      box-shadow:0 0 0 3px rgba(245,158,11,0.85), 0 1px 6px rgba(0,0,0,0.6);
      cursor:grab;
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// ドラッグ時用: 州都（赤● + amber リング + cursor:grab）
const stateCapDragIcon = L.divIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" style="cursor:grab;overflow:visible">
    <circle cx="10" cy="10" r="9"  fill="none" stroke="rgba(245,158,11,0.8)" stroke-width="2"/>
    <circle cx="10" cy="10" r="5"  fill="#EF4444" fill-opacity="0.9" stroke="#B91C1C" stroke-width="1.5"/>
  </svg>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// ドラッグ時用: その他都市（白● + amber リング + cursor:grab）
const cityDragIcon = L.divIcon({
  className: '',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" style="cursor:grab;overflow:visible">
    <circle cx="9" cy="9" r="8"  fill="none" stroke="rgba(245,158,11,0.8)" stroke-width="1.5"/>
    <circle cx="9" cy="9" r="4"  fill="#F9FAFB" fill-opacity="0.9" stroke="#6B7280" stroke-width="1.5"/>
  </svg>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const capitalIcon        = makeCapitalIcon();
const capitalDragIcon    = makeCapitalDragIcon();
const majorCityIcon      = makeMajorCityIcon();
const majorCityDragIcon  = makeMajorCityDragIcon();

// ── Label tooltip ─────────────────────────────────────────────────────────────
function CityTooltip({ children }) {
  return (
    <Tooltip permanent direction="right" offset={[4, 0]} className="city-label">
      {children}
    </Tooltip>
  );
}

// ── Draggable marker — isolated from CityLayer re-renders ────────────────────
//
// Wrapped in memo so it does NOT re-render when CityLayer re-renders due to
// zoom state changes.  Event handlers are stable (empty useMemo deps) via a
// cityRef so they always operate on the latest city data without being recreated.
//
const DragCityMarker = memo(function DragCityMarker({ city, icon, showLabel, labelContent }) {
  const { setSelectedCity } = useMapStore();

  // Keep a ref to the latest city object so stable handlers can access fresh data
  const cityRef = useRef(city);
  useEffect(() => { cityRef.current = city; });

  const pos = useMemo(() => [city.lat, city.lng], [city.lat, city.lng]);

  // Handlers have NO deps — they are never recreated → react-leaflet never
  // rebinds event listeners on the underlying Leaflet marker during drag.
  const handlers = useMemo(() => ({
    click(e) {
      e?.originalEvent?.stopPropagation?.();
      setSelectedCity(cityRef.current);
    },
    dragend(e) {
      const latlng = e.target.getLatLng();
      updateCity(cityRef.current.id, {
        lat: Math.round(latlng.lat),
        lng: Math.round(latlng.lng),
      });
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Marker position={pos} icon={icon} draggable eventHandlers={handlers}>
      {showLabel && labelContent}
    </Marker>
  );
});

// ── Main component ────────────────────────────────────────────────────────────
export default function CityLayer() {
  const {
    cities, layers, drawingMode,
    setSelectedCity, selectedCity,
    cityDragEnabled,
    setDrawingMode,
    showRuby,
    pushHistory,
  } = useMapStore();
  const map  = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const minZoom = map.getMinZoom();
  const showRubyAtZoom = showRuby && zoom >= minZoom + 2;

  // Crosshair cursor in add_city mode
  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = drawingMode === 'add_city' ? 'crosshair' : '';
    return () => { container.style.cursor = ''; };
  }, [drawingMode, map]);

  useMapEvents({
    zoom() { setZoom(map.getZoom()); },

    // Add city on map click when in add_city mode
    async click(e) {
      if (drawingMode !== 'add_city') return;
      const lat = Math.round(e.latlng.lat);
      const lng = Math.round(e.latlng.lng);
      const cityData = { lat, lng, name: '', type: 'city' };
      const id = await addCity(cityData);
      setSelectedCity({ id, lat, lng, name: '', type: 'city' });
      setDrawingMode('select');
      const ref = { id };
      pushHistory({
        label: '都市追加',
        undoFn: async () => { await deleteCity(ref.id); },
        redoFn: async () => {
          const newId = await addCity(cityData);
          ref.id = newId;
        },
      });
    },
  });

  if (!layers.city) return null;

  const minZ         = map.getMinZoom();
  const showMajor    = zoom >= minZ + 0.5;
  const showStateCap = zoom >= minZ + 1.0;
  const showCity     = zoom >= minZ + 2.0;
  const showCapLbl   = zoom >= minZ + 0.0;
  const showMajLbl   = zoom >= minZ + 0.5;
  const showSCapLbl  = zoom >= minZ + 1.0;
  const showCityLbl  = zoom >= minZ + 2.0;

  const handleClick = (city, e) => {
    if (drawingMode !== 'select') return;
    e?.originalEvent?.stopPropagation?.();
    setSelectedCity(city);
  };

  return (
    <>
      {cities.map((city) => {
        const pos = [city.lat, city.lng];
        const { id, name, type } = city;
        const displayLabel = name || '名称未設定';
        const makeLabel = (mainPx) => (showRubyAtZoom && city.ruby)
          ? (
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              <span>{displayLabel}</span>
              <span style={{ fontSize: calcRubyPx(mainPx) + 'px', lineHeight: 0.85, opacity: 0.85, fontStyle: 'normal', fontWeight: 'normal', letterSpacing: 0 }}>{city.ruby}</span>
            </span>
          )
          : displayLabel;
        const isDragTarget = cityDragEnabled && selectedCity?.id === id;

        // ── 首都（赤■）──────────────────────────────────────────────────────
        if (type === 'capital') {
          if (isDragTarget) {
            return (
              <DragCityMarker
                key={id}
                city={city}
                icon={capitalDragIcon}
                showLabel={showCapLbl}
                labelContent={
                  <CityTooltip>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#EF4444' }}>
                      {makeLabel(13)}
                    </span>
                  </CityTooltip>
                }
              />
            );
          }
          return (
            <Marker
              key={id}
              position={pos}
              icon={capitalIcon}
              interactive={drawingMode === 'select'}
              eventHandlers={{ click: (e) => handleClick(city, e) }}
            >
              {showCapLbl && (
                <CityTooltip>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#EF4444' }}>
                    {makeLabel(13)}
                  </span>
                </CityTooltip>
              )}
            </Marker>
          );
        }

        // ── 大都市（赤中黒■）────────────────────────────────────────────────
        if (type === 'major_city') {
          if (!showMajor) return null;
          if (isDragTarget) {
            return (
              <DragCityMarker
                key={id}
                city={city}
                icon={majorCityDragIcon}
                showLabel={showMajLbl}
                labelContent={
                  <CityTooltip>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#DC2626' }}>
                      {makeLabel(13)}
                    </span>
                  </CityTooltip>
                }
              />
            );
          }
          return (
            <Marker
              key={id}
              position={pos}
              icon={majorCityIcon}
              interactive={drawingMode === 'select'}
              eventHandlers={{ click: (e) => handleClick(city, e) }}
            >
              {showMajLbl && (
                <CityTooltip>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#DC2626' }}>
                    {makeLabel(13)}
                  </span>
                </CityTooltip>
              )}
            </Marker>
          );
        }

        // ── 州都（青●）──────────────────────────────────────────────────────
        if (type === 'state_capital') {
          if (!showStateCap) return null;
          const sCapFontPx = (city.population ?? Infinity) < 1_000_000 ? 10 : 12;
          const sCapFontSize = sCapFontPx + 'px';
          if (isDragTarget) {
            return (
              <DragCityMarker
                key={id}
                city={city}
                icon={stateCapDragIcon}
                showLabel={showSCapLbl}
                labelContent={
                  <CityTooltip>
                    <span style={{ fontSize: sCapFontSize, color: '#B91C1C' }}>{makeLabel(sCapFontPx)}</span>
                  </CityTooltip>
                }
              />
            );
          }
          return (
            <CircleMarker
              key={id}
              center={pos}
              radius={5}
              pathOptions={{ color: '#B91C1C', fillColor: '#EF4444', fillOpacity: 0.9, weight: 1.5 }}
              interactive={drawingMode === 'select'}
              eventHandlers={{ click: (e) => handleClick(city, e) }}
            >
              {showSCapLbl && (
                <CityTooltip>
                  <span style={{ fontSize: sCapFontSize, color: '#B91C1C' }}>{makeLabel(sCapFontPx)}</span>
                </CityTooltip>
              )}
            </CircleMarker>
          );
        }

        // ── その他の都市（白●）──────────────────────────────────────────────
        if (!showCity) return null;
        if (isDragTarget) {
          return (
            <DragCityMarker
              key={id}
              city={city}
              icon={cityDragIcon}
              showLabel={showCityLbl}
              labelContent={
                <CityTooltip>
                  <span style={{ fontSize: '11px', color: '#374151' }}>{makeLabel(11)}</span>
                </CityTooltip>
              }
            />
          );
        }
        return (
          <CircleMarker
            key={id}
            center={pos}
            radius={4}
            pathOptions={{ color: '#6B7280', fillColor: '#F9FAFB', fillOpacity: 0.9, weight: 1.5 }}
            interactive={drawingMode === 'select'}
            eventHandlers={{ click: (e) => handleClick(city, e) }}
          >
            {showCityLbl && (
              <CityTooltip>
                <span style={{ fontSize: '11px', color: '#374151' }}>{makeLabel(11)}</span>
              </CityTooltip>
            )}
          </CircleMarker>
        );
      })}
    </>
  );
}
