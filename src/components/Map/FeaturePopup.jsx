import { useState } from 'react';
import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';
import { updateFeature, deleteFeature } from '../../firebase/features';

const LAYER_LABELS = {
  border:   '州境・地域区分',
  city:     '都市・拠点',
  terrain:  '地形情報',
  transport:'交通インフラ',
  military: '軍事施設',
  territory:'勢力支配域',
  event:    'イベントマーカー',
  region:   '領域',
};

const REGION_TYPES = [
  { value: 'state',       label: '州' },
  { value: 'region',      label: '地方' },
  { value: 'county',      label: '郡・市域' },
  { value: 'island',      label: '島' },
  { value: 'archipelago', label: '諸島' },
  { value: 'other',       label: 'その他' },
];
const REGION_TYPE_LABELS = { state: '州', region: '地方', county: '郡・市域', island: '島', archipelago: '諸島', other: 'その他' };

// Merge: which type can be grouped into which parent type
const MERGE_CONFIG = {
  state:  { targetType: 'region',      label: '地方として結合' },
  county: { targetType: 'state',       label: '州として結合' },
  island: { targetType: 'archipelago', label: '諸島として結合' },
};

export default function FeaturePopup() {
  const {
    selectedFeature, clearSelectedFeature, setEditingRegion, setAddingExclaveToRegion,
    startRegionMerge, features,
    regionLabelDragEnabled, setRegionLabelDragEnabled, pushHistory,
  } = useMapStore();
  const { nickname } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  if (!selectedFeature) return null;

  const { id, layerType, properties = {} } = selectedFeature;
  // Use live feature from store so labelLatLng reflects post-drag state
  const liveFeature = features.find((f) => f.id === id);
  const isRegion = layerType === 'region';

  const startEdit = () => {
    setForm(isRegion
      ? { name: properties.name || '', regionType: properties.regionType || 'state' }
      : { name: properties.name || '', subType: properties.subType || '', description: properties.description || '', color: properties.color || '#3B82F6' }
    );
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await updateFeature(id, {
      properties: { ...properties, ...form },
      updatedBy: nickname,
    });
    setSaving(false);
    setEditing(false);
    clearSelectedFeature();
  };

  const handleDelete = async () => {
    if (!window.confirm(`「${properties.name || '名称未設定'}」を削除しますか？`)) return;
    await deleteFeature(id);
    clearSelectedFeature();
  };

  return (
    <div
      className="absolute bottom-14 left-2 right-2
                 md:bottom-auto md:top-4 md:right-4 md:left-auto md:w-72
                 z-[400] bg-gray-800 text-white rounded-xl
                 shadow-2xl p-4 border border-gray-700"
    >
      {/* Close button */}
      <button
        onClick={clearSelectedFeature}
        className="absolute top-2 right-2 text-gray-400 hover:text-white text-lg leading-none"
      >
        ×
      </button>

      {!editing ? (
        <>
          <h3 className="font-bold text-lg mb-1 pr-6">
            {properties.name || '名称未設定'}
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            {LAYER_LABELS[layerType] || layerType}
            {isRegion
              ? (properties.regionType ? ` / ${REGION_TYPE_LABELS[properties.regionType] ?? properties.regionType}` : '')
              : (properties.subType ? ` / ${properties.subType}` : '')}
          </p>
          {!isRegion && properties.description && (
            <p className="text-sm text-gray-300 mb-3 whitespace-pre-wrap">
              {properties.description}
            </p>
          )}
          {!isRegion && properties.color && (
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-4 h-4 rounded-sm border border-gray-600"
                style={{ backgroundColor: properties.color }}
              />
              <span className="text-xs text-gray-400">{properties.color}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={startEdit}
              className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-1.5 text-sm"
            >
              編集
            </button>
            {isRegion && (
              <button
                onClick={() => { setEditingRegion(selectedFeature); clearSelectedFeature(); }}
                className="flex-1 bg-indigo-700 hover:bg-indigo-600 rounded-lg py-1.5 text-sm"
              >
                頂点編集
              </button>
            )}
            {isRegion && (
              <button
                onClick={() => { setAddingExclaveToRegion(selectedFeature); clearSelectedFeature(); }}
                className="w-full bg-teal-700 hover:bg-teal-600 rounded-lg py-1.5 text-sm"
              >
                領域を追加
              </button>
            )}
            {isRegion && MERGE_CONFIG[properties?.regionType] && (
              <button
                onClick={() => startRegionMerge(MERGE_CONFIG[properties.regionType].targetType, selectedFeature)}
                className="w-full bg-violet-700 hover:bg-violet-600 rounded-lg py-1.5 text-sm"
              >
                {MERGE_CONFIG[properties.regionType].label}
              </button>
            )}
            {isRegion && (
              <>
                <button
                  onClick={() => setRegionLabelDragEnabled(!regionLabelDragEnabled)}
                  className={`w-full rounded-lg py-1.5 text-sm font-medium transition-colors border
                    ${regionLabelDragEnabled
                      ? 'bg-amber-500 hover:bg-amber-600 text-black border-amber-400'
                      : 'bg-gray-600 hover:bg-gray-500 border-gray-500'
                    }`}
                >
                  {regionLabelDragEnabled ? '📍 ラベルドラッグ有効' : 'ラベル位置を移動'}
                </button>
                {regionLabelDragEnabled && (
                  <p className="w-full text-xs text-amber-400 text-center -mt-1">
                    地図上のラベルをドラッグして位置を変更
                  </p>
                )}
              </>
            )}
            {isRegion && liveFeature?.labelLatLng && (
              <button
                onClick={async () => {
                  const before = { ...liveFeature.labelLatLng };
                  await updateFeature(id, { labelLatLng: null });
                  pushHistory({
                    label: 'ラベル位置リセット',
                    undoFn: async () => { await updateFeature(id, { labelLatLng: before }); },
                    redoFn: async () => { await updateFeature(id, { labelLatLng: null }); },
                  });
                  clearSelectedFeature();
                }}
                className="w-full bg-gray-600 hover:bg-gray-500 rounded-lg py-1.5 text-sm"
              >
                ラベル位置をリセット
              </button>
            )}
            <button
              onClick={handleDelete}
              className="flex-1 bg-red-700 hover:bg-red-800 rounded-lg py-1.5 text-sm"
            >
              削除
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="font-bold text-base mb-3">
            {isRegion ? '領域を編集' : '地物を編集'}
          </h3>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-gray-400">名称</label>
              <input
                data-1p-ignore
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-700 rounded px-2 py-1 text-sm mt-0.5"
              />
            </div>
            {isRegion ? (
              <div>
                <label className="text-xs text-gray-400">領域種別</label>
                <select
                  value={form.regionType}
                  onChange={(e) => setForm({ ...form, regionType: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded px-2 py-1 text-sm mt-0.5 border border-gray-600"
                >
                  {REGION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs text-gray-400">種別</label>
                  <input
                    data-1p-ignore
                    value={form.subType}
                    onChange={(e) => setForm({ ...form, subType: e.target.value })}
                    className="w-full bg-gray-700 rounded px-2 py-1 text-sm mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">説明</label>
                  <textarea
                    data-1p-ignore
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    className="w-full bg-gray-700 rounded px-2 py-1 text-sm mt-0.5 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">色</label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                    />
                    <input
                      data-1p-ignore
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="flex-1 bg-gray-700 rounded px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-green-700 hover:bg-green-800 disabled:opacity-50 rounded-lg py-1.5 text-sm"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 bg-gray-600 hover:bg-gray-700 rounded-lg py-1.5 text-sm"
            >
              キャンセル
            </button>
          </div>
        </>
      )}
    </div>
  );
}
