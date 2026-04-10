import { useState } from 'react';
import { CircleMarker, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useMapStore from '../../store/useMapStore';

// ── Icon definitions ─────────────────────────────────────────────────────────

// 首都: 赤■（塗りつぶし）
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

// 大都市: 赤枠に黒塗り■
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

const capitalIcon   = makeCapitalIcon();
const majorCityIcon = makeMajorCityIcon();

// ── Label tooltip ─────────────────────────────────────────────────────────────
function CityTooltip({ children }) {
  return (
    <Tooltip permanent direction="right" offset={[8, 0]} className="city-label">
      {children}
    </Tooltip>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CityLayer() {
  const { cities, layers, drawingMode, setSelectedCity } = useMapStore();
  const map  = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useMapEvents({ zoom() { setZoom(map.getZoom()); } });

  if (!layers.city) return null;

  const minZ         = map.getMinZoom();
  const showMajor    = zoom >= minZ + 0.5;
  const showStateCap = zoom >= minZ + 1.0;
  const showCity     = zoom >= minZ + 2.0;
  const showCapLbl   = zoom >= minZ + 0.0;
  const showMajLbl   = zoom >= minZ + 0.5;
  const showSCapLbl  = zoom >= minZ + 1.0;
  const showCityLbl  = zoom >= minZ + 2.0;

  const handleClick = (city) => {
    if (drawingMode !== 'select') return;
    setSelectedCity(city);
  };

  return (
    <>
      {cities.map((city) => {
        const pos = [city.lat, city.lng];
        const { id, name, type } = city;
        const label = name || '名称未設定';

        // ── 首都（赤■）──────────────────────────────────────────────────────
        if (type === 'capital') {
          return (
            <Marker
              key={id}
              position={pos}
              icon={capitalIcon}
              eventHandlers={{ click: () => handleClick(city) }}
            >
              {showCapLbl && (
                <CityTooltip>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#EF4444' }}>
                    {label}
                  </span>
                </CityTooltip>
              )}
            </Marker>
          );
        }

        // ── 大都市（赤中黒■）────────────────────────────────────────────────
        if (type === 'major_city') {
          if (!showMajor) return null;
          return (
            <Marker
              key={id}
              position={pos}
              icon={majorCityIcon}
              eventHandlers={{ click: () => handleClick(city) }}
            >
              {showMajLbl && (
                <CityTooltip>
                  <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#DC2626' }}>
                    {label}
                  </span>
                </CityTooltip>
              )}
            </Marker>
          );
        }

        // ── 州都（青●）──────────────────────────────────────────────────────
        if (type === 'state_capital') {
          if (!showStateCap) return null;
          return (
            <CircleMarker
              key={id}
              center={pos}
              radius={7}
              pathOptions={{ color: '#1D4ED8', fillColor: '#3B82F6', fillOpacity: 0.9, weight: 2 }}
              eventHandlers={{ click: () => handleClick(city) }}
            >
              {showSCapLbl && (
                <CityTooltip>
                  <span style={{ fontSize: '12px', color: '#1D4ED8' }}>{label}</span>
                </CityTooltip>
              )}
            </CircleMarker>
          );
        }

        // ── その他の都市（白●）──────────────────────────────────────────────
        if (!showCity) return null;
        return (
          <CircleMarker
            key={id}
            center={pos}
            radius={4}
            pathOptions={{ color: '#6B7280', fillColor: '#F9FAFB', fillOpacity: 0.9, weight: 1.5 }}
            eventHandlers={{ click: () => handleClick(city) }}
          >
            {showCityLbl && (
              <CityTooltip>
                <span style={{ fontSize: '11px', color: '#374151' }}>{label}</span>
              </CityTooltip>
            )}
          </CircleMarker>
        );
      })}
    </>
  );
}
