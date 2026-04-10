import { Polyline } from 'react-leaflet';
import useMapStore from '../../store/useMapStore';

const ROAD_STYLES = {
  highway:       { color: '#F97316', weight: 4, dashArray: null,   opacity: 0.9 },
  highspeed_rail: { color: '#EC4899', weight: 3, dashArray: null,   opacity: 0.85 },
  railway:       { color: '#1F2937', weight: 2, dashArray: null,   opacity: 0.75 },
  border:        { color: '#6B7280', weight: 2, dashArray: '8 6',  opacity: 0.8 },
};

// Which store layer key controls each road type
const LAYER_KEY = {
  highway:        'highway',
  highspeed_rail: 'highspeed_rail',
  railway:        'railway',
  border:         'border',
};

export default function RoadLayer() {
  const { roads, layers } = useMapStore();

  return (
    <>
      {roads.map((road) => {
        const layerKey = LAYER_KEY[road.type];
        if (layerKey && !layers[layerKey]) return null;

        const style = ROAD_STYLES[road.type] ?? ROAD_STYLES.railway;
        // points stored as [{lat,lng},...] objects in Firestore
        const positions = (road.points ?? []).map((p) => [p.lat, p.lng]);
        if (positions.length < 2) return null;

        return (
          <Polyline
            key={road.id}
            positions={positions}
            pathOptions={{
              color: style.color,
              weight: style.weight,
              dashArray: style.dashArray,
              opacity: style.opacity,
            }}
          />
        );
      })}
    </>
  );
}
