import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';

const LAYERS = [
  { key: 'city',           label: '都市・首都',      color: '#EF4444' },
  { key: 'place_names',    label: '地名',             color: '#93C5FD' },
  { key: 'facilities',     label: '重要施設',         color: '#F59E0B' },
  { key: 'highway',        label: '高速道路',         color: '#F97316' },
  { key: 'highspeed_rail', label: '高速鉄道',         color: '#EC4899' },
  { key: 'railway',        label: '幹線鉄道',         color: '#1F2937' },
  { key: 'border',          label: '州境線',           color: '#6B7280' },
  { key: 'regional_border', label: '地方境',           color: '#D97706' },
];

export default function LayerPanel({ open }) {
  const { layers, toggleLayer, overlayOpacity, setOverlayOpacity, showRuby, toggleRuby, showFacilityLabel, toggleFacilityLabel, kmPerUnit, setKmPerUnit, facilityTypeFilters, toggleFacilityTypeFilter } = useMapStore();
  const { isAdmin } = useAuthStore();

  return (
    <div className={`${open ? 'flex' : 'hidden'} md:flex w-44 bg-gray-800 border-r border-gray-700 flex-col shrink-0 relative z-20`}>
      <div className="px-3 py-2 border-b border-gray-700">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">レイヤー</h2>
      </div>

      <ul className="flex-1 overflow-y-auto py-1">
        {LAYERS.map(({ key, label, color }) => (
          <li key={key}>
            <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-700 transition-colors">
              <input
                type="checkbox"
                checked={layers[key] ?? false}
                onChange={() => toggleLayer(key)}
                className="w-3.5 h-3.5 rounded cursor-pointer"
                style={{ accentColor: color }}
              />
              <span className="flex items-center gap-1.5 text-sm text-gray-200 select-none">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: color }}
                />
                {label}
              </span>
            </label>
            {/* Facility type sub-filters — only shown when facilities layer is on */}
            {key === 'facilities' && layers.facilities && (
              <ul className="pb-0.5">
                {[
                  { key: 'military', label: '軍事',           color: '#4D7C0F' },
                  { key: 'airport',  label: '空港',           color: '#3B82F6' },
                  { key: 'port',     label: '港',              color: '#0D9488' },
                  { key: 'other',    label: 'その他施設',       color: '#7C3AED' },
                ].map((f) => (
                  <li key={f.key}>
                    <label className="flex items-center gap-2 pl-5 pr-3 py-0.5 cursor-pointer hover:bg-gray-700/60 transition-colors">
                      <input
                        type="checkbox"
                        checked={facilityTypeFilters[f.key] ?? true}
                        onChange={() => toggleFacilityTypeFilter(f.key)}
                        className="w-3 h-3 rounded cursor-pointer"
                        style={{ accentColor: f.color }}
                      />
                      <span className="flex items-center gap-1 text-xs text-gray-400 select-none">
                        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: f.color }} />
                        {f.label}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {/* 表示オプション */}
      <div className="px-3 py-2 border-t border-gray-700 space-y-1.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showRuby}
            onChange={toggleRuby}
            className="w-3.5 h-3.5 rounded cursor-pointer"
            style={{ accentColor: '#93C5FD' }}
          />
          <span className="text-xs text-gray-300 select-none">ルビ表示</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showFacilityLabel}
            onChange={toggleFacilityLabel}
            className="w-3.5 h-3.5 rounded cursor-pointer"
            style={{ accentColor: '#F59E0B' }}
          />
          <span className="text-xs text-gray-300 select-none">施設名表示</span>
        </label>
      </div>

      {/* 距離計測スケール設定（管理者のみ） */}
      {isAdmin && (
        <div className="px-3 py-2 border-t border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">計測スケール</span>
            <span className="text-xs text-gray-500">units/km</span>
          </div>
          <input
            data-1p-ignore
            type="number"
            min={1}
            max={99999}
            value={kmPerUnit}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) setKmPerUnit(v);
            }}
            className="w-full bg-gray-700 text-gray-200 text-xs rounded px-2 py-1
                       border border-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>
      )}

      {/* オーバーレイ濃度スライダー */}
      <div className="px-3 py-3 border-t border-gray-700">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">オーバーレイ濃度</span>
          <span className="text-xs text-gray-400 tabular-nums">
            {Math.round(overlayOpacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={overlayOpacity}
          onChange={(e) => setOverlayOpacity(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{ accentColor: '#6B7280' }}
        />
      </div>
    </div>
  );
}
