import React, { useState, useEffect } from 'react';
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
  } = useMapStore();

  // Font size scales linearly with zoom (Simple CRS: ~-5 at full view, 0+ when zoomed in)
  const fontSize = Math.max(7, Math.min(20, 13 + zoom));

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
          let labelFontSize = fontSize;
          let labelOpacity  = 1;
          if (rt === 'island' || rt === 'archipelago') {
            const minZ = map.getMinZoom();
            const t    = Math.max(0, Math.min(1.0, (zoom - minZ) / 5));
            labelFontSize = Math.max(8, Math.round(ISLAND_BASE_FONT[rt] * (0.3 + 1.05 * t)));
            labelOpacity  = 0.4 + 0.6 * t;
          }

          // Estimate a hitbox wide enough for the text so Leaflet can handle drag events.
          // iconSize must be non-zero; iconAnchor centers the box on the label position.
          const name = properties?.name || '';
          const boxW = Math.max(80, Math.min(500, name.length * labelFontSize * 0.65 + 24));
          const boxH = Math.ceil(labelFontSize * 2.2);

          const icon = L.divIcon({
            className: 'region-label-icon',
            html: `<div style="
              width:${boxW}px;
              height:${boxH}px;
              display:flex;
              align-items:center;
              justify-content:center;
              cursor:${regionMergeMode ? 'default' : 'grab'};
              user-select:none;
              opacity:${labelOpacity.toFixed(2)};
            "><span style="
              font-size:${labelFontSize}px;
              font-weight:bold;
              color:${regionColor};
              text-shadow:0 0 6px rgba(0,0,0,0.95),0 0 3px rgba(0,0,0,0.95);
              letter-spacing:0.08em;
              white-space:nowrap;
            ">${name}</span></div>`,
            iconSize: [boxW, boxH],
            iconAnchor: [boxW / 2, boxH / 2],
          });

          // Click behaviour depends on mode
          const onRegionClick = (e) => {
            e.originalEvent?.stopPropagation?.();
            // Place-name region assignment mode: capture this region's ID
            if (assigningRegionToPlaceName) {
              commitRegionIdForPlaceName(id);
              return;
            }
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
                return (
                  <Polygon
                    key={`${id}-${idx}`}
                    positions={positions}
                    pathOptions={{
                      color: regionColor,
                      fillColor: regionColor,
                      fillOpacity,
                      weight,
                      opacity,
                      dashArray: '5 4',
                    }}
                    eventHandlers={{ click: onRegionClick }}
                  />
                );
              })}

              {/* Label marker — draggable to reposition, click to select/toggle */}
              <Marker
                position={labelPos}
                icon={icon}
                draggable={!regionMergeMode}
                eventHandlers={{
                  click: onRegionClick,
                  dragend: (e) => {
                    const ll = e.target.getLatLng();
                    updateFeature(id, { labelLatLng: { lat: ll.lat, lng: ll.lng } });
                  },
                }}
              />
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
