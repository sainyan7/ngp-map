import { useState } from 'react';
import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';
import { addFeature } from '../../firebase/features';

const TARGET_LABELS = {
  region:      '地方',
  state:       '州',
  archipelago: '諸島',
};

// Which source types are selectable for each target type
const SOURCE_TYPE = {
  region:      'state',   // 地方 ← 州
  state:       'county',  // 州   ← 郡・市域
  archipelago: 'island',  // 諸島 ← 島
};

export default function RegionMergePanel() {
  const {
    regionMergeMode,
    regionMergeTargetType,
    regionMergeSelection,
    clearRegionMerge,
  } = useMapStore();
  const { nickname } = useAuthStore();
  const [name, setName] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!regionMergeMode) return null;

  const targetLabel = TARGET_LABELS[regionMergeTargetType] ?? '領域';
  const sourceLabel = SOURCE_TYPE[regionMergeTargetType];
  const canMerge = regionMergeSelection.length >= 2;

  const handleMerge = async () => {
    if (!canMerge || !name.trim() || saving) return;
    setSaving(true);
    // Collect all polygons from every selected source region
    const allPolygons = regionMergeSelection.flatMap((f) => f.polygons ?? []);
    await addFeature({
      layerType: 'region',
      type: 'region',
      polygons: allPolygons,
      properties: { name: name.trim(), regionType: regionMergeTargetType },
      updatedBy: nickname,
    });
    setSaving(false);
    setName('');
    setShowInput(false);
    clearRegionMerge();
  };

  const selectedNames = regionMergeSelection.map((f) => f.properties?.name || '名称未設定');

  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[500] flex flex-col items-center gap-2
                    bg-gray-800 px-4 py-3 rounded-xl border border-violet-500 shadow-xl w-80 max-w-[92vw]">
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <span className="text-xs text-violet-300 font-bold">
          結合モード — {targetLabel}を作成
        </span>
        <button onClick={clearRegionMerge} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
      </div>

      {/* Selection status */}
      <div className="w-full text-xs text-gray-400 min-h-[1.5rem]">
        {regionMergeSelection.length === 0
          ? `地図上の${sourceLabel ? `「${sourceLabel}」` : ''}領域をクリックして選択`
          : selectedNames.join('、')}
      </div>

      {/* Action area */}
      {showInput ? (
        <div className="w-full flex flex-col gap-2">
          <input
            data-1p-ignore
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${targetLabel}の名称を入力`}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleMerge(); if (e.key === 'Escape') setShowInput(false); }}
            className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm border border-gray-600
                       focus:outline-none focus:border-violet-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleMerge}
              disabled={saving || !name.trim()}
              className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm rounded-lg py-1.5"
            >
              {saving ? '保存中...' : '確定'}
            </button>
            <button
              onClick={() => setShowInput(false)}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg py-1.5"
            >
              戻る
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 w-full">
          <button
            onClick={() => canMerge && setShowInput(true)}
            disabled={!canMerge}
            className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm rounded-lg py-1.5"
          >
            結合する（{regionMergeSelection.length}件）
          </button>
        </div>
      )}
    </div>
  );
}
