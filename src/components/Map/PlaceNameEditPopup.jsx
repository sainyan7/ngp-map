import { useState, useEffect, useMemo } from 'react';
import useMapStore from '../../store/useMapStore';
import { addPlaceName, updatePlaceName, deletePlaceName } from '../../firebase/placeNames';
import { CATEGORY_STYLE } from './PlaceNameLayer';

const CATEGORY_OPTIONS = [
  { value: 'sea',            label: '海・洋' },
  { value: 'strait',         label: '海峡' },
  { value: 'lake',           label: '湖・湾' },
  { value: 'river',          label: '川' },
  { value: 'mountain_range', label: '山脈' },
  { value: 'mountain',       label: '山' },
  { value: 'plateau',        label: '高原' },
  { value: 'plain',          label: '平野' },
  { value: 'desert',         label: '砂漠' },
  { value: 'archipelago',    label: '諸島' },
  { value: 'island',         label: '島' },
  { value: 'peninsula',      label: '半島' },
  { value: 'other',          label: 'その他' },
];

const CATEGORY_COLORS = {
  sea:            '#93C5FD',
  strait:         '#67C8FF',
  lake:           '#7DD3FC',
  mountain_range: '#D6D3D1',
  mountain:       '#D6D3D1',
  plateau:        '#C4B59A',
  plain:          '#B5C9A1',
  desert:         '#D4B483',
  river:          '#67E8F9',
  island:         '#A7F3D0',
  archipelago:    '#6EE7B7',
  peninsula:      '#A7F3D0',
  other:          '#E5E7EB',
};

const LAYOUT_OPTIONS = [
  { value: 'horizontal', label: '横書き' },
  { value: 'vertical',   label: '縦書き' },
  { value: 'arch',       label: 'アーチ' },
];

function calcRubyPx(mainPx) {
  return Math.min(mainPx, Math.max(Math.round(mainPx * 0.75), 9));
}

// Generate preview HTML from form state (mirrors makeTextIcon logic, no Leaflet)
function buildPreviewHtml(form, showRuby) {
  const sBase = CATEGORY_STYLE[form.category] ?? CATEGORY_STYLE.other;
  const s = form.letterSpacing !== ''
    ? { ...sBase, letterSpacing: form.letterSpacing }
    : sBase;
  const fontSize = parseInt(s.fontSize);
  const hasMtn = form.category === 'mountain';
  const prefixHtml = hasMtn
    ? `<span style="font-size:${Math.round(fontSize * 0.7)}px;opacity:0.85;margin-right:2px">▲</span>`
    : '';
  const displayName = form.name || '名称未設定';

  // Ruby below (uses calcRubyPx like the actual icon)
  const rubyPx = calcRubyPx(fontSize);
  const contentHtml = (showRuby && form.ruby)
    ? `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:0">`
      + `<span>${prefixHtml}${displayName}</span>`
      + `<span style="font-size:${rubyPx}px;line-height:0.85;opacity:0.85;font-style:normal;font-weight:normal;letter-spacing:0">${form.ruby}</span>`
      + `</span>`
    : prefixHtml + displayName;

  const tShadow = '0 1px 2px rgba(0,0,0,0.8),0 -1px 2px rgba(0,0,0,0.8),1px 0 2px rgba(0,0,0,0.8),-1px 0 2px rgba(0,0,0,0.8)';
  const baseStyle = `color:${s.color};font-size:${fontSize}px;font-style:${s.fontStyle};font-weight:${s.fontWeight};${s.letterSpacing ? `letter-spacing:${s.letterSpacing};` : ''}text-shadow:${tShadow};`;
  const tiltStr = form.tilt ? ` rotate(${form.tilt}deg)` : '';

  if (form.layout === 'vertical') {
    return `<span style="${baseStyle}writing-mode:vertical-rl;transform:translate(-50%,4px)${tiltStr};display:inline-block">${contentHtml}</span>`;
  }

  if (form.layout === 'arch') {
    const charCount = (hasMtn ? 2 : 0) + Math.max(1, displayName.length);
    const W = charCount * fontSize * 0.85;
    const pad = 4;
    const totalW = W + pad * 2;
    const archHeight = form.archHeight;

    let pathD, totalH, anchorX, anchorY;
    if (form.archUp) {
      const Y_start = archHeight + fontSize + 4;
      const Y_ctl   = Y_start - 2 * archHeight;
      totalH  = Y_start + 4;
      pathD   = `M ${pad},${Y_start} Q ${pad + W / 2},${Y_ctl} ${pad + W},${Y_start}`;
      anchorX = totalW / 2;
      anchorY = totalH / 2;
    } else {
      const Y_start = fontSize + 4;
      const Y_ctl   = Y_start + 2 * archHeight;
      totalH  = Y_start + archHeight + 4;
      pathD   = `M ${pad},${Y_start} Q ${pad + W / 2},${Y_ctl} ${pad + W},${Y_start}`;
      anchorX = totalW / 2;
      anchorY = totalH / 2;
    }

    const pathId = 'preview-arc';
    const textPrefix = hasMtn ? '▲ ' : '';
    const svgTransform = form.tilt
      ? `transform:rotate(${form.tilt}deg);transform-origin:${anchorX}px ${anchorY}px;`
      : '';

    return `<svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}"
      xmlns="http://www.w3.org/2000/svg" style="overflow:visible;${svgTransform}">
      <defs><path id="${pathId}" d="${pathD}"/></defs>
      <text font-size="${fontSize}" font-style="${s.fontStyle}" font-weight="${s.fontWeight}"
            fill="none" stroke="rgba(0,0,0,0.8)" stroke-width="3" stroke-linejoin="round" paint-order="stroke">
        <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${textPrefix}${displayName}</textPath>
      </text>
      <text font-size="${fontSize}" font-style="${s.fontStyle}" font-weight="${s.fontWeight}" fill="${s.color}">
        <textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${textPrefix}${displayName}</textPath>
      </text>
    </svg>`;
  }

  // Horizontal
  return `<span style="${baseStyle}display:inline-block;transform:translate(0,0)${tiltStr}">${contentHtml}</span>`;
}

export default function PlaceNameEditPopup() {
  const {
    selectedPlaceName, clearSelectedPlaceName,
    placeNameDragEnabled, setPlaceNameDragEnabled,
    showRuby,
    pushHistory,
  } = useMapStore();
  const [form, setForm]     = useState({
    name: '', category: 'other',
    layout: 'horizontal', archHeight: 15, archUp: true,
    tilt: 0, ruby: '', letterSpacing: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (selectedPlaceName) {
      setForm({
        name:          selectedPlaceName.name          ?? '',
        category:      selectedPlaceName.category      ?? 'other',
        layout:        selectedPlaceName.layout        ?? 'horizontal',
        archHeight:    selectedPlaceName.archHeight    ?? 15,
        archUp:        selectedPlaceName.archUp        !== false,
        tilt:          selectedPlaceName.tilt          ?? 0,
        ruby:          selectedPlaceName.ruby          ?? '',
        letterSpacing: selectedPlaceName.letterSpacing ?? '',
      });
      setError('');
      setPlaceNameDragEnabled(false);
    }
  }, [selectedPlaceName?.id]);

  if (!selectedPlaceName) return null;

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const data = {
        name: form.name, category: form.category,
        layout: form.layout, archHeight: form.archHeight, archUp: form.archUp,
        tilt: form.tilt, ruby: form.ruby,
        letterSpacing: form.letterSpacing,
      };
      if (selectedPlaceName.id) {
        const id = selectedPlaceName.id;
        const before = {
          name: selectedPlaceName.name ?? '', category: selectedPlaceName.category ?? 'other',
          layout: selectedPlaceName.layout ?? 'horizontal', archHeight: selectedPlaceName.archHeight ?? 15,
          archUp: selectedPlaceName.archUp !== false, tilt: selectedPlaceName.tilt ?? 0,
          ruby: selectedPlaceName.ruby ?? '', letterSpacing: selectedPlaceName.letterSpacing ?? '',
        };
        await updatePlaceName(id, data);
        pushHistory({
          label: '地名編集',
          undoFn: async () => { await updatePlaceName(id, before); },
          redoFn:  async () => { await updatePlaceName(id, data); },
        });
      } else {
        const { lat, lng } = selectedPlaceName;
        const newId = await addPlaceName({ lat, lng, ...data });
        const ref = { id: newId };
        pushHistory({
          label: '地名追加',
          undoFn: async () => { await deletePlaceName(ref.id); },
          redoFn:  async () => {
            const id = await addPlaceName({ lat, lng, ...data });
            ref.id = id;
          },
        });
      }
      clearSelectedPlaceName();
    } catch (e) {
      setError('保存に失敗しました: ' + (e.code ?? e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPlaceName.id) { clearSelectedPlaceName(); return; }
    const label = selectedPlaceName.name || '名称未設定';
    if (!window.confirm(`「${label}」を削除しますか？`)) return;
    try {
      const snapshot = { ...selectedPlaceName };
      await deletePlaceName(snapshot.id);
      const ref = { id: snapshot.id };
      pushHistory({
        label: '地名削除',
        undoFn: async () => {
          const newId = await addPlaceName({
            lat: snapshot.lat, lng: snapshot.lng,
            name: snapshot.name ?? '', category: snapshot.category ?? 'other',
            layout: snapshot.layout ?? 'horizontal', archHeight: snapshot.archHeight ?? 15,
            archUp: snapshot.archUp !== false, tilt: snapshot.tilt ?? 0,
            ruby: snapshot.ruby ?? '', letterSpacing: snapshot.letterSpacing ?? '',
          });
          ref.id = newId;
        },
        redoFn: async () => { await deletePlaceName(ref.id); },
      });
      clearSelectedPlaceName();
    } catch (e) {
      setError('削除に失敗しました: ' + (e.code ?? e.message));
    }
  };

  // Real-time preview HTML (recomputed on every form change)
  const previewHtml = buildPreviewHtml(form, showRuby);

  const dotColor = CATEGORY_COLORS[form.category] ?? '#9CA3AF';

  return (
    <div className="absolute bottom-14 left-2 right-2
                    md:bottom-auto md:top-4 md:right-72 md:left-auto md:w-60
                    z-[400] bg-gray-800 text-white rounded-xl
                    shadow-2xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700">
        <span
          className="w-3 h-3 rounded-full shrink-0 border border-white/20"
          style={{ backgroundColor: dotColor }}
        />
        <h3 className="font-bold text-sm flex-1 truncate">
          {selectedPlaceName.name || '名称未設定'}
        </h3>
        <button
          onClick={clearSelectedPlaceName}
          className="text-gray-400 hover:text-white text-lg leading-none ml-1"
        >
          ×
        </button>
      </div>

      {/* Real-time preview */}
      <div className="mx-4 mt-3 mb-1 bg-gray-900 rounded-lg min-h-[52px] flex items-center justify-center px-3 py-2 overflow-hidden">
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>

      {/* Form body */}
      <div className="px-4 py-2 space-y-2.5">
        {/* Name */}
        <div>
          <label className="text-xs text-gray-400">名称</label>
          <input
            data-1p-ignore
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="地名を入力"
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
            onChange={(e) => setField('ruby', e.target.value)}
            placeholder="よみがな（任意）"
            className="w-full bg-gray-700 rounded px-2 py-1.5 text-sm mt-0.5
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-xs text-gray-400">種別</label>
          <select
            value={form.category}
            onChange={(e) => setField('category', e.target.value)}
            className="w-full bg-gray-700 rounded px-2 py-1.5 text-sm mt-0.5
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Layout */}
        <div>
          <label className="text-xs text-gray-400">レイアウト</label>
          <div className="flex gap-1 mt-0.5">
            {LAYOUT_OPTIONS.map(o => (
              <button
                key={o.value}
                onClick={() => setField('layout', o.value)}
                className={`flex-1 rounded px-1 py-1 text-xs font-medium transition-colors
                  ${form.layout === o.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Arch controls */}
        {form.layout === 'arch' && (
          <div className="space-y-2 pl-2 border-l-2 border-blue-600/40">
            <div className="flex gap-1">
              <button
                onClick={() => setField('archUp', true)}
                className={`flex-1 rounded px-1 py-1 text-xs transition-colors
                  ${form.archUp
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                ∩ 上向き
              </button>
              <button
                onClick={() => setField('archUp', false)}
                className={`flex-1 rounded px-1 py-1 text-xs transition-colors
                  ${!form.archUp
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                ∪ 下向き
              </button>
            </div>
            <div>
              <div className="flex justify-between mb-0.5">
                <span className="text-xs text-gray-400">アーチ高さ</span>
                <span className="text-xs text-gray-400 tabular-nums">{form.archHeight}px</span>
              </div>
              <input
                type="range" min={3} max={50} step={1}
                value={form.archHeight}
                onChange={(e) => setField('archHeight', Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: '#3B82F6' }}
              />
            </div>
          </div>
        )}

        {/* Tilt slider — all layouts */}
        <div>
          <div className="flex justify-between mb-0.5">
            <label className="text-xs text-gray-400">傾き</label>
            <span className="text-xs text-gray-400 tabular-nums">{form.tilt > 0 ? `+${form.tilt}` : form.tilt}°</span>
          </div>
          <input
            type="range" min={-45} max={45} step={5}
            value={form.tilt}
            onChange={(e) => setField('tilt', Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: '#6B7280' }}
          />
          {form.tilt !== 0 && (
            <button
              onClick={() => setField('tilt', 0)}
              className="mt-0.5 text-xs text-gray-500 hover:text-gray-300"
            >
              リセット
            </button>
          )}
        </div>

        {/* Letter spacing slider */}
        <div>
          <div className="flex justify-between mb-0.5">
            <label className="text-xs text-gray-400">字間</label>
            <span className="text-xs text-gray-400 tabular-nums">
              {form.letterSpacing !== '' ? form.letterSpacing : '既定'}
            </span>
          </div>
          <input
            type="range" min={-10} max={50} step={1}
            value={form.letterSpacing !== '' ? Math.round(parseFloat(form.letterSpacing) * 100) : 0}
            onChange={(e) => {
              const v = Number(e.target.value);
              setField('letterSpacing', v === 0 ? '' : `${(v / 100).toFixed(2)}em`);
            }}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: '#6B7280' }}
          />
          {form.letterSpacing !== '' && (
            <button
              onClick={() => setField('letterSpacing', '')}
              className="mt-0.5 text-xs text-gray-500 hover:text-gray-300"
            >
              リセット
            </button>
          )}
        </div>

        {/* Position drag toggle */}
        <div>
          <button
            onClick={() => setPlaceNameDragEnabled(!placeNameDragEnabled)}
            className={`w-full rounded px-2 py-1.5 text-sm font-medium transition-colors border
              ${placeNameDragEnabled
                ? 'bg-amber-500 hover:bg-amber-600 text-black border-amber-400'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300 border-gray-600'
              }`}
          >
            {placeNameDragEnabled ? '📍 ドラッグ有効' : '位置を移動'}
          </button>
          {placeNameDragEnabled && (
            <p className="text-xs text-amber-400 mt-1 text-center">
              地図上でドラッグして位置を変更
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 px-4 pb-2">{error}</p>
      )}

      {/* Footer */}
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
            onClick={clearSelectedPlaceName}
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
