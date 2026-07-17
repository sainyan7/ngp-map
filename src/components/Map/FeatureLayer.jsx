import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import L from 'leaflet';
import { useMap, useMapEvents, CircleMarker, Marker, Polyline, Polygon, Tooltip } from 'react-leaflet';
import useMapStore from '../../store/useMapStore';
import { updateFeature } from '../../firebase/features';

// Which region type is selectable when building each target type
const MERGE_SOURCE_TYPE = {
  region:      'state',   // 地方 ← 州
  state:       'county',  // 州   ← 郡・市域
  archipelago: 'island',  // 諸島 ← 島
};

export const REGION_TYPE_COLORS = {
  state:       '#A78BFA',
  region:      '#34D399',
  county:      '#60A5FA',
  island:      '#A7F3D0',  // matches PlaceNameLayer category 'island'
  archipelago: '#6EE7B7',  // matches PlaceNameLayer category 'archipelago'
  other:       '#F59E0B',
};

// Base font sizes for island/archipelago matching PlaceNameLayer CATEGORY_STYLE
const ISLAND_BASE_FONT = { island: 12, archipelago: 13 };

// Minimum zoom offset per region type — labels below (minZ + offset) are hidden.
// Polygons always render regardless of zoom.
// Hierarchy: 地方/諸島 (0, always) > 州/島 (1) > 郡・市域/その他 (2, lowest)
const REGION_MIN_ZOOM_OFFSET = {
  region:      0,
  archipelago: 0,
  state:       1,
  island:      1,
  county:      2,
  other:       2,
};

// Area thresholds for state label zoom (coordinate-space square units, MAP=4000×6008)
const STATE_AREA_LARGE  = 300000; // large state → show at minZ+1 (unchanged)
const STATE_AREA_MEDIUM =  80000; // medium state → show at minZ+2
// smaller → show at minZ+3

// Shoelace formula — returns absolute area
function polyArea(positions) {
  const n = positions.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [lat1, lng1] = positions[i];
    const [lat2, lng2] = positions[(i + 1) % n];
    area += lat1 * lng2 - lat2 * lng1;
  }
  return Math.abs(area) / 2;
}

// Bounding-box center is more visually centered than vertex average,
// especially for non-convex or vertex-heavy polygons.
function polygonBBoxCenter(positions) {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const [lat, lng] of positions) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}

// Canonical key for an undirected edge so that A→B and B→A produce the same key.
function edgeKey(lat1, lng1, lat2, lng2) {
  const a = `${lat1.toFixed(6)},${lng1.toFixed(6)}`;
  const b = `${lat2.toFixed(6)},${lng2.toFixed(6)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Split a polygon's perimeter into runs of consecutive shared / non-shared edges.
// Returns [{ pts: [[lat,lng],...], isShared: bool }, ...]
// Consecutive same-type edges are merged into a single segment (fewer Polylines).
function getEdgeSegments(positions, sharedEdgeSet) {
  const n = positions.length;
  if (n < 3) return [];

  // Classify each edge i → (i+1)%n
  const isShared = positions.map((p, i) => {
    const q = positions[(i + 1) % n];
    return sharedEdgeSet.has(edgeKey(p[0], p[1], q[0], q[1]));
  });

  // Find a seam where type changes so the first segment isn't split across wrap-around.
  let seam = 0;
  for (let i = 0; i < n; i++) {
    if (isShared[i] !== isShared[(i - 1 + n) % n]) { seam = i; break; }
  }

  const result = [];
  let curShared = isShared[seam];
  let pts = [positions[seam]];

  for (let step = 0; step < n; step++) {
    const j = (seam + step + 1) % n;
    pts.push(positions[j]);
    // If the NEXT edge type differs from the current run, emit and start a new segment.
    if (isShared[j] !== curShared) {
      result.push({ pts: [...pts], isShared: curShared });
      curShared = isShared[j];
      pts = [positions[j]]; // Junction point starts the next segment
    }
  }
  if (pts.length >= 2) result.push({ pts, isShared: curShared });

  return result;
}

// RegionLabel — extracted component for reliable draggable labels.
//
// Problem 1 (snap-back): dragend calls updateFeature (async). Before Firestore
//   confirms, React-Leaflet overwrites the marker position with the old labelPos.
//   Fix: keep savedPos in state, cleared only when Firestore confirms.
//
// Problem 2 (drag jitter): on any parent re-render during drag (e.g. Firestore
//   subscription fires), React-Leaflet calls marker.setLatLng(old_pos) which
//   fights Leaflet's drag handler and causes visible jitter.
//   Fix: patch the Leaflet marker instance's setLatLng to no-op while isDragging.
//
// Problem 3 (icon thrashing): L.divIcon created fresh every parent render →
//   React-Leaflet calls setIcon → icon DOM recreated → drag listeners detached.
//   Fix: useMemo inside this component with stable deps.
function RegionLabel({
  feature, labelPos, name, labelFontSize, labelOpacity, regionColor, draggable, onRegionClick,
}) {
  const pushHistory = useMapStore((s) => s.pushHistory);
  const [savedPos, setSavedPos] = useState(null);
  const isDraggingRef = useRef(false);

  // When Firestore confirms the new position, clear the local override
  useEffect(() => { setSavedPos(null); }, [feature.labelLatLng]);

  // Position: use local savedPos (set on dragend) until Firestore confirms,
  // to prevent snap-back to old labelPos during the async window.
  const pos = savedPos ?? labelPos;

  // Stable icon — only recreated when visual properties actually change.
  const boxW = Math.max(80, Math.min(500, name.length * labelFontSize * 0.65 + 24));
  const boxH = Math.ceil(labelFontSize * 2.2);
  const icon = useMemo(() => L.divIcon({
    className: 'region-label-icon',
    html: `<div style="
      width:${boxW}px;height:${boxH}px;
      display:flex;align-items:center;justify-content:center;
      cursor:${draggable ? 'grab' : 'pointer'};
      user-select:none;
      opacity:${labelOpacity.toFixed(2)};
    "><span style="
      font-size:${labelFontSize}px;font-weight:bold;
      color:${regionColor};
      text-shadow:0 0 6px rgba(0,0,0,0.95),0 0 3px rgba(0,0,0,0.95);
      letter-spacing:0.08em;white-space:nowrap;
    ">${name}</span></div>`,
    iconSize: [boxW, boxH],
    iconAnchor: [boxW / 2, boxH / 2],
  }), [name, labelFontSize, labelOpacity, regionColor, draggable, boxW, boxH]); // eslint-disable-line react-hooks/exhaustive-deps

  // Callback ref: patch the Leaflet marker instance once on mount.
  // During drag, block setLatLng calls that come from React-Leaflet's prop
  // reconciliation — they fight the drag handler and cause jitter.
  // Leaflet's own drag handler bypasses setLatLng (uses DomUtil.setPosition
  // directly), so the patch doesn't affect native drag movement.
  const markerRef = useCallback((marker) => {
    if (!marker) return;
    const orig = marker.setLatLng.bind(marker);
    marker.setLatLng = function (latlng) {
      if (isDraggingRef.current) return this; // suppress during drag
      return orig(latlng);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Marker
      ref={markerRef}
      position={pos}
      icon={icon}
      draggable={draggable}
      eventHandlers={{
        click: onRegionClick,
        dragstart: () => { isDraggingRef.current = true; },
        dragend: (e) => {
          isDraggingRef.current = false;
          const ll = e.target.getLatLng();
          setSavedPos([ll.lat, ll.lng]); // Prevent snap-back while Firestore confirms
          const before = feature.labelLatLng ? { ...feature.labelLatLng } : null;
          const after  = { lat: ll.lat, lng: ll.lng };
          updateFeature(feature.id, { labelLatLng: after });
          pushHistory({
            label: 'ラベル移動',
            undoFn: async () => { await updateFeature(feature.id, { labelLatLng: before }); },
            redoFn: async () => { await updateFeature(feature.id, { labelLatLng: after }); },
          });
        },
      }}
    />
  );
}

export default function FeatureLayer() {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  // Re-render labels whenever zoom changes
  useMapEvents({ zoom() { setZoom(map.getZoom()); } });
  useEffect(() => { setZoom(map.getZoom()); }, [map]);

  const {
    features, layers, regionTypeFilters,
    setSelectedFeature, selectedFeature, editingRegion,
    regionMergeMode, regionMergeTargetType, regionMergeSelection, toggleRegionMergeSelection,
    assigningRegionToPlaceName, commitRegionIdForPlaceName,
    placeNames,
    pickingExistingRegion, commitPickedPolygon,
    drawingMode, regionLabelDragEnabled,
  } = useMapStore();

  // Font size scales linearly with zoom (Simple CRS: ~-5 at full view, 0+ when zoomed in)
  const fontSize = Math.max(7, Math.min(20, 13 + zoom));

  // Build the set of shared edges across all visible region polygons.
  // An edge appearing in 2+ polygons is "shared" and should render as dashed.
  const sharedEdgeSet = useMemo(() => {
    const counts = new Map();
    for (const f of features) {
      if (f.type !== 'region') continue;
      if (!layers[f.layerType]) continue;
      const rt = f.properties?.regionType ?? 'other';
      if (!regionTypeFilters[rt]) continue;
      if (editingRegion?.id === f.id) continue;
      for (const poly of (f.polygons ?? [])) {
        const verts = poly.latlngs;
        const n = verts.length;
        for (let i = 0; i < n; i++) {
          const p1 = verts[i];
          const p2 = verts[(i + 1) % n];
          const k = edgeKey(p1.lat, p1.lng, p2.lat, p2.lng);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
    }
    const shared = new Set();
    for (const [k, c] of counts) if (c > 1) shared.add(k);
    return shared;
  }, [features, layers, regionTypeFilters, editingRegion]);

  return (
    <>
      {features.map((feature) => {
        // Hide features whose layer is toggled off
        if (!layers[feature.layerType]) return null;

        const { id, type, geometry, properties = {} } = feature;
        const color = properties.color || '#3B82F6';

        const handleClick = (e) => {
          e.originalEvent?.stopPropagation?.();
          setSelectedFeature(feature);
        };

        if (type === 'region') {
          // Hide while vertex editing (RegionEditLayer renders it instead)
          if (editingRegion?.id === id) return null;

          // Apply region-type sub-filter
          const rt = properties?.regionType ?? 'other';
          if (!regionTypeFilters[rt]) return null;

          const polys = feature.polygons ?? [];
          if (polys.length === 0) return null;
          const isSelected = selectedFeature?.id === id;
          const regionColor = REGION_TYPE_COLORS[rt] ?? '#A78BFA';

          // Merge mode flags
          const isMergeCompatible = regionMergeMode && MERGE_SOURCE_TYPE[regionMergeTargetType] === rt;
          const isMergeSelected   = regionMergeMode && regionMergeSelection.some((f) => f.id === id);

          const mainPositions = polys[0].latlngs.map((p) => [p.lat, p.lng]);
          if (mainPositions.length < 3) return null;

          // Compute bbox center from ALL polygons so labels on merged regions
          // (e.g. 地方 composed of multiple 州) appear at the combined center,
          // not at the center of whichever polygon was added first.
          const allPositions = polys.flatMap((poly) => poly.latlngs.map((p) => [p.lat, p.lng]));
          const bboxCenter = polygonBBoxCenter(allPositions);

          // Use stored label position if manually moved, otherwise bbox center
          const labelPos = feature.labelLatLng
            ? [feature.labelLatLng.lat, feature.labelLatLng.lng]
            : bboxCenter;

          // island/archipelago use PlaceNameLayer zoom formula for font + opacity.
          // Other region types use the linear formula already applied to `fontSize`.
          const minZ = map.getMinZoom();
          let labelFontSize = fontSize;
          let labelOpacity  = 1;
          if (rt === 'island' || rt === 'archipelago') {
            const t    = Math.max(0, Math.min(1.0, (zoom - minZ) / 5));
            labelFontSize = Math.max(8, Math.round(ISLAND_BASE_FONT[rt] * (0.3 + 1.05 * t)));
            labelOpacity  = 0.4 + 0.6 * t;
          }

          // Zoom-based hierarchy: hide lower-tier labels when zoomed out.
          // For state regions, use area-based dynamic threshold; others use static offsets.
          // Polygons always render regardless. Linked place names suppress label too.
          let zoomOffset = REGION_MIN_ZOOM_OFFSET[rt] ?? 0;
          if (rt === 'state') {
            const totalArea = polys.reduce((sum, poly) => {
              const pos = poly.latlngs.map((p) => [p.lat, p.lng]);
              return sum + polyArea(pos);
            }, 0);
            // Reduced by 1 step vs previous: labels appear at one zoom level wider.
            zoomOffset = totalArea >= STATE_AREA_LARGE  ? 0
                       : totalArea >= STATE_AREA_MEDIUM ? 1
                       : 2;
          }
          // State labels appear at wider zoom → slightly smaller font to reduce crowding
          if (rt === 'state') labelFontSize = Math.max(7, Math.round(labelFontSize * 0.85));

          const showLabel          = zoom >= minZ + zoomOffset;
          const hasLinkedPlaceName = placeNames.some((pn) => pn.regionId === id);

          const name = properties?.name || '';

          // Click behaviour depends on mode
          const onRegionClick = (e) => {
            // In drawing / measure / placement modes, let the click pass through
            // to the map so points can be placed over existing regions.
            if (!regionMergeMode && drawingMode !== 'select') return;
            e.originalEvent?.stopPropagation?.();
            // Note: assigningRegionToPlaceName is now handled per-polygon in handlePolyClick
            // so that we can pass the specific polygon index (exclave-level linking).
            if (regionMergeMode) {
              if (isMergeCompatible) toggleRegionMergeSelection(feature);
              return; // Never open popup while in merge mode
            }
            setSelectedFeature(feature);
          };

          // Polygon visual settings (merge mode overrides selection style)
          let fillOpacity = isSelected ? 0.18 : 0;
          let weight      = isSelected ? 2 : 1.5;
          let opacity     = labelOpacity;  // island/archipelago fade with zoom
          if (regionMergeMode) {
            if (isMergeSelected)       { fillOpacity = 0.45; weight = 3; opacity = 1; }
            else if (isMergeCompatible){ fillOpacity = 0;    weight = 2; opacity = 1; }
            else                       { opacity = Math.min(opacity, 0.25); }
          }

          return (
            <React.Fragment key={id}>
              {polys.map((poly, idx) => {
                const positions = poly.latlngs.map((p) => [p.lat, p.lng]);
                if (positions.length < 3) return null;

                // Split perimeter into shared (dashed) and non-shared (solid) runs.
                const segments = getEdgeSegments(positions, sharedEdgeSet);

                // Per-polygon click: in pick mode commit this polygon's positions;
                // in place-name assignment mode commit region ID + polygon index.
              const handlePolyClick = (e) => {
                if (pickingExistingRegion) {
                  e.originalEvent?.stopPropagation?.();
                  commitPickedPolygon(positions);
                  return;
                }
                if (assigningRegionToPlaceName) {
                  e.originalEvent?.stopPropagation?.();
                  commitRegionIdForPlaceName(id, idx); // pass polygon index for exclave-level linking
                  return;
                }
                onRegionClick(e); // pass-through / stopPropagation decided there
              };

              return (
                  <React.Fragment key={`${id}-${idx}`}>
                    {/* Fill + pointer-event capture — no stroke (weight: 0).
                        fillOpacity min 0.001 so SVG pointer-events still fire. */}
                    <Polygon
                      positions={positions}
                      pathOptions={{
                        color: regionColor,
                        fillColor: regionColor,
                        fillOpacity: Math.max(fillOpacity, 0.001),
                        weight: 0,
                        opacity,
                      }}
                      eventHandlers={{ click: handlePolyClick }}
                    />

                    {/* Border edges: dashed for shared edges, solid for outer edges.
                        interactive=false so clicks fall through to the fill Polygon. */}
                    {segments.map((seg, si) => (
                      <Polyline
                        key={si}
                        positions={seg.pts}
                        pathOptions={{
                          color: regionColor,
                          weight,
                          opacity,
                          ...(seg.isShared ? { dashArray: '6 5' } : {}),
                        }}
                        interactive={false}
                      />
                    ))}
                  </React.Fragment>
                );
              })}

              {/* Label marker — hidden when zoom is too low, or a place name is linked.
                  Uses RegionLabel with memoized icon + optimistic position for drag fix. */}
              {showLabel && !hasLinkedPlaceName && (
                <RegionLabel
                  feature={feature}
                  labelPos={labelPos}
                  name={name}
                  labelFontSize={labelFontSize}
                  labelOpacity={labelOpacity}
                  regionColor={regionColor}
                  draggable={!regionMergeMode && regionLabelDragEnabled && isSelected}
                  onRegionClick={onRegionClick}
                />
              )}
            </React.Fragment>
          );
        }

        if (type === 'point') {
          const p = geometry?.latlng;
          if (!p) return null;
          const pos = [p.lat, p.lng];
          return (
            <CircleMarker
              key={id}
              center={pos}
              radius={7}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.9, weight: 2 }}
              eventHandlers={{ click: handleClick }}
            >
              {properties.name && (
                <Tooltip direction="top" offset={[0, -8]} permanent={false}>
                  {properties.name}
                </Tooltip>
              )}
            </CircleMarker>
          );
        }

        if (type === 'line') {
          const positions = (geometry?.latlngs ?? []).map((p) => [p.lat, p.lng]);
          if (positions.length < 2) return null;
          return (
            <Polyline
              key={id}
              positions={positions}
              pathOptions={{ color, weight: 2 }}
              eventHandlers={{ click: handleClick }}
            >
              {properties.name && <Tooltip sticky>{properties.name}</Tooltip>}
            </Polyline>
          );
        }

        if (type === 'polygon') {
          const positions = (geometry?.latlngs ?? []).map((p) => [p.lat, p.lng]);
          if (positions.length < 3) return null;
          return (
            <Polygon
              key={id}
              positions={positions}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2 }}
              eventHandlers={{ click: handleClick }}
            >
              {properties.name && <Tooltip sticky>{properties.name}</Tooltip>}
            </Polygon>
          );
        }

        return null;
      })}
    </>
  );
}
