import React, { useState, useEffect } from 'react';
import L from 'leaflet';
import { useMap, useMapEvents, CircleMarker, Marker, Polyline, Polygon, Tooltip } from 'react-leaflet';
import useMapStore from '../../store/useMapStore';
import { updateFeature } from '../../firebase/features';

export const REGION_TYPE_COLORS = {
  state:       '#A78BFA',
  region:      '#34D399',
  county:      '#60A5FA',
  island:      '#F97316',
  archipelago: '#0EA5E9',
  other:       '#F59E0B',
};

function polygonCentroid(positions) {
  const lat = positions.reduce((s, p) => s + p[0], 0) / positions.length;
  const lng = positions.reduce((s, p) => s + p[1], 0) / positions.length;
  return [lat, lng];
}

export default function FeatureLayer() {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  // Re-render labels whenever zoom changes
  useMapEvents({ zoom() { setZoom(map.getZoom()); } });
  useEffect(() => { setZoom(map.getZoom()); }, [map]);

  const { features, layers, regionTypeFilters, setSelectedFeature, selectedFeature, editingRegion } = useMapStore();

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

          const mainPositions = polys[0].latlngs.map((p) => [p.lat, p.lng]);
          if (mainPositions.length < 3) return null;
          const centroid = polygonCentroid(mainPositions);

          // Use stored label position if manually moved, otherwise use centroid
          const labelPos = feature.labelLatLng
            ? [feature.labelLatLng.lat, feature.labelLatLng.lng]
            : centroid;

          const icon = L.divIcon({
            className: '',
            html: `<div style="
              text-align:center;
              pointer-events:none;
              transform:translateX(-50%);
              white-space:nowrap;
              font-size:${fontSize}px;
              font-weight:bold;
              color:${regionColor};
              text-shadow:0 0 6px rgba(0,0,0,0.95),0 0 3px rgba(0,0,0,0.95);
              letter-spacing:0.08em;
            ">${properties?.name || ''}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

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
                      fillOpacity: isSelected ? 0.18 : 0,
                      weight: isSelected ? 2 : 1.5,
                      dashArray: '5 4',
                    }}
                    eventHandlers={{ click: handleClick }}
                  />
                );
              })}

              {/* Label marker — draggable to reposition, click to select */}
              <Marker
                position={labelPos}
                icon={icon}
                draggable={true}
                eventHandlers={{
                  click: handleClick,
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
