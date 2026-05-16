import React from 'react';
import L from 'leaflet';
import { CircleMarker, Marker, Polyline, Polygon, Tooltip } from 'react-leaflet';
import useMapStore from '../../store/useMapStore';

const REGION_TYPE_COLORS = {
  state:  '#A78BFA',
  region: '#34D399',
  county: '#60A5FA',
  other:  '#F59E0B',
};
const REGION_TYPE_LABELS = {
  state: '州', region: '地方', county: '郡', other: 'その他',
};

function polygonCentroid(positions) {
  const lat = positions.reduce((s, p) => s + p[0], 0) / positions.length;
  const lng = positions.reduce((s, p) => s + p[1], 0) / positions.length;
  return [lat, lng];
}

export default function FeatureLayer() {
  const { features, layers, setSelectedFeature, selectedFeature, editingRegion } = useMapStore();

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
          const polys = feature.polygons ?? [];
          if (polys.length === 0) return null;
          const isSelected = selectedFeature?.id === id;
          const color = REGION_TYPE_COLORS[properties?.regionType] ?? '#A78BFA';
          const typeLabel = REGION_TYPE_LABELS[properties?.regionType] ?? '';
          const mainPositions = polys[0].latlngs.map((p) => [p.lat, p.lng]);
          if (mainPositions.length < 3) return null;
          const center = polygonCentroid(mainPositions);
          const icon = L.divIcon({
            className: '',
            html: `<div style="text-align:center;pointer-events:none;transform:translateX(-50%);white-space:nowrap;">
              <span style="font-size:13px;font-weight:bold;color:${color};
                text-shadow:0 0 6px rgba(0,0,0,0.9),0 0 3px rgba(0,0,0,0.9);
                letter-spacing:0.1em;">${properties?.name || ''}</span><br>
              <span style="font-size:9px;color:#ccc;text-shadow:0 0 4px rgba(0,0,0,0.9);">${typeLabel}</span>
            </div>`,
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
                      color,
                      fillColor: color,
                      fillOpacity: isSelected ? 0.18 : 0,
                      weight: isSelected ? 2 : 1.5,
                      dashArray: '5 4',
                    }}
                    eventHandlers={{ click: handleClick }}
                  />
                );
              })}
              <Marker position={center} icon={icon} interactive={false} />
            </React.Fragment>
          );
        }

        if (type === 'point') {
          // geometry.latlng is { lat, lng }
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
          // geometry.latlngs is [{ lat, lng }, ...]
          const positions = (geometry?.latlngs ?? []).map((p) => [p.lat, p.lng]);
          if (positions.length < 2) return null;
          return (
            <Polyline
              key={id}
              positions={positions}
              pathOptions={{ color, weight: 2 }}
              eventHandlers={{ click: handleClick }}
            >
              {properties.name && (
                <Tooltip sticky>
                  {properties.name}
                </Tooltip>
              )}
            </Polyline>
          );
        }

        if (type === 'polygon') {
          // geometry.latlngs is [{ lat, lng }, ...]
          const positions = (geometry?.latlngs ?? []).map((p) => [p.lat, p.lng]);
          if (positions.length < 3) return null;
          return (
            <Polygon
              key={id}
              positions={positions}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2 }}
              eventHandlers={{ click: handleClick }}
            >
              {properties.name && (
                <Tooltip sticky>
                  {properties.name}
                </Tooltip>
              )}
            </Polygon>
          );
        }

        return null;
      })}
    </>
  );
}
