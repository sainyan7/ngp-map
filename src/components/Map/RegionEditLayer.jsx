import { useState } from 'react';
import L from 'leaflet';
import { useMap, Marker, Polygon, CircleMarker } from 'react-leaflet';
import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';
import { updateFeature } from '../../firebase/features';

const SNAP_PX = 15;

// Draggable vertex icon
const makeVertexIcon = (active = false) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:12px;height:12px;
      background:${active ? '#22D3EE' : '#60A5FA'};
      border:2px solid white;
      border-radius:50%;
      transform:translate(-50%,-50%);
      cursor:grab;
      box-shadow:0 0 4px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [0, 0],
  });

const VERTEX_ICON = makeVertexIcon(false);

function polygonCentroid(positions) {
  const lat = positions.reduce((s, p) => s + p[0], 0) / positions.length;
  const lng = positions.reduce((s, p) => s + p[1], 0) / positions.length;
  return [lat, lng];
}

export default function RegionEditLayer() {
  const {
    editingRegion,
    editingRegionPolygons,
    setEditingRegionPolygons,
    clearEditingRegion,
    features,
  } = useMapStore();
  const { nickname } = useAuthStore();
  const map = useMap();
  const [saving, setSaving] = useState(false);

  // Snap dragend position to nearest vertex of any OTHER region within SNAP_PX pixels
  const calcSnap = (latlng) => {
    const cp = map.latLngToContainerPoint(latlng);
    let nearest = null;
    let minD = SNAP_PX;
    for (const f of features) {
      if (f.layerType !== 'region') continue;
      if (f.id === editingRegion?.id) continue; // skip self
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

  if (!editingRegion) return null;

  const polys = editingRegionPolygons;

  // Move a vertex in polygon[polyIdx] at vertex[vIdx] to new position
  const moveVertex = (polyIdx, vIdx, lat, lng) => {
    const newPolys = polys.map((poly, pi) =>
      pi !== polyIdx ? poly : poly.map((v, vi) => (vi === vIdx ? [lat, lng] : v))
    );
    setEditingRegionPolygons(newPolys);
  };

  // Remove a vertex from polygon[polyIdx] at vertex[vIdx] (only if polygon has >3 vertices)
  const removeVertex = (polyIdx, vIdx) => {
    if (polys[polyIdx].length <= 3) return;
    const newPolys = polys.map((poly, pi) =>
      pi !== polyIdx ? poly : poly.filter((_, vi) => vi !== vIdx)
    );
    setEditingRegionPolygons(newPolys);
  };

  // Insert a vertex after vertex[afterIdx] in polygon[polyIdx] at the midpoint
  const addMidVertex = (polyIdx, afterIdx) => {
    const poly = polys[polyIdx];
    const a = poly[afterIdx];
    const b = poly[(afterIdx + 1) % poly.length];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const newPoly = [...poly];
    newPoly.splice(afterIdx + 1, 0, mid);
    const newPolys = polys.map((p, pi) => (pi !== polyIdx ? p : newPoly));
    setEditingRegionPolygons(newPolys);
  };

  // Remove an entire exclave polygon (only if there are 2+ polygons)
  const removePolygon = (polyIdx) => {
    if (polys.length <= 1) return;
    setEditingRegionPolygons(polys.filter((_, pi) => pi !== polyIdx));
  };

  const handleSave = async () => {
    setSaving(true);
    const updatedPolygons = polys.map((poly) => ({
      latlngs: poly.map(([lat, lng]) => ({ lat, lng })),
    }));
    await updateFeature(editingRegion.id, {
      polygons: updatedPolygons,
      updatedBy: nickname,
    });
    setSaving(false);
    clearEditingRegion();
  };

  return (
    <>
      {polys.map((poly, polyIdx) => {
        const center = polygonCentroid(poly);
        return (
          <div key={polyIdx}>
            {/* Polygon outline preview */}
            <Polygon
              positions={poly}
              pathOptions={{
                color: '#60A5FA',
                fillColor: '#60A5FA',
                fillOpacity: 0.08,
                weight: 2,
                dashArray: '6 3',
              }}
            />

            {/* Vertex markers — draggable; right-click to delete */}
            {poly.map((pt, vIdx) => (
              <Marker
                key={`v-${polyIdx}-${vIdx}`}
                position={pt}
                draggable
                icon={VERTEX_ICON}
                eventHandlers={{
                  dragend: (e) => {
                    const ll = e.target.getLatLng();
                    const snapped = calcSnap(ll);
                    moveVertex(polyIdx, vIdx,
                      snapped ? snapped[0] : ll.lat,
                      snapped ? snapped[1] : ll.lng,
                    );
                  },
                  contextmenu: (e) => {
                    e.originalEvent?.preventDefault();
                    removeVertex(polyIdx, vIdx);
                  },
                }}
              />
            ))}

            {/* Midpoint markers — click to insert new vertex */}
            {poly.map((pt, vIdx) => {
              const next = poly[(vIdx + 1) % poly.length];
              const mid = [(pt[0] + next[0]) / 2, (pt[1] + next[1]) / 2];
              return (
                <CircleMarker
                  key={`m-${polyIdx}-${vIdx}`}
                  center={mid}
                  radius={5}
                  pathOptions={{
                    color: '#60A5FA',
                    fillColor: 'white',
                    fillOpacity: 0.9,
                    weight: 1.5,
                  }}
                  eventHandlers={{ click: () => addMidVertex(polyIdx, vIdx) }}
                />
              );
            })}

            {/* Remove exclave button — shown for index > 0 (not the main polygon) */}
            {polyIdx > 0 && (() => {
              const delIcon = L.divIcon({
                className: '',
                html: `<div style="
                  background:#ef4444;color:white;
                  font-size:11px;font-weight:bold;
                  border-radius:50%;width:18px;height:18px;
                  display:flex;align-items:center;justify-content:center;
                  transform:translate(-50%,-50%);
                  cursor:pointer;
                  box-shadow:0 0 4px rgba(0,0,0,0.5);
                ">×</div>`,
                iconSize: [0, 0],
              });
              return (
                <Marker
                  key={`del-${polyIdx}`}
                  position={center}
                  icon={delIcon}
                  eventHandlers={{ click: () => removePolygon(polyIdx) }}
                />
              );
            })()}
          </div>
        );
      })}

      {/* Floating save/cancel overlay */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-2
                      bg-gray-800 px-4 py-2 rounded-xl border border-blue-500 shadow-xl">
        <span className="text-xs text-blue-300 mr-2 hidden sm:block">
          頂点編集中 — ドラッグ:移動 / 右クリック:削除 / 中点クリック:追加
        </span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm rounded-lg"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={clearEditingRegion}
          className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg"
        >
          キャンセル
        </button>
      </div>
    </>
  );
}
