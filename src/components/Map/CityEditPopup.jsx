import { useState, useEffect } from 'react';
import useMapStore from '../../store/useMapStore';
import { addCity, updateCity, deleteCity } from '../../firebase/cities';

const TYPE_OPTIONS = [
  { value: 'capital',       label: '首都／総督府所在地' },
  { value: 'major_city',    label: '100万人以上の州都' },
  { value: 'state_capital', label: '100万人未満の州都' },
  { value: 'city',          label: 'その他の都市' },
];

// Type indicator dot
const TYPE_COLORS = {
  capital:       '#EF4444',
  major_city:    '#DC2626',
  state_capital: '#3B82F6',
  city:          '#D1D5DB',
};

export default function CityEditPopup() {
  const {
    selectedCity, clearSelectedCity,
    cityDragEnabled, setCityDragEnabled,
    pushHistory,
  } = useMapStore();
  const [form, setForm]     = useState({ name: '', type: 'city', ruby: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Reset form and disable drag whenever a new city is selected
  useEffect(() => {
    if (selectedCity) {
      setForm({ name: selectedCity.name || '', type: selectedCity.type || 'city', ruby: selectedCity.ruby || '' });
      setError('');
      setCityDragEnabled(false);
    }
  }, [selectedCity?.id]);

  if (!selectedCity) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const id = selectedCity.id;
      const before = { name: selectedCity.name || '', type: selectedCity.type || 'city', ruby: selectedCity.ruby || '' };
      const after  = { name: form.name, type: form.type, ruby: form.ruby };
      await updateCity(id, after);
      pushHistory({
        label: '都市編集',
        undoFn: async () => { await updateCity(id, before); },
        redoFn:  async () => { await updateCity(id, after); },
      });
      clearSelectedCity();
    } catch (e) {
      setError('保存に失敗しました: ' + (e.code ?? e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const label = selectedCity.name || '名称未設定';
    if (!window.confirm(`「${label}」を削除しますか？`)) return;
    try {
      const snapshot = { ...selectedCity };
      await deleteCity(snapshot.id);
      const ref = { id: snapshot.id };
      pushHistory({
        label: '都市削除',
        undoFn: async () => {
          const newId = await addCity({ lat: snapshot.lat, lng: snapshot.lng, name: snapshot.name || '', type: snapshot.type || 'city', ruby: snapshot.ruby || '' });
          ref.id = newId;
        },
        redoFn: async () => { await deleteCity(ref.id); },
      });
      clearSelectedCity();
    } catch (e) {
      setError('削除に失敗しました: ' + (e.code ?? e.message));
    }
  };

  const dotColor = TYPE_COLORS[form.type] ?? '#9CA3AF';

  return (
    <div className="absolute bottom-14 left-2 right-2
                    md:bottom-auto md:top-4 md:right-4 md:left-auto md:w-64
                    z-[400] bg-gray-800 text-white rounded-xl
                    shadow-2xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700">
        <span
          className="w-3 h-3 rounded-full shrink-0 border border-white/20"
          style={{ backgroundColor: dotColor }}
        />
        <h3 className="font-bold text-sm flex-1 truncate">
          {selectedCity.name || '名称未設定'}
        </h3>
        <button
          onClick={clearSelectedCity}
          className="text-gray-400 hover:text-white text-lg leading-none ml-1"
        >
          ×
        </button>
      </div>

      {/* Form body */}
      <div className="px-4 py-3 space-y-3">
        {/* City name */}
        <div>
          <label className="text-xs text-gray-400">都市名</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="都市名を入力"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="w-full bg-gray-700 rounded px-2 py-1.5 text-sm mt-0.5
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Ruby */}
        <div>
          <label className="text-xs text-gray-400">読み（ルビ）</label>
          <input
            value={form.ruby}
            onChange={(e) => setForm({ ...form, ruby: e.target.value })}
            placeholder="よみがな（任意）"
            className="w-full bg-gray-700 rounded px-2 py-1.5 text-sm mt-0.5
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Type selector */}
        <div>
          <label className="text-xs text-gray-400">種別</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="w-full bg-gray-700 rounded px-2 py-1.5 text-sm mt-0.5
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Position drag toggle */}
        <div>
          <button
            onClick={() => setCityDragEnabled(!cityDragEnabled)}
            className={`w-full rounded px-2 py-1.5 text-sm font-medium transition-colors border
              ${cityDragEnabled
                ? 'bg-amber-500 hover:bg-amber-600 text-black border-amber-400'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600'
              }`}
          >
            {cityDragEnabled ? '📍 ドラッグ有効' : '位置を移動'}
          </button>
          {cityDragEnabled && (
            <p className="text-xs text-amber-400 mt-1 text-center">
              地図上でドラッグして位置を変更
            </p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 px-4 pb-2">{error}</p>
      )}

      {/* Footer buttons */}
      <div className="px-4 pb-3 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-green-700 hover:bg-green-800 disabled:opacity-50
                       rounded-lg py-1.5 text-sm font-medium transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={clearSelectedCity}
            className="flex-1 bg-gray-600 hover:bg-gray-700 rounded-lg py-1.5 text-sm transition-colors"
          >
            キャンセル
          </button>
        </div>

        {/* Delete — visually de-emphasized to reduce accidental clicks */}
        <button
          onClick={handleDelete}
          className="w-full py-1.5 text-sm text-red-400 hover:text-red-300
                     hover:bg-red-900/20 rounded-lg transition-colors
                     border border-red-900/40"
        >
          削除
        </button>
      </div>
    </div>
  );
}
