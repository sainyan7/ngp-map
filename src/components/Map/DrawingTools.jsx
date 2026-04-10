import { useState } from 'react';
import { useMapEvents, Polyline, Polygon, CircleMarker } from 'react-leaflet';
import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';
import { addFeature } from '../../firebase/features';

const LAYER_OPTIONS = [
  { value: 'border', label: '州境・地域区分' },
  { value: 'city', label: '都市・拠点' },
  { value: 'terrain', label: '地形情報' },
  { value: 'transport', label: '交通インフラ' },
  { value: 'military', label: '軍事施設' },
  { value: 'territory', label: '勢力支配域' },
  { value: 'event', label: 'イベントマーカー' },
];

function PropertyDialog({ featureType, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    subType: '',
    description: '',
    color: '#3B82F6',
    layerType: 'city',
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-80 border border-gray-700">
        <h3 className="font-bold text-white text-lg mb-4">
          {featureType === 'point' ? 'マーカー' : featureType === 'line' ? 'ライン' : 'ポリゴン'}
          のプロパティ
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-0.5">名称</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="地物の名称"
              className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">レイヤー種別</label>
            <select
              value={form.layerType}
              onChange={(e) => setForm({ ...form, layerType: e.target.value })}
              className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              {LAYER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">種別・サブタイプ</label>
            <input
              value={form.subType}
              onChange={(e) => setForm({ ...form, subType: e.target.value })}
              placeholder="例: 首都, 州境線, 鉄道..."
              className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">説明</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="w-8 h-8 cursor-pointer bg-transparent border-0 rounded"
              />
              <input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="flex-1 bg-gray-700 text-white rounded px-2 py-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={() => onSave(form)}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium"
          >
            保存
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg py-2 text-sm"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DrawingTools() {
  const {
    drawingMode,
    pendingPoints,
    addPendingPoint,
    clearPendingPoints,
    setDrawingMode,
  } = useMapStore();
  const { nickname } = useAuthStore();

  const [dialogState, setDialogState] = useState(null); // { type, latlngs }
  const [mousePos, setMousePos] = useState(null);

  useMapEvents({
    click(e) {
      if (drawingMode === 'select' || drawingMode === 'delete') return;

      if (drawingMode === 'marker') {
        // Store as plain object to avoid Firestore's nested-array restriction
        setDialogState({ type: 'point', latlng: { lat: e.latlng.lat, lng: e.latlng.lng } });
        return;
      }

      // line / polygon: accumulate points
      addPendingPoint([e.latlng.lat, e.latlng.lng]);
    },

    dblclick(e) {
      if (drawingMode !== 'line' && drawingMode !== 'polygon') return;
      if (pendingPoints.length < 2) return;

      // Prevent the map zoom that normally fires on dblclick
      e.originalEvent?.preventDefault?.();

      const latlngs = [...pendingPoints];
      clearPendingPoints();
      setDialogState({ type: drawingMode === 'line' ? 'line' : 'polygon', latlngs });
    },

    mousemove(e) {
      if (drawingMode === 'line' || drawingMode === 'polygon') {
        setMousePos([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  const handleSave = async (properties) => {
    if (!dialogState) return;
    const { type } = dialogState;

    // Build geometry without nested arrays (Firestore does not support them).
    // point  → { latlng: { lat, lng } }
    // line / polygon → { latlngs: [{ lat, lng }, ...] }
    let geometry;
    if (type === 'point') {
      geometry = { latlng: dialogState.latlng };
    } else {
      geometry = {
        latlngs: dialogState.latlngs.map(([lat, lng]) => ({ lat, lng })),
      };
    }

    await addFeature({
      layerType: properties.layerType,
      type,
      geometry,
      properties: {
        name: properties.name,
        subType: properties.subType,
        description: properties.description,
        color: properties.color,
        factionId: null,
      },
      updatedBy: nickname,
    });
    setDialogState(null);
    setDrawingMode('select');
  };

  const handleCancel = () => {
    setDialogState(null);
    clearPendingPoints();
    setDrawingMode('select');
  };

  // Preview line connecting pending points to current mouse position
  const previewPositions =
    pendingPoints.length > 0 && mousePos
      ? [...pendingPoints, mousePos]
      : pendingPoints;

  return (
    <>
      {/* Preview while drawing a line */}
      {drawingMode === 'line' && previewPositions.length >= 2 && (
        <Polyline
          positions={previewPositions}
          pathOptions={{ color: '#60A5FA', weight: 2, dashArray: '6 4', opacity: 0.8 }}
        />
      )}

      {/* Preview while drawing a polygon */}
      {drawingMode === 'polygon' && previewPositions.length >= 3 && (
        <Polygon
          positions={previewPositions}
          pathOptions={{ color: '#60A5FA', fillColor: '#60A5FA', fillOpacity: 0.15, weight: 2, dashArray: '6 4' }}
        />
      )}

      {/* Dots for pending points */}
      {(drawingMode === 'line' || drawingMode === 'polygon') &&
        pendingPoints.map((pt, i) => (
          <CircleMarker
            key={i}
            center={pt}
            radius={4}
            pathOptions={{ color: '#60A5FA', fillColor: '#60A5FA', fillOpacity: 1, weight: 1 }}
          />
        ))}

      {/* Property input dialog (rendered outside the map in a portal-like manner) */}
      {dialogState && (
        <PropertyDialog
          featureType={dialogState.type}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
