import { useState, useEffect } from 'react';
import useMapStore from '../../store/useMapStore';
import { updateCity } from '../../firebase/cities';

const TYPE_OPTIONS = [
  { value: 'capital',       label: '首都（赤■）' },
  { value: 'major_city',    label: '大都市（赤中黒■）' },
  { value: 'state_capital', label: '州都（青●）' },
  { value: 'city',          label: 'その他の都市（白●）' },
];

export default function CityEditPopup() {
  const { selectedCity, clearSelectedCity } = useMapStore();
  const [form, setForm]     = useState({ name: '', type: 'city' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // 都市が選択されたら即フォームを初期化
  useEffect(() => {
    if (selectedCity) {
      setForm({ name: selectedCity.name || '', type: selectedCity.type || 'city' });
      setError('');
    }
  }, [selectedCity]);

  if (!selectedCity) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateCity(selectedCity.id, { name: form.name, type: form.type });
      clearSelectedCity();
    } catch (e) {
      setError('保存に失敗しました: ' + (e.code ?? e.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute top-4 right-4 z-[400] bg-gray-800 text-white rounded-xl
                    shadow-2xl w-64 p-4 border border-gray-700">
      <button
        onClick={clearSelectedCity}
        className="absolute top-2 right-2 text-gray-400 hover:text-white text-lg leading-none"
      >
        ×
      </button>

      <h3 className="font-bold text-base mb-3 pr-6">都市を編集</h3>

      <div className="space-y-3">
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
      </div>

      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-green-700 hover:bg-green-800 disabled:opacity-50
                     rounded-lg py-1.5 text-sm"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={clearSelectedCity}
          className="flex-1 bg-gray-600 hover:bg-gray-700 rounded-lg py-1.5 text-sm"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
