import { useEffect, useRef, useState } from 'react';
import { Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';
import {
  addStroke, updateLiveStroke, deleteLiveStroke, deleteStrokeById,
  subscribeWhiteboard, subscribeLiveStrokes,
} from '../../firebase/whiteboard';

// Eraser radius in screen pixels
const ERASER_PX = 10;

// 10 visually distinct colors — good contrast on both dark and light map backgrounds (Tailwind -400 level)
const NICKNAME_COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#facc15', // yellow
  '#a3e635', // lime
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
  '#e879f9', // fuchsia
];

// Deterministic color from nickname string
function nicknameToColor(nickname) {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = ((hash << 5) - hash) + nickname.charCodeAt(i);
    hash |= 0;
  }
  return NICKNAME_COLORS[Math.abs(hash) % NICKNAME_COLORS.length];
}

// Nickname label centered above the midpoint of a stroke
function StrokeLabelMarker({ points, nickname, color }) {
  const map = useMap();
  const mid = points[Math.floor(points.length / 2)];

  useEffect(() => {
    if (!mid) return;
    const icon = L.divIcon({
      className: '',
      html: `<span style="
        color:#fff;
        font-size:9px;
        font-weight:bold;
        background:${color};
        padding:1px 4px;
        border-radius:3px;
        white-space:nowrap;
        pointer-events:none;
        opacity:0.9;
        box-shadow:0 1px 3px rgba(0,0,0,0.5);
        display:inline-block;
        transform:translateX(-50%);
      ">${nickname}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 18],
    });
    const m = L.marker([mid.lat, mid.lng], { icon, interactive: false, zIndexOffset: 300 });
    m.addTo(map);
    return () => { m.remove(); };
  }, [mid?.lat, mid?.lng, nickname, color]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function WhiteboardEvents({ whiteboardStrokes, liveStrokes }) {
  const map = useMap();
  const {
    drawingMode, pushHistory,
    whiteboardTool,
    pendingWhiteboardStrokes,
    addPendingWhiteboardStroke,
    updatePendingWhiteboardStrokeId,
    removePendingWhiteboardStroke,
  } = useMapStore();
  const { user, nickname } = useAuthStore();

  // ── Drawing state ──────────────────────────────────────────────────────────
  const isDrawing = useRef(false);
  const currentPoints = useRef([]);
  const livePointCount = useRef(0);
  const [localStroke, setLocalStroke] = useState(null);

  // ── Eraser state ───────────────────────────────────────────────────────────
  const isErasing = useRef(false);
  const eraserDeletedStrokesRef = useRef([]); // strokes deleted in current gesture
  const eraserMarkerRef = useRef(null);        // L.circleMarker for eraser cursor
  const allStrokesRef = useRef([]);            // always-fresh allStrokes for closures

  const color = nicknameToColor(nickname || 'user');

  // ── Compute allStrokes (deduplicated Firestore + pending) ──────────────────
  const firestoreIds = new Set(whiteboardStrokes.map((s) => s.id));
  const allStrokes = [
    ...whiteboardStrokes,
    ...pendingWhiteboardStrokes.filter((s) => !firestoreIds.has(s.id)),
  ];
  allStrokesRef.current = allStrokes;

  // ── liveRef — always-fresh values for once-registered handlers ─────────────
  const liveRef = useRef(null);
  liveRef.current = {
    drawingMode, whiteboardTool, user, nickname, color,
    addPendingWhiteboardStroke,
    updatePendingWhiteboardStrokeId,
    removePendingWhiteboardStroke,
    pushHistory,
  };

  // ── Eraser helpers ─────────────────────────────────────────────────────────

  /** Convert ERASER_PX screen pixels → map-coordinate radius at current zoom */
  const getEraserMapRadius = () => {
    const center = map.getCenter();
    const px = map.latLngToContainerPoint(center);
    const ll1 = map.containerPointToLatLng(px);
    const ll2 = map.containerPointToLatLng(L.point(px.x + ERASER_PX, px.y));
    return Math.hypot(ll2.lat - ll1.lat, ll2.lng - ll1.lng);
  };

  /** Delete any strokes that have a point within eraser radius of (lat, lng) */
  const eraseAt = (lat, lng) => {
    const r = getEraserMapRadius();
    const strokes = allStrokesRef.current;
    strokes.forEach((stroke) => {
      if (!stroke.points?.length) return;
      // Skip already-deleted strokes in this gesture
      if (eraserDeletedStrokesRef.current.some((s) => s.id === stroke.id)) return;
      const hit = stroke.points.some((p) => Math.hypot(p.lat - lat, p.lng - lng) <= r);
      if (!hit) return;
      eraserDeletedStrokesRef.current.push(stroke);
      deleteStrokeById(stroke.id).catch((e) => console.error('[Eraser] delete failed:', e));
      liveRef.current.removePendingWhiteboardStroke(stroke.id);
    });
  };

  /** After a drag gesture ends, push one history entry for all erased strokes */
  const commitErase = () => {
    const deleted = [...eraserDeletedStrokesRef.current];
    eraserDeletedStrokesRef.current = [];
    if (deleted.length === 0) return;

    // Each deleted stroke needs its own mutable id ref for redo tracking
    const idRefs = deleted.map((s) => ({ id: s.id }));

    liveRef.current.pushHistory({
      label: '消しゴム',
      undoFn: async () => {
        for (let i = 0; i < deleted.length; i++) {
          const stroke = deleted[i];
          const newId = await addStroke({
            userId: stroke.userId,
            nickname: stroke.nickname,
            color: stroke.color,
            points: stroke.points,
          });
          idRefs[i].id = newId;
          liveRef.current.addPendingWhiteboardStroke({ ...stroke, id: newId });
        }
      },
      redoFn: async () => {
        for (const ref of idRefs) {
          await deleteStrokeById(ref.id);
          liveRef.current.removePendingWhiteboardStroke(ref.id);
        }
      },
    });
  };

  // ── Enable/disable map dragging + touch-action based on mode ──────────────
  useEffect(() => {
    const container = map.getContainer();
    if (drawingMode === 'whiteboard') {
      map.dragging.disable();
      // Hide native cursor in eraser mode (circle marker shows position instead)
      container.style.cursor = whiteboardTool === 'eraser' ? 'none' : 'crosshair';
      container.style.touchAction = 'none';
    } else {
      map.dragging.enable();
      container.style.cursor = '';
      container.style.touchAction = '';
      isDrawing.current = false;
      isErasing.current = false;
      currentPoints.current = [];
      livePointCount.current = 0;
      setLocalStroke(null);
    }
    return () => {
      map.dragging.enable();
      container.style.cursor = '';
      container.style.touchAction = '';
    };
  }, [drawingMode, whiteboardTool]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Eraser cursor marker ───────────────────────────────────────────────────
  useEffect(() => {
    if (!eraserMarkerRef.current) {
      eraserMarkerRef.current = L.circleMarker([0, 0], {
        radius: ERASER_PX,
        color: '#f97316',
        weight: 2,
        fillColor: '#f97316',
        fillOpacity: 0.08,
        interactive: false,
      });
    }
    const marker = eraserMarkerRef.current;
    if (drawingMode === 'whiteboard' && whiteboardTool === 'eraser') {
      map.addLayer(marker);
    } else {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    }
    return () => {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    };
  }, [drawingMode, whiteboardTool, map]);

  // ── Shared commit logic for pen strokes ───────────────────────────────────
  const commitStroke = (pts) => {
    const { user: u, nickname: nn, color: c,
            addPendingWhiteboardStroke: addPending,
            updatePendingWhiteboardStrokeId: updateId,
            removePendingWhiteboardStroke: removeStroke,
            pushHistory: push } = liveRef.current;

    if (pts.length >= 2 && u) {
      deleteLiveStroke(u.uid)
        .catch((err) => console.error('[Whiteboard] deleteLiveStroke failed:', err));

      const strokeData = { userId: u.uid, nickname: nn || 'user', color: c, points: pts };
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      addPending({ ...strokeData, id: tempId });
      setLocalStroke(null);

      const ref = { id: tempId };
      addStroke(strokeData)
        .then((newId) => {
          // If "描画を消す" ran while addStroke was in-flight, tempId is gone from pending — delete from Firestore too
          const currentPending = useMapStore.getState().pendingWhiteboardStrokes;
          if (!currentPending.some((s) => s.id === tempId)) {
            deleteStrokeById(newId).catch(console.error);
            return;
          }
          ref.id = newId;
          updateId(tempId, newId);
          push({
            label: 'ホワイトボード描画',
            undoFn: async () => {
              await deleteStrokeById(ref.id);
              removeStroke(ref.id);
            },
            redoFn: async () => {
              const id = await addStroke(strokeData);
              ref.id = id;
              addPending({ ...strokeData, id });
            },
          });
        })
        .catch((err) => console.error('[Whiteboard] addStroke failed:', err));
    } else {
      setLocalStroke(null);
    }
  };

  // ── Mouse events (via Leaflet) ────────────────────────────────────────────
  useMapEvents({
    mousedown(e) {
      if (drawingMode !== 'whiteboard') return;
      if (whiteboardTool === 'eraser') {
        isErasing.current = true;
        eraserDeletedStrokesRef.current = [];
        eraseAt(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Pen
      isDrawing.current = true;
      livePointCount.current = 0;
      const pt = { lat: Math.round(e.latlng.lat), lng: Math.round(e.latlng.lng) };
      currentPoints.current = [pt];
      setLocalStroke([pt]);
    },
    mousemove(e) {
      if (drawingMode !== 'whiteboard') return;
      // Update eraser marker position
      if (eraserMarkerRef.current) {
        eraserMarkerRef.current.setLatLng([e.latlng.lat, e.latlng.lng]);
      }
      if (whiteboardTool === 'eraser') {
        if (isErasing.current) eraseAt(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Pen
      if (!isDrawing.current) return;
      const pt = { lat: Math.round(e.latlng.lat), lng: Math.round(e.latlng.lng) };
      currentPoints.current = [...currentPoints.current, pt];
      livePointCount.current += 1;
      if (currentPoints.current.length % 3 === 0) {
        setLocalStroke([...currentPoints.current]);
      }
      if (livePointCount.current >= 3 && user) {
        livePointCount.current = 0;
        updateLiveStroke(user.uid, nickname || 'user', color, [...currentPoints.current])
          .catch((err) => console.error('[Whiteboard] updateLiveStroke failed:', err));
      }
    },
    mouseup() {
      if (drawingMode !== 'whiteboard') return;
      if (whiteboardTool === 'eraser') {
        if (isErasing.current) {
          isErasing.current = false;
          commitErase();
        }
        return;
      }
      // Pen
      if (!isDrawing.current) return;
      isDrawing.current = false;
      const pts = currentPoints.current;
      currentPoints.current = [];
      livePointCount.current = 0;
      commitStroke(pts);
    },
  });

  // ── Pen / touch pointer events (native DOM — covers stylus and finger) ────
  useEffect(() => {
    const container = map.getContainer();

    const toLatLng = (clientX, clientY) => {
      const rect = container.getBoundingClientRect();
      return map.containerPointToLatLng(
        L.point(clientX - rect.left, clientY - rect.top),
      );
    };

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse') return;
      const { drawingMode: dm, whiteboardTool: wt } = liveRef.current;
      if (dm !== 'whiteboard') return;
      e.preventDefault();
      e.stopPropagation();
      const latlng = toLatLng(e.clientX, e.clientY);
      if (wt === 'eraser') {
        isErasing.current = true;
        eraserDeletedStrokesRef.current = [];
        eraseAt(latlng.lat, latlng.lng);
        return;
      }
      // Pen
      isDrawing.current = true;
      livePointCount.current = 0;
      const pt = { lat: Math.round(latlng.lat), lng: Math.round(latlng.lng) };
      currentPoints.current = [pt];
      setLocalStroke([pt]);
    };

    const onPointerMove = (e) => {
      if (e.pointerType === 'mouse') return;
      const { drawingMode: dm, whiteboardTool: wt, user: u, nickname: nn, color: c } = liveRef.current;
      if (dm !== 'whiteboard') return;
      e.preventDefault();
      const latlng = toLatLng(e.clientX, e.clientY);
      // Update eraser marker
      if (eraserMarkerRef.current) {
        eraserMarkerRef.current.setLatLng([latlng.lat, latlng.lng]);
      }
      if (wt === 'eraser') {
        if (isErasing.current) eraseAt(latlng.lat, latlng.lng);
        return;
      }
      // Pen
      if (!isDrawing.current) return;
      const pt = { lat: Math.round(latlng.lat), lng: Math.round(latlng.lng) };
      currentPoints.current = [...currentPoints.current, pt];
      livePointCount.current += 1;
      if (currentPoints.current.length % 3 === 0) {
        setLocalStroke([...currentPoints.current]);
      }
      if (livePointCount.current >= 3 && u) {
        livePointCount.current = 0;
        updateLiveStroke(u.uid, nn || 'user', c, [...currentPoints.current])
          .catch((err) => console.error('[Whiteboard] updateLiveStroke failed:', err));
      }
    };

    const onPointerUp = (e) => {
      if (e.pointerType === 'mouse') return;
      const { drawingMode: dm, whiteboardTool: wt } = liveRef.current;
      if (dm !== 'whiteboard') return;
      if (wt === 'eraser') {
        if (isErasing.current) {
          isErasing.current = false;
          commitErase();
        }
        return;
      }
      // Pen
      if (!isDrawing.current) return;
      isDrawing.current = false;
      const pts = currentPoints.current;
      currentPoints.current = [];
      livePointCount.current = 0;
      commitStroke(pts);
    };

    container.addEventListener('pointerdown', onPointerDown, { passive: false });
    container.addEventListener('pointermove', onPointerMove, { passive: false });
    container.addEventListener('pointerup',   onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup',   onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  // Determine first stroke ID per user (by createdAt asc; pending strokes have no createdAt → sort last)
  const getTs = (s) => s.createdAt?.toMillis?.() ?? (s.createdAt?.seconds != null ? s.createdAt.seconds * 1000 : Infinity);
  const firstStrokeIdByUser = new Map();
  [...allStrokes].sort((a, b) => getTs(a) - getTs(b)).forEach((s) => {
    if (!firstStrokeIdByUser.has(s.userId)) firstStrokeIdByUser.set(s.userId, s.id);
  });

  return (
    <>
      {/* In-progress stroke preview (pen mode) */}
      {localStroke && localStroke.length >= 2 && (
        <Polyline
          positions={localStroke.map((p) => [p.lat, p.lng])}
          pathOptions={{ color, weight: 3, opacity: 0.85 }}
          interactive={false}
        />
      )}

      {/* All committed strokes */}
      {allStrokes.map((stroke) => {
        if (!stroke.points || stroke.points.length < 2) return null;
        return (
          <Polyline
            key={stroke.id}
            positions={stroke.points.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: stroke.color, weight: 3, opacity: 0.85 }}
            interactive={false}
          />
        );
      })}

      {/* Nickname labels — first stroke per user only */}
      {allStrokes.map((stroke) => {
        if (!stroke.points?.length) return null;
        if (firstStrokeIdByUser.get(stroke.userId) !== stroke.id) return null;
        return (
          <StrokeLabelMarker
            key={`lbl-${stroke.id}`}
            points={stroke.points}
            nickname={stroke.nickname}
            color={stroke.color}
          />
        );
      })}

      {/* Live in-progress strokes from other users */}
      {liveStrokes
        .filter((s) => s.userId !== user?.uid)
        .map((stroke) => {
          if (!stroke.points || stroke.points.length < 2) return null;
          return (
            <Polyline
              key={`live-${stroke.id}`}
              positions={stroke.points.map((p) => [p.lat, p.lng])}
              pathOptions={{ color: stroke.color, weight: 3, opacity: 0.6, dashArray: '6 4' }}
              interactive={false}
            />
          );
        })}

      {/* Nickname labels for other users' live strokes */}
      {liveStrokes
        .filter((s) => s.userId !== user?.uid && s.points?.length > 0)
        .map((stroke) => (
          <StrokeLabelMarker
            key={`live-lbl-${stroke.id}`}
            points={stroke.points}
            nickname={stroke.nickname}
            color={stroke.color}
          />
        ))}
    </>
  );
}

export default function WhiteboardLayer() {
  // Subscribe directly to Firestore here so real-time updates are guaranteed
  // regardless of Zustand propagation timing.
  const [whiteboardStrokes, setWbStrokes] = useState([]);
  const [liveStrokes, setLiveStrokes] = useState([]);
  const { showWhiteboard } = useMapStore();

  useEffect(() => {
    const unsub1 = subscribeWhiteboard((strokes) => {
      setWbStrokes(strokes);
    });
    const unsub2 = subscribeLiveStrokes((strokes) => {
      setLiveStrokes(strokes);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  // Keep subscriptions alive but render nothing when hidden
  if (!showWhiteboard) return null;

  return <WhiteboardEvents whiteboardStrokes={whiteboardStrokes} liveStrokes={liveStrokes} />;
}
