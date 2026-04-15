import { useState, useEffect } from 'react';
import useMapStore from '../../store/useMapStore';
import { addFacility, updateFacility, deleteFacility } from '../../firebase/facilities';

const TYPE_OPTIONS = [
  { value: 'airport',  label: '空港／飛行場' },
  { value: 'port',     label: '港' },
  { value: 'military', label: '軍事基地' },
  { value: 'other',    label: 'その他の重要施設' },
];

const SUBTYPE_OPTIONS = {
  airport:  [
    { value: 'international',  label: '国際空港' },
    { value: 'regional',       label: '地方空港' },
    { value: 'joint_use',      label: '軍民共用飛行場' },
    { value: 'other_airfield', label: 'その他の飛行場' },
  ],
  port: [
    { value: 'major_port',    label: '重要港' },
    { value: 'regional_port', label: '地方港' },
  ],
  military: [
    { value: 'garrison',       label: '駐屯地' },
    { value: 'air_base',       label: '航空基地' },
    { value: 'joint_use',      label: '軍民共用飛行場' },
    { value: 'naval_base',     label: '軍港' },
    { value: 'other_military', label: 'その他の軍事施設' },
  ],
  other: [],
};

const DEFAULT_SUBTYPE = {
  airport:  'international',
  port:     'major_port',
  military: 'garrison',
  other:    null,
};

const TYPE_COLORS = {
  airport:  '#3B82F6',
  port:     '#0D9488',
  military: '#4D7C0F',
  other:    '#7C3AED',
};

export default function FacilityEditPopup() {
  const {
    selectedFacility, clearSelectedFacility,
    facilityDragEnabled, setFacilityDragEnabled,
    pushHistory,
  } = useMapStore();
  const [form, setForm]     = useState({ name: '', type: 'airport', subtype: 'international', ruby: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (selectedFacility) {
      setForm({
        name:    selectedFacility.name    || '',
        type:    selectedFacility.type    || 'airport',
        subtype: selectedFacility.subtype ?? DEFAULT_SUBTYPE[selectedFacility.type ?? 'airport'],
        ruby:    selectedFacility.ruby    || '',
      });
      setError('');
      setFacilityDragEnabled(false);
    }
  }, [selectedFacility?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedFacility) return null;

  const handleTypeChange = (newType) => {
    setForm((f) => ({
      ...f,
      type:    newType,
      subtype: DEFAULT_SUBTYPE[newType],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const data = { name: form.name, type: form.type, subtype: form.subtype ?? null, ruby: form.ruby };
      if (selectedFacility.id) {
        const id = selectedFacility.id;
        const before = { name: selectedFacility.name || '', type: selectedFacility.type || 'airport', subtype: selectedFacility.subtype ?? null, ruby: selectedFacility.ruby || '' };
        await updateFacility(id, data);
        pushHistory({
          label: '施設編集',
          undoFn: async () => { await updateFacility(id, before); },
          redoFn:  async () => { await updateFacility(id, data); },
        });
      } else {
        const { lat, lng } = selectedFacility;
        const newId = await addFacility({ lat, lng, ...data });
        const ref = { id: newId };
        pushHistory({
          label: '施設追加',
          undoFn: async () => { await deleteFacility(ref.id); },
          redoFn:  async () => {
            const id = await addFacility({ lat, lng, ...data });
            ref.id = id;
          },
        });
      }
      clearSelectedFacility();
    } catch (e) {
      setError('保存に失敗しました: ' + (e.code ?? e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const label = selectedFacility.name || '名称未設定';
    if (!selectedFacility.id) { clearSelectedFacility(); return; }
    if (!window.confirm(`「${label}」を削除しますか？`)) return;
    try {
      const snapshot = { ...selectedFacility };
      await deleteFacility(snapshot.id);
      const ref = { id: snapshot.id };
      pushHistory({
        label: '施設削除',
        undoFn: async () => {
          const newId = await addFacility({ lat: snapshot.lat, lng: snapshot.lng, name: snapshot.name || '', type: snapshot.type || 'airport', subtype: snapshot.subtype ?? null, ruby: snapshot.ruby || '' });
          ref.id = newId;
        },
        redoFn: async () => { await deleteFacility(ref.id); },
      });
      clearSelectedFacility();
    } catch (e) {
      setError('削除に失敗しました: ' + (e.code ?? e.message));
    }
  };

  const dotColor = TYPE_COLORS[form.type] ?? '#9CA3AF';
  const subtypeOptions = SUBTYPE_OPTIONS[form.type] ?? [];

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
          {selectedFacility.name || '名称未設定'}
        </h3>
        <button
          onClick={clearSelectedFacility}
          className="text-gray-400 hover:text-white text-lg leading-none ml-1"
        >
          ×
        </button>
      </div>

      {/* Form body */}
      <div className="px-4 py-3 space-y-3">
        {/* Facility name */}
        <div>
          <label className="text-xs text-gray-400">施設名</label>
          <input
            data-1p-ignore
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="施設名を入力"
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
            data-1p-ignore
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
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full bg-gray-700 rounded px-2 py-1.5 text-sm mt-0.5
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Subtype selector — hidden for 'other' */}
        {subtypeOptions.length > 0 && (
          <div>
            <label className="text-xs text-gray-400">詳細種別</label>
            <select
              value={form.subtype ?? ''}
              onChange={(e) => setForm({ ...form, subtype: e.target.value })}
              className="w-full bg-gray-700 rounded px-2 py-1.5 text-sm mt-0.5
                         focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {subtypeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Position drag toggle */}
        <div>
          <button
            onClick={() => setFacilityDragEnabled(!facilityDragEnabled)}
            className={`w-full rounded px-2 py-1.5 text-sm font-medium transition-colors border
              ${facilityDragEnabled
                ? 'bg-amber-500 hover:bg-amber-600 text-black border-amber-400'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600'
              }`}
          >
            {facilityDragEnabled ? '📍 ドラッグ有効' : '位置を移動'}
          </button>
          {facilityDragEnabled && (
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
            onClick={clearSelectedFacility}
            className="flex-1 bg-gray-600 hover:bg-gray-700 rounded-lg py-1.5 text-sm transition-colors"
          >
            キャンセル
          </button>
        </div>

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
