import { CircleMarker, Polyline, Polygon, Tooltip } from 'react-leaflet';
import useMapStore from '../../store/useMapStore';

export default function FeatureLayer() {
  const { features, layers, setSelectedFeature } = useMapStore();

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
