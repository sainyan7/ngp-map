import { useState } from 'react';
import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';
import { updateFeature, deleteFeature } from '../../firebase/features';

const LAYER_LABELS = {
  border: '州境・地域区分',
  city: '都市・拠点',
  terrain: '地形情報',
  transport: '交通インフラ',
  military: '軍事施設',
  territory: '勢力支配域',
  event: 'イベントマーカー',
};

export default function FeaturePopup() {
  const { selectedFeature, clearSelectedFeature } = useMapStore();
  const { nickname } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  if (!selectedFeature) return null;

  const { id, layerType, properties = {} } = selectedFeature;

  const startEdit = () => {
    setForm({
      name: properties.name || '',
      subType: properties.subType || '',
      description: properties.description || '',
      color: properties.color || '#3B82F6',
    });
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
            {properties.subType ? ` / ${properties.subType}` : ''}
          </p>
          {properties.description && (
            <p className="text-sm text-gray-300 mb-3 whitespace-pre-wrap">
              {properties.description}
            </p>
          )}
          {properties.color && (
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-4 h-4 rounded-sm border border-gray-600"
                style={{ backgroundColor: properties.color }}
              />
              <span className="text-xs text-gray-400">{properties.color}</span>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={startEdit}
              className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-lg py-1.5 text-sm"
            >
              編集
            </button>
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
          <h3 className="font-bold text-base mb-3">地物を編集</h3>
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
