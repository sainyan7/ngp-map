import { useState, useEffect } from 'react';
import { useMap, useMapEvents, Polyline, Polygon, CircleMarker } from 'react-leaflet';
import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';
import { addFeature, updateFeature } from '../../firebase/features';

const REGION_TYPES = [
  { value: 'state',       label: '州' },
  { value: 'region',      label: '地方' },
  { value: 'county',      label: '郡・市域' },
  { value: 'island',      label: '島' },
  { value: 'archipelago', label: '諸島' },
  { value: 'other',       label: 'その他' },
];
const SNAP_PX = 15;

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
              data-1p-ignore
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
              data-1p-ignore
              value={form.subType}
              onChange={(e) => setForm({ ...form, subType: e.target.value })}
              placeholder="例: 首都, 州境線, 鉄道..."
              className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">説明</label>
            <textarea
              data-1p-ignore
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
                data-1p-ignore
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

function RegionPropertyDialog({ onSave, onCancel }) {
  const [form, setForm] = useState({ name: '', regionType: 'state' });
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-80 border border-gray-700">
        <h3 className="font-bold text-white text-lg mb-4">領域のプロパティ</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-0.5">名称</label>
            <input
              data-1p-ignore
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="領域の名称"
              className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-0.5">領域種別</label>
            <select
              value={form.regionType}
              onChange={(e) => setForm({ ...form, regionType: e.target.value })}
              className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              {REGION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
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
    removeLastPendingPoint,
    clearPendingPoints,
    setPendingPoints,
    setDrawingMode,
    features,
    addingExclaveToRegion,
    clearAddingExclaveToRegion,
    pickingExistingRegion,
    startPickingExistingRegion,
    cancelPickingExistingRegion,
    pickedPolygonPositions,
    clearPickedPolygon,
  } = useMapStore();
  const { nickname } = useAuthStore();
  const map = useMap();

  const [dialogState, setDialogState] = useState(null);   // { type, latlngs, polygons? }
  const [confirmState, setConfirmState] = useState(null); // { type, latlngs } — pending confirmation
  const [pendingPolygons, setPendingPolygons] = useState([]); // accumulated multi-polygon batch
  const [mousePos, setMousePos] = useState(null);
  const [snapPoint, setSnapPoint] = useState(null);

  // When FeatureLayer commits a picked polygon, absorb it into pendingPolygons
  useEffect(() => {
    if (!pickedPolygonPositions) return;
    setPendingPolygons((prev) => [...prev, pickedPolygonPositions]);
    clearPickedPolygon();
  }, [pickedPolygonPositions]); // eslint-disable-line react-hooks/exhaustive-deps

  const REGION_MODES = ['add_region', 'add_exclave'];

  // Snap cursor to nearby existing region vertices
  const calcSnap = (latlng) => {
    const cp = map.latLngToContainerPoint(latlng);
    const regionFeatures = features.filter((f) => f.layerType === 'region');
    let nearest = null;
    let minD = SNAP_PX;
    for (const f of regionFeatures) {
      for (const poly of (f.polygons ?? [])) {
        for (const v of (poly.latlngs ?? [])) {
          const vp = map.latLngToContainerPoint([v.lat, v.lng]);
          const d = Math.hypot(vp.x - cp.x, vp.y - cp.y);
          if (d < minD) { minD = d; nearest = [v.lat, v.lng]; }
        }
      }
    }
    return nearest;
  };

  const handleExclaveSave = async (latlngs) => {
    if (!addingExclaveToRegion) return;
    const newPoly = { latlngs: latlngs.map(([lat, lng]) => ({ lat, lng })) };
    const updated = [...(addingExclaveToRegion.polygons ?? []), newPoly];
    await updateFeature(addingExclaveToRegion.id, { polygons: updated, updatedBy: nickname });
    clearAddingExclaveToRegion();
    setDrawingMode('select');
  };

  // Save multiple exclave polygons at once (multi-polygon exclave workflow)
  const handleExclaveSaveMultiple = async (allLatlngs) => {
    if (!addingExclaveToRegion) return;
    const newPolys = allLatlngs.map((latlngs) => ({
      latlngs: latlngs.map(([lat, lng]) => ({ lat, lng })),
    }));
    const updated = [...(addingExclaveToRegion.polygons ?? []), ...newPolys];
    await updateFeature(addingExclaveToRegion.id, { polygons: updated, updatedBy: nickname });
    clearAddingExclaveToRegion();
    setPendingPolygons([]);
    cancelPickingExistingRegion();
    setDrawingMode('select');
  };

  // Confirm the drawn shape → open property dialog (or save exclave directly)
  const handleConfirm = () => {
    if (!confirmState && pendingPolygons.length === 0) return;
    // Multi-polygon batch: finalize all accumulated shapes at once
    if (pendingPolygons.length > 0) {
      const allPolys = [...pendingPolygons, ...(confirmState ? [confirmState.latlngs] : [])];
      if (addingExclaveToRegion) {
        // All accumulated polygons are exclaves to add to the existing region
        handleExclaveSaveMultiple(allPolys);
      } else {
        setDialogState({ type: 'region', latlngs: allPolys[0], polygons: allPolys });
        setPendingPolygons([]);
        cancelPickingExistingRegion();
      }
      setConfirmState(null);
      return;
    }
    // Single polygon (original flow)
    if (confirmState.type === 'add_exclave') {
      handleExclaveSave(confirmState.latlngs);
    } else {
      setDialogState({ type: confirmState.type, latlngs: confirmState.latlngs });
    }
    setConfirmState(null);
  };

  // "確定して次のポリゴンを追加" — save current shape to batch, enter pick/draw mode
  const handleAddAnotherPolygon = () => {
    if (!confirmState) return;
    setPendingPolygons((prev) => [...prev, confirmState.latlngs]);
    setConfirmState(null);
    clearPendingPoints();
    // Enter pick mode so the user can also click an existing region polygon
    startPickingExistingRegion();
  };

  // "確定する" from the hint banner — finalize all accumulated polygons
  const handleFinalConfirm = () => {
    if (pendingPolygons.length === 0) return;
    if (addingExclaveToRegion) {
      // Exclaves: save all accumulated polygons directly to the existing region
      handleExclaveSaveMultiple(pendingPolygons);
    } else {
      // New region: open property dialog with all polygons
      setDialogState({ type: 'region', latlngs: pendingPolygons[0], polygons: pendingPolygons });
      setPendingPolygons([]);
      cancelPickingExistingRegion();
    }
  };

  // Cancel the entire multi-polygon session
  const handleCancelMulti = () => {
    setPendingPolygons([]);
    setConfirmState(null);
    cancelPickingExistingRegion();
    clearPendingPoints();
    setDrawingMode('select');
  };

  // Continue editing → restore pending points to the state just before dblclick
  const handleContinueEditing = () => {
    if (!confirmState) return;
    setPendingPoints(confirmState.latlngs);
    setConfirmState(null);
    cancelPickingExistingRegion();
  };

  const DRAWING_MODES = ['line', 'polygon', 'add_region', 'add_exclave'];

  // Disable map's built-in doubleClickZoom while in drawing modes
  // (dblclick is used to confirm the shape instead)
  useEffect(() => {
    if (DRAWING_MODES.includes(drawingMode)) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
  }, [drawingMode, map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts during drawing:
  //   Backspace / Delete → undo last point
  //   Escape → cancel drawing
  useEffect(() => {
    if (!DRAWING_MODES.includes(drawingMode)) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeLastPendingPoint();
      } else if (e.key === 'Escape') {
        clearPendingPoints();
        setSnapPoint(null);
        setDrawingMode('select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawingMode, removeLastPendingPoint, clearPendingPoints, setDrawingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useMapEvents({
    click(e) {
      if (['select','delete','add_city','add_label','add_facility'].includes(drawingMode)) return;
      if (confirmState) return; // Don't add points while waiting for confirmation
      if (pickingExistingRegion) return; // FeatureLayer handles clicks in pick mode

      if (drawingMode === 'marker') {
        // Store as plain object to avoid Firestore's nested-array restriction
        setDialogState({ type: 'point', latlng: { lat: e.latlng.lat, lng: e.latlng.lng } });
        return;
      }

      // line / polygon / add_region / add_exclave: accumulate points (snap-aware)
      const pt = snapPoint ?? [e.latlng.lat, e.latlng.lng];
      addPendingPoint(pt);
    },

    dblclick(e) {
      if (!DRAWING_MODES.includes(drawingMode)) return;

      // Prevent map zoom that fires on dblclick
      e.originalEvent?.preventDefault?.();

      // A double-click fires two prior click events, adding 2 extra points.
      // Slice them off to get the user's intended points.
      const latlngs = pendingPoints.slice(0, -2);
      const minPoints = drawingMode === 'line' ? 2 : 3;
      if (latlngs.length < minPoints) return;

      clearPendingPoints();
      setSnapPoint(null);

      // Show confirmation panel instead of immediately opening the property dialog
      const type = drawingMode === 'line' ? 'line'
                 : drawingMode === 'polygon' ? 'polygon'
                 : drawingMode === 'add_exclave' ? 'add_exclave'
                 : 'region';
      setConfirmState({ type, latlngs });
    },

    contextmenu(e) {
      // Right-click during drawing: remove the last placed point
      if (!DRAWING_MODES.includes(drawingMode)) return;
      e.originalEvent?.preventDefault?.();
      removeLastPendingPoint();
    },

    mousemove(e) {
      if (['line', 'polygon', 'add_region', 'add_exclave'].includes(drawingMode)) {
        if (REGION_MODES.includes(drawingMode)) {
          const snapped = calcSnap(e.latlng);
          setSnapPoint(snapped);
          setMousePos(snapped ?? [e.latlng.lat, e.latlng.lng]);
        } else {
          setMousePos([e.latlng.lat, e.latlng.lng]);
        }
      }
    },
  });

  const handleSave = async (properties) => {
    if (!dialogState) return;
    const { type } = dialogState;

    // Region polygon → new data model with polygons array.
    // dialogState.polygons is set when multiple polygons were accumulated.
    if (type === 'region') {
      const polygonsData = (dialogState.polygons ?? [dialogState.latlngs]).map(
        (poly) => ({ latlngs: poly.map(([lat, lng]) => ({ lat, lng })) }),
      );
      await addFeature({
        layerType: 'region',
        type: 'region',
        polygons: polygonsData,
        properties: {
          name: properties.name,
          regionType: properties.regionType,
        },
        updatedBy: nickname,
      });
      setDialogState(null);
      setDrawingMode('select');
      return;
    }

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

  const isRegionMode = REGION_MODES.includes(drawingMode) || drawingMode === 'polygon';

  return (
    <>
      {/* Preview while drawing a line */}
      {drawingMode === 'line' && previewPositions.length >= 2 && (
        <Polyline
          positions={previewPositions}
          pathOptions={{ color: '#60A5FA', weight: 2, dashArray: '6 4', opacity: 0.8 }}
        />
      )}

      {/* Preview while drawing a polygon / region / exclave */}
      {(drawingMode === 'polygon' || REGION_MODES.includes(drawingMode)) && previewPositions.length >= 3 && (
        <Polygon
          positions={previewPositions}
          pathOptions={{ color: '#60A5FA', fillColor: '#60A5FA', fillOpacity: 0.15, weight: 2, dashArray: '6 4' }}
        />
      )}

      {/* Dots for pending points — first point is amber to mark the start */}
      {(drawingMode === 'line' || drawingMode === 'polygon' || REGION_MODES.includes(drawingMode)) &&
        pendingPoints.map((pt, i) => (
          <CircleMarker
            key={i}
            center={pt}
            radius={i === 0 ? 6 : 4}
            pathOptions={
              i === 0
                ? { color: '#F59E0B', fillColor: '#F59E0B', fillOpacity: 1, weight: 2 }
                : { color: '#60A5FA', fillColor: '#60A5FA', fillOpacity: 1, weight: 1 }
            }
          />
        ))}

      {/* Snap indicator — cyan ring at snapped vertex */}
      {snapPoint && REGION_MODES.includes(drawingMode) && (
        <CircleMarker
          center={snapPoint}
          radius={8}
          pathOptions={{ color: '#22D3EE', fillColor: '#22D3EE', fillOpacity: 0.25, weight: 2 }}
        />
      )}

      {/* Accumulated pending polygons preview (green tint) */}
      {pendingPolygons.map((poly, i) => (
        <Polygon
          key={`pp-${i}`}
          positions={poly}
          pathOptions={{ color: '#34D399', fillColor: '#34D399', fillOpacity: 0.12, weight: 1.5 }}
        />
      ))}

      {/* Preview polygon/line while in confirm state */}
      {confirmState && confirmState.latlngs.length >= 2 && (
        confirmState.type === 'line'
          ? <Polyline
              positions={confirmState.latlngs}
              pathOptions={{ color: '#60A5FA', weight: 2, dashArray: '6 4', opacity: 0.9 }}
            />
          : <Polygon
              positions={confirmState.latlngs}
              pathOptions={{ color: '#60A5FA', fillColor: '#60A5FA', fillOpacity: 0.18, weight: 2, dashArray: '6 4' }}
            />
      )}

      {/* Confirmation panel — shown after dblclick, before property dialog */}
      {confirmState && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[1000]
                        bg-gray-800 border border-gray-600 rounded-xl shadow-2xl
                        px-5 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-300">
            {pendingPolygons.length > 0 ? `${pendingPolygons.length + 1}個目 — ` : ''}描画を確定しますか？
          </span>
          <button
            onClick={handleConfirm}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-4 py-1.5 whitespace-nowrap"
          >
            確定する
          </button>
          <button
            onClick={handleContinueEditing}
            className="bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg px-4 py-1.5 whitespace-nowrap"
          >
            編集を続ける
          </button>
          {(drawingMode === 'add_region' || drawingMode === 'polygon' || drawingMode === 'add_exclave') && (
            <button
              onClick={handleAddAnotherPolygon}
              className="bg-teal-700 hover:bg-teal-600 text-white text-sm rounded-lg px-4 py-1.5 whitespace-nowrap"
            >
              確定して次のポリゴンを追加
            </button>
          )}
          {pendingPolygons.length > 0 && (
            <button
              onClick={handleCancelMulti}
              className="bg-red-800 hover:bg-red-700 text-white text-sm rounded-lg px-3 py-1.5 whitespace-nowrap"
            >
              キャンセル
            </button>
          )}
        </div>
      )}

      {/* Hint banner — shown when polygons are accumulated but no confirm panel is visible */}
      {pendingPolygons.length > 0 && !confirmState && !dialogState && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[1000]
                        bg-gray-800 border border-teal-600 rounded-xl shadow-2xl
                        px-5 py-3 flex flex-col gap-2 min-w-[280px]">
          <span className="text-teal-300 text-sm font-medium">
            {pendingPolygons.length}個のポリゴン追加済み
          </span>
          <span className="text-xs text-gray-400">
            既存の領域を1ポリゴンずつクリック、または点を打って新規追加できます
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleFinalConfirm}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg px-4 py-1.5"
            >
              確定する
            </button>
            <button
              onClick={handleCancelMulti}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg px-4 py-1.5"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Property input dialog (rendered outside the map in a portal-like manner) */}
      {dialogState && dialogState.type === 'region' && (
        <RegionPropertyDialog onSave={handleSave} onCancel={handleCancel} />
      )}
      {dialogState && dialogState.type !== 'region' && (
        <PropertyDialog
          featureType={dialogState.type}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
