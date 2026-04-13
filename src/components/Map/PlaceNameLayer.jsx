import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useMapStore from '../../store/useMapStore';
import { updatePlaceName } from '../../firebase/placeNames';

// ── Category-based text styles ────────────────────────────────────────────────
export const CATEGORY_STYLE = {
  sea:            { color: '#93C5FD', fontSize: '14px', fontStyle: 'italic',  fontWeight: '400', letterSpacing: '0.06em' },
  lake:           { color: '#7DD3FC', fontSize: '13px', fontStyle: 'italic',  fontWeight: '400', letterSpacing: '0.03em' },
  strait:         { color: '#67C8FF', fontSize: '12px', fontStyle: 'italic',  fontWeight: '400', letterSpacing: '0.04em' },
  mountain_range: { color: '#D6D3D1', fontSize: '12px', fontStyle: 'normal',  fontWeight: '700', letterSpacing: '0.12em' },
  mountain:       { color: '#D6D3D1', fontSize: '11px', fontStyle: 'normal',  fontWeight: '500' },
  plateau:        { color: '#C4B59A', fontSize: '12px', fontStyle: 'normal',  fontWeight: '600', letterSpacing: '0.08em' },
  plain:          { color: '#B5C9A1', fontSize: '11px', fontStyle: 'normal',  fontWeight: '400', letterSpacing: '0.05em' },
  desert:         { color: '#D4B483', fontSize: '11px', fontStyle: 'italic',  fontWeight: '400', letterSpacing: '0.05em' },
  river:          { color: '#67E8F9', fontSize: '11px', fontStyle: 'italic',  fontWeight: '400' },
  island:         { color: '#A7F3D0', fontSize: '12px', fontStyle: 'normal',  fontWeight: '500' },
  archipelago:    { color: '#6EE7B7', fontSize: '13px', fontStyle: 'normal',  fontWeight: '600', letterSpacing: '0.04em' },
  peninsula:      { color: '#A7F3D0', fontSize: '12px', fontStyle: 'normal',  fontWeight: '500' },
  other:          { color: '#E5E7EB', fontSize: '12px', fontStyle: 'normal',  fontWeight: '400' },
};

// Minimum (zoom - minZoom) required to display a category.
// Categories not listed here default to 0 (always visible).
const CATEGORY_MIN_ZOOM_OFFSET = {
  island: 2,   // individual islands only appear when zoomed in
};

// Build inline-style string from CATEGORY_STYLE for use in DivIcon HTML
function toCssString(styleObj) {
  const keyMap = {
    color: 'color', fontSize: 'font-size', fontStyle: 'font-style',
    fontWeight: 'font-weight', letterSpacing: 'letter-spacing',
  };
  return Object.entries(styleObj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${keyMap[k] ?? k}:${v}`)
    .join(';');
}

// Compute ruby font size: 75% of main, but minimum 9px and maximum = main size
function calcRubyPx(mainPx) {
  return Math.min(mainPx, Math.max(Math.round(mainPx * 0.75), 9));
}

// Build ruby-below HTML: main text + reading below (size scales with main text)
function buildContentHtml(prefixHtml, displayName, ruby, showRuby, effectiveFontSize) {
  if (showRuby && ruby) {
    const rubyPx = calcRubyPx(effectiveFontSize);
    return `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:0">`
      + `<span>${prefixHtml}${displayName}</span>`
      + `<span style="font-size:${rubyPx}px;line-height:0.85;opacity:0.85;font-style:normal;font-weight:normal;letter-spacing:0">${ruby}</span>`
      + `</span>`;
  }
  return prefixHtml + displayName;
}

// ── Build DivIcon for a place name label ───────────────────────────────────────
function makeTextIcon({
  name,
  category,
  highlighted          = false,
  zoomScale            = 1,
  zoomOpacity          = 1,
  layout               = 'horizontal',
  archHeight           = 15,
  archUp               = true,
  tilt                 = 0,
  ruby                 = '',
  showRuby             = false,
  pnId                 = 'x',
  letterSpacingOverride = '',
}) {
  const sBase = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.other;
  const s = letterSpacingOverride !== ''
    ? { ...sBase, letterSpacing: letterSpacingOverride }
    : sBase;
  const baseFontSize = parseInt(s.fontSize);
  const effectiveFontSize = Math.max(8, Math.round(baseFontSize * zoomScale));

  const hasMountainPrefix = category === 'mountain';
  const prefixHtml = hasMountainPrefix
    ? `<span style="font-size:${Math.round(effectiveFontSize * 0.7)}px;opacity:0.85;margin-right:2px">▲</span>`
    : '';

  const displayName = name || '名称未設定';
  const contentHtml = buildContentHtml(prefixHtml, displayName, ruby, showRuby, effectiveFontSize);

  const hlStyle = highlighted
    ? 'background:rgba(245,158,11,0.25);outline:1px solid rgba(245,158,11,0.8);border-radius:3px;'
    : '';

  const tiltStr = tilt ? ` rotate(${tilt}deg)` : '';

  // ── Horizontal ──────────────────────────────────────────────────────────────
  if (layout !== 'vertical' && layout !== 'arch') {
    const scaledStyle = { ...s, fontSize: `${effectiveFontSize}px` };
    return L.divIcon({
      className: '',
      html: `<span class="pn-label" style="${toCssString(scaledStyle)};opacity:${zoomOpacity.toFixed(2)};transform:translate(4px,-50%)${tiltStr};${hlStyle}">${contentHtml}</span>`,
      iconSize:   [0, 0],
      iconAnchor: [0, 0],
    });
  }

  // ── Vertical ────────────────────────────────────────────────────────────────
  if (layout === 'vertical') {
    const scaledStyle = { ...s, fontSize: `${effectiveFontSize}px` };
    return L.divIcon({
      className: '',
      html: `<span class="pn-label" style="${toCssString(scaledStyle)};writing-mode:vertical-rl;transform:translate(-50%,4px)${tiltStr};opacity:${zoomOpacity.toFixed(2)};${hlStyle}">${contentHtml}</span>`,
      iconSize:   [0, 0],
      iconAnchor: [0, 0],
    });
  }

  // ── Arch (SVG quadratic bezier + textPath) ───────────────────────────────────
  const charCount = (hasMountainPrefix ? 2 : 0) + Math.max(1, displayName.length);
  // Account for letter-spacing: each character's effective width = glyph width + spacing
  const lsEm = s.letterSpacing ? parseFloat(s.letterSpacing) : 0;
  const charW = effectiveFontSize * 0.85 + lsEm * effectiveFontSize;
  const W = charCount * charW;
  const pad = 4;
  // Add extra padding so tilted SVG doesn't get clipped at the container edge
  const tiltRad = Math.abs(tilt) * Math.PI / 180;
  const extraH = Math.round(W * Math.sin(tiltRad) / 2);
  const totalW = W + pad * 2;

  let pathD, totalH, anchorX, anchorY;

  if (archUp) {
    const Y_start = archHeight + effectiveFontSize + 4 + extraH;
    const Y_ctl   = Y_start - 2 * archHeight;
    totalH  = Y_start + 4 + extraH;
    pathD   = `M ${pad},${Y_start} Q ${pad + W / 2},${Y_ctl} ${pad + W},${Y_start}`;
    anchorX = totalW / 2;
    anchorY = totalH / 2;
  } else {
    const Y_start = effectiveFontSize + 4 + extraH;
    const Y_ctl   = Y_start + 2 * archHeight;
    totalH  = Y_start + archHeight + 4 + extraH;
    pathD   = `M ${pad},${Y_start} Q ${pad + W / 2},${Y_ctl} ${pad + W},${Y_start}`;
    anchorX = totalW / 2;
    anchorY = totalH / 2;
  }

  const { color, fontStyle, fontWeight, letterSpacing } = s;
  const pathId = `pn-arc-${String(pnId).replace(/[^a-z0-9]/gi, '')}`;
  const hlOpacity   = highlighted ? '0.25' : '0';
  const hlOutline   = highlighted ? 'rgba(245,158,11,0.8)' : 'transparent';
  const textPrefix  = hasMountainPrefix ? '▲ ' : '';
  const svgTransform = tilt
    ? `transform:rotate(${tilt}deg);transform-origin:${anchorX}px ${anchorY}px;`
    : '';

  const svgHtml = `<svg
    width="${totalW}" height="${totalH}"
    viewBox="0 0 ${totalW} ${totalH}"
    xmlns="http://www.w3.org/2000/svg"
    class="pn-arch-svg"
    style="overflow:visible;opacity:${zoomOpacity.toFixed(2)};${svgTransform}"
  >
    <rect x="0" y="0" width="${totalW}" height="${totalH}"
          fill="rgba(245,158,11,${hlOpacity})"
          stroke="${hlOutline}" stroke-width="1" rx="3"/>
    <defs>
      <path id="${pathId}" d="${pathD}"/>
    </defs>
    <text font-size="${effectiveFontSize}"
          font-style="${fontStyle}" font-weight="${fontWeight}"
          ${letterSpacing ? `letter-spacing="${letterSpacing}"` : ''}
          fill="none" stroke="rgba(0,0,0,0.8)" stroke-width="3" stroke-linejoin="round"
          paint-order="stroke">
      <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${textPrefix}${displayName}</textPath>
    </text>
    <text font-size="${effectiveFontSize}"
          font-style="${fontStyle}" font-weight="${fontWeight}"
          ${letterSpacing ? `letter-spacing="${letterSpacing}"` : ''}
          fill="${color}">
      <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${textPrefix}${displayName}</textPath>
    </text>
  </svg>`;

  return L.divIcon({
    className:  '',
    html:       svgHtml,
    iconSize:   [totalW, totalH],
    iconAnchor: [anchorX, anchorY],
  });
}

// ── DivIcon: drag mode ────────────────────────────────────────────────────────
const DRAG_ICON = L.divIcon({
  className: '',
  html: `<div style="width:10px;height:10px;border-radius:50%;background:rgba(245,158,11,0.3);border:2px solid rgba(245,158,11,0.9);cursor:grab;transform:translate(-50%,-50%);"></div>`,
  iconSize:   [0, 0],
  iconAnchor: [0, 0],
});

// ── Draggable marker ──────────────────────────────────────────────────────────
const DragPlaceNameMarker = memo(function DragPlaceNameMarker({ pn }) {
  const { setSelectedPlaceName } = useMapStore();
  const pnRef = useRef(pn);
  useEffect(() => { pnRef.current = pn; });

  const pos = useMemo(() => [pn.lat, pn.lng], [pn.lat, pn.lng]);

  const handlers = useMemo(() => ({
    click(e) {
      e?.originalEvent?.stopPropagation?.();
      setSelectedPlaceName(pnRef.current);
    },
    dragend(e) {
      const latlng = e.target.getLatLng();
      updatePlaceName(pnRef.current.id, {
        lat: Math.round(latlng.lat),
        lng: Math.round(latlng.lng),
      });
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const style = CATEGORY_STYLE[pn.category] ?? CATEGORY_STYLE.other;

  return (
    <Marker position={pos} icon={DRAG_ICON} draggable eventHandlers={handlers}>
      <Tooltip permanent direction="right" offset={[8, 0]} className="city-label">
        <span style={style}>{pn.name || '名称未設定'}</span>
      </Tooltip>
    </Marker>
  );
});

// ── Main component ────────────────────────────────────────────────────────────
export default function PlaceNameLayer() {
  const {
    placeNames, layers, drawingMode,
    setSelectedPlaceName,
    selectedPlaceName, placeNameDragEnabled,
    setDrawingMode,
    searchHighlight,
    showRuby,
  } = useMapStore();
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = drawingMode === 'add_label' ? 'crosshair' : '';
    return () => { container.style.cursor = ''; };
  }, [drawingMode, map]);

  useMapEvents({
    zoom() { setZoom(map.getZoom()); },
    click(e) {
      if (drawingMode !== 'add_label') return;
      const lat = Math.round(e.latlng.lat);
      const lng = Math.round(e.latlng.lng);
      setSelectedPlaceName({ id: null, lat, lng, name: '', category: 'other' });
      setDrawingMode('select');
    },
  });

  const minZ = map.getMinZoom();
  const t           = Math.max(0, Math.min(1.0, (zoom - minZ) / 5));
  const zoomScale   = 0.3 + 1.05 * t;
  const zoomOpacity = 0.4 + 0.6 * t;
  // Ruby only appears when zoomed in enough (minZ+2)
  const showRubyAtZoom = showRuby && zoom >= minZ + 2;

  if (!layers.place_names) return null;

  return (
    <>
      {placeNames.map((pn) => {
        const { id, name, category = 'other', lat, lng } = pn;
        const pos = [lat, lng];
        const isDragTarget  = placeNameDragEnabled && selectedPlaceName?.id === id;
        const isHighlighted = searchHighlight?.id === id && searchHighlight?.source === 'placeName';

        // Hide categories that require a higher zoom level
        const minOffset = CATEGORY_MIN_ZOOM_OFFSET[category] ?? 0;
        if (!isDragTarget && !isHighlighted && zoom < minZ + minOffset) return null;

        if (isDragTarget) {
          return <DragPlaceNameMarker key={id} pn={pn} />;
        }

        const icon = makeTextIcon({
          name,
          category,
          highlighted:          isHighlighted,
          zoomScale,
          zoomOpacity,
          layout:               pn.layout          ?? 'horizontal',
          archHeight:           pn.archHeight       ?? 15,
          archUp:               pn.archUp           !== false,
          tilt:                 pn.tilt             ?? 0,
          ruby:                 pn.ruby             ?? '',
          showRuby:             showRubyAtZoom,
          pnId:                 id ?? 'new',
          letterSpacingOverride: pn.letterSpacing   ?? '',
        });

        return (
          <Marker
            key={`${id}-${name}-${category}-${isHighlighted}-${Math.round(zoom * 2)}`}
            position={pos}
            icon={icon}
            eventHandlers={{
              click(e) {
                if (drawingMode !== 'select') return;
                e?.originalEvent?.stopPropagation?.();
                setSelectedPlaceName(pn);
              },
            }}
          />
        );
      })}
    </>
  );
}
