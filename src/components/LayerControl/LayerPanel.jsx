import useMapStore from '../../store/useMapStore';

const LAYERS = [
  { key: 'city',           label: '都市・首都',      color: '#EF4444' },
  { key: 'highway',        label: '高速道路',         color: '#F97316' },
  { key: 'highspeed_rail', label: '高速鉄道',         color: '#EC4899' },
  { key: 'railway',        label: '幹線鉄道',         color: '#1F2937' },
  { key: 'border',         label: '州境線',           color: '#6B7280' },
  { key: 'diplomatic',     label: '外交関係ライン',   color: '#3B82F6' },
  { key: 'features',       label: '地物（カスタム）', color: '#8B5CF6' },
];

export default function LayerPanel() {
  const { layers, toggleLayer, overlayOpacity, setOverlayOpacity } = useMapStore();

  return (
    <div className="w-44 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0">
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
          </li>
        ))}
      </ul>

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
