import { useState, useRef } from 'react';
import { toPng } from 'html-to-image';

const SCALE_OPTIONS = [
  { value: 1,   label: '1× (現在サイズ)' },
  { value: 1.5, label: '1.5×' },
  { value: 2,   label: '2× (高解像度)' },
  { value: 3,   label: '3× (超高解像度)' },
];

export default function MapExportModal({ onClose }) {
  const [scale, setScale]       = useState(2);
  const [exporting, setExporting] = useState(false);
  const [error, setError]       = useState('');

  const handleExport = async () => {
    setExporting(true);
    setError('');
    try {
      // Target the Leaflet map container
      const el = document.querySelector('.leaflet-container');
      if (!el) throw new Error('地図要素が見つかりません');

      const dataUrl = await toPng(el, {
        pixelRatio: scale,
        cacheBust:  true,
        skipFonts:  false,
        filter: (node) => {
          // Skip Leaflet UI controls (zoom buttons, attribution)
          if (node.classList?.contains('leaflet-control-container')) return false;
          return true;
        },
      });

      const link = document.createElement('a');
      link.download = `ngp-map-${new Date().toISOString().slice(0,19).replace(/[T:]/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      setError('エクスポートに失敗しました: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  // Show approximate output size
  const mapEl = document.querySelector('.leaflet-container');
  const w = mapEl ? Math.round(mapEl.offsetWidth  * scale) : '?';
  const h = mapEl ? Math.round(mapEl.offsetHeight * scale) : '?';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-80 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white text-base">マップを画像保存</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          {/* Scale selector */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">解像度スケール</label>
            <div className="grid grid-cols-2 gap-1.5">
              {SCALE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setScale(o.value)}
                  className={`rounded px-2 py-1.5 text-xs font-medium transition-colors
                    ${scale === o.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Output size info */}
          <div className="bg-gray-900 rounded-lg px-3 py-2 text-xs text-gray-400">
            出力サイズ: <span className="text-gray-200 font-mono">{w} × {h} px</span>
          </div>

          <p className="text-xs text-gray-500">
            ※ 地図コントロール（ズームボタン等）は除外されます。
            クロスオリジン画像は取得できない場合があります。
          </p>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                         rounded-lg py-2 text-sm font-medium text-white transition-colors"
            >
              {exporting ? 'エクスポート中...' : '📥 PNG保存'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-600 hover:bg-gray-700 rounded-lg py-2 text-sm text-white transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
