import { useEffect, useState } from 'react';
import { Polyline, Popup } from 'react-leaflet';
import { subscribeFactions, subscribeAllDiplomaticRelations } from '../../firebase/factions';
import useMapStore from '../../store/useMapStore';

const LINE_STYLES = {
  ally:     { color: '#3B82F6', dashArray: null,  weight: 3 },
  friendly: { color: '#22C55E', dashArray: null,  weight: 2 },
  neutral:  { color: '#9CA3AF', dashArray: null,  weight: 1 },
  tense:    { color: '#F97316', dashArray: '8 4', weight: 2 },
  hostile:  { color: '#EF4444', dashArray: '8 4', weight: 3 },
  war:      { color: '#991B1B', dashArray: '4 4', weight: 4 },
};

const RELATION_LABELS = {
  ally: '同盟',
  friendly: '友好',
  neutral: '中立',
  tense: '緊張',
  hostile: '敵対',
  war: '戦争中',
};

export default function DiplomaticLines() {
  const { layers, features } = useMapStore();
  const [factions, setFactions] = useState([]);
  const [relations, setRelations] = useState([]);

  useEffect(() => {
    const unsub1 = subscribeFactions(setFactions);
    const unsub2 = subscribeAllDiplomaticRelations(setRelations);
    return () => { unsub1(); unsub2(); };
  }, []);

  if (!layers.diplomatic) return null;

  // Build a map of factionId → capital coordinates
  // Capital is matched by finding a city feature whose name equals faction.capital
  const capitalCoords = {};
  factions.forEach((faction) => {
    if (!faction.capital) return;
    const capitalFeature = features.find(
      (f) =>
        f.layerType === 'city' &&
        f.type === 'point' &&
        f.properties?.name === faction.capital
    );
    if (!capitalFeature) return;
    const latlngs = capitalFeature.geometry?.latlngs;
    const pos = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
    if (pos && pos.length >= 2) {
      capitalCoords[faction.id] = pos;
    }
  });

  // Build a map of factionId → faction for name lookups
  const factionMap = Object.fromEntries(factions.map((f) => [f.id, f]));

  // Deduplicate: only draw A→B once (not both A→B and B→A)
  const drawn = new Set();
  const lines = [];

  relations.forEach((rel) => {
    const { factionId, targetFactionId, relationType } = rel;
    const key = [factionId, targetFactionId].sort().join('|');
    if (drawn.has(key)) return;
    drawn.add(key);

    // Skip neutral by default (hidden)
    if (relationType === 'neutral') return;

    const start = capitalCoords[factionId];
    const end = capitalCoords[targetFactionId];
    if (!start || !end) return;

    const style = LINE_STYLES[relationType] || LINE_STYLES.neutral;
    const factionA = factionMap[factionId];
    const factionB = factionMap[targetFactionId];

    lines.push({ key, start, end, style, rel, factionA, factionB });
  });

  return (
    <>
      {lines.map(({ key, start, end, style, rel, factionA, factionB }) => (
        <Polyline
          key={key}
          positions={[start, end]}
          pathOptions={{
            color: style.color,
            weight: style.weight,
            dashArray: style.dashArray,
            opacity: 0.85,
          }}
        >
          <Popup>
            <div className="text-sm min-w-[160px]">
              <div className="font-bold mb-1" style={{ color: style.color }}>
                {RELATION_LABELS[rel.relationType] || rel.relationType}
              </div>
              <div className="text-gray-700">
                {factionA?.name || factionId} ↔ {factionB?.name || targetFactionId}
              </div>
              {rel.description && (
                <div className="text-gray-500 text-xs mt-1">{rel.description}</div>
              )}
            </div>
          </Popup>
        </Polyline>
      ))}
    </>
  );
}
