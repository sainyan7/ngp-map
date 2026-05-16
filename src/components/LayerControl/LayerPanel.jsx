import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';

// Reusable checkbox row for a top-level layer
function LayerRow({ layerKey, label, color, layers, toggleLayer, indent = false }) {
  return (
    <label className={`flex items-center gap-2 ${indent ? 'pl-5' : 'px-3'} pr-3 py-1.5 cursor-pointer hover:bg-gray-700 transition-colors`}>
      <input
        type="checkbox"
        checked={layers[layerKey] ?? false}
        onChange={() => toggleLayer(layerKey)}
        className="w-3.5 h-3.5 rounded cursor-pointer"
        style={{ accentColor: color }}
      />
      <span className="flex items-center gap-1.5 text-sm text-gray-200 select-none">
        <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
        {label}
      </span>
    </label>
  );
}

// Reusable checkbox row for a sub-filter
function SubRow({ filterKey, label, color, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 pl-7 pr-3 py-0.5 cursor-pointer hover:bg-gray-700/60 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-3 h-3 rounded cursor-pointer"
        style={{ accentColor: color }}
      />
      <span className="flex items-center gap-1 text-xs text-gray-400 select-none">
        <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
        {label}
      </span>
    </label>
  );
}

// Section divider with a label
function GroupHeader({ label }) {
  return (
    <li className="px-3 pt-2 pb-0.5">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
    </li>
  );
}

export default function LayerPanel({ open }) {
  const {
    layers, toggleLayer,
    overlayOpacity, setOverlayOpacity,
    showRuby, toggleRuby,
    showFacilityLabel, toggleFacilityLabel,
    kmPerUnit, setKmPerUnit,
    facilityTypeFilters, toggleFacilityTypeFilter,
    regionTypeFilters, toggleRegionTypeFilter,
  } = useMapStore();
  const { isAdmin } = useAuthStore();

  return (
    <div className={`${open ? 'flex' : 'hidden'} md:flex w-44 bg-gray-800 border-r border-gray-700 flex-col shrink-0 relative z-20`}>
      <div className="px-3 py-2 border-b border-gray-700">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">レイヤー</h2>
      </div>

      <ul className="flex-1 overflow-y-auto py-1">

        {/* ── 都市・地名 ── */}
        <li><LayerRow layerKey="city"        label="都市・首都" color="#EF4444" layers={layers} toggleLayer={toggleLayer} /></li>
        <li><LayerRow layerKey="place_names" label="地名"       color="#93C5FD" layers={layers} toggleLayer={toggleLayer} /></li>

        {/* ── 領域名 ── */}
        <li><LayerRow layerKey="region" label="領域名" color="#A78BFA" layers={layers} toggleLayer={toggleLayer} /></li>
        {layers.region && (
          <>
            <SubRow filterKey="region"      label="地方"     color="#34D399" checked={regionTypeFilters.region}      onChange={() => toggleRegionTypeFilter('region')} />
            <SubRow filterKey="state"       label="州"       color="#A78BFA" checked={regionTypeFilters.state}       onChange={() => toggleRegionTypeFilter('state')} />
            <SubRow filterKey="county"      label="郡・市域" color="#60A5FA" checked={regionTypeFilters.county}      onChange={() => toggleRegionTypeFilter('county')} />
            <SubRow filterKey="island"      label="島"       color="#A7F3D0" checked={regionTypeFilters.island}      onChange={() => toggleRegionTypeFilter('island')} />
            <SubRow filterKey="archipelago" label="諸島"     color="#6EE7B7" checked={regionTypeFilters.archipelago} onChange={() => toggleRegionTypeFilter('archipelago')} />
            <SubRow filterKey="other"       label="その他"   color="#F59E0B" checked={regionTypeFilters.other}       onChange={() => toggleRegionTypeFilter('other')} />
          </>
        )}

        {/* ── 重要施設 ── */}
        <li><LayerRow layerKey="facilities" label="重要施設" color="#F59E0B" layers={layers} toggleLayer={toggleLayer} /></li>
        {layers.facilities && (
          <>
            <SubRow filterKey="military" label="軍事"       color="#4D7C0F" checked={facilityTypeFilters.military} onChange={() => toggleFacilityTypeFilter('military')} />
            <SubRow filterKey="airport"  label="空港"       color="#3B82F6" checked={facilityTypeFilters.airport}  onChange={() => toggleFacilityTypeFilter('airport')} />
            <SubRow filterKey="port"     label="港"         color="#0D9488" checked={facilityTypeFilters.port}     onChange={() => toggleFacilityTypeFilter('port')} />
            <SubRow filterKey="other"    label="その他施設" color="#7C3AED" checked={facilityTypeFilters.other}    onChange={() => toggleFacilityTypeFilter('other')} />
          </>
        )}

        {/* ── 交通 ── */}
        <GroupHeader label="交通" />
        <li><LayerRow layerKey="highway"        label="高速道路" color="#F97316" layers={layers} toggleLayer={toggleLayer} indent /></li>
        <li><LayerRow layerKey="highspeed_rail" label="高速鉄道" color="#EC4899" layers={layers} toggleLayer={toggleLayer} indent /></li>
        <li><LayerRow layerKey="railway"        label="幹線鉄道" color="#6B7280" layers={layers} toggleLayer={toggleLayer} indent /></li>

        {/* ── 境界線 ── */}
        <GroupHeader label="境界線" />
        <li><LayerRow layerKey="border"          label="州境"   color="#9CA3AF" layers={layers} toggleLayer={toggleLayer} indent /></li>
        <li><LayerRow layerKey="regional_border" label="地方境" color="#D97706" layers={layers} toggleLayer={toggleLayer} indent /></li>

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
