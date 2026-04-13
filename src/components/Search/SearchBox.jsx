import { useState, useMemo } from 'react';
import useMapStore from '../../store/useMapStore';

const TYPE_LABEL = {
  capital:       '首都',
  major_city:    '大都市',
  state_capital: '州都',
  city:          '都市',
};

const CAT_LABEL = {
  sea:            '海',
  lake:           '湖・湾',
  mountain_range: '山脈',
  mountain:       '山',
  river:          '川',
  island:         '島',
  peninsula:      '半島',
  other:          '地名',
};

export default function SearchBox() {
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const {
    cities, placeNames,
    setFlyToTarget, setSearchHighlight, clearSearchHighlight,
  } = useMapStore();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const cityHits = cities
      .filter((c) => c.name && c.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((c) => ({ ...c, source: 'city', typeLabel: TYPE_LABEL[c.type] ?? '都市' }));

    const labelHits = placeNames
      .filter((p) => p.name && p.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((p) => ({ ...p, source: 'placeName', typeLabel: CAT_LABEL[p.category] ?? '地名' }));

    return [...cityHits, ...labelHits].slice(0, 8);
  }, [query, cities, placeNames]);

  const handleSelect = (item) => {
    setFlyToTarget({ lat: item.lat, lng: item.lng });
    setSearchHighlight({ id: item.id, lat: item.lat, lng: item.lng, source: item.source });
    setQuery(item.name);
    setOpen(false);
  };

  return (
    <div className="relative w-48">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          setOpen(true);
          if (!v.trim()) clearSearchHighlight();
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); clearSearchHighlight(); }, 150)}
        placeholder="🔍 地名・都市を検索"
        className="w-full bg-gray-700 text-white text-xs px-3 py-1 rounded
                   border border-gray-600 focus:outline-none focus:border-blue-400
                   placeholder-gray-500"
      />
      {open && results.length > 0 && (
        <ul className="absolute top-full mt-1 left-0 right-0 bg-gray-800 border border-gray-600
                       rounded-lg overflow-hidden shadow-2xl z-[600]">
          {results.map((item) => (
            <li key={`${item.source}-${item.id}`}>
              <button
                onMouseDown={() => handleSelect(item)}
                className="w-full text-left px-3 py-2 text-sm text-gray-200
                           hover:bg-gray-700 flex items-center gap-2 transition-colors"
              >
                <span className="text-gray-500 text-xs shrink-0 w-10">{item.typeLabel}</span>
                <span className="truncate">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
