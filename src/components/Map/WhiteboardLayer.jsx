import { useEffect, useRef, useState } from 'react';
import { Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';
import {
  addStroke, updateLiveStroke, deleteLiveStroke, deleteStrokeById,
  subscribeWhiteboard, subscribeLiveStrokes,
} from '../../firebase/whiteboard';

// Deterministic color from nickname string
function nicknameToColor(nickname) {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = ((hash << 5) - hash) + nickname.charCodeAt(i);
    hash |= 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
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
    pendingWhiteboardStrokes,
    addPendingWhiteboardStroke,
    updatePendingWhiteboardStrokeId,
    removePendingWhiteboardStroke,
  } = useMapStore();
  const { user, nickname } = useAuthStore();
  const isDrawing = useRef(false);
  const currentPoints = useRef([]);
  const livePointCount = useRef(0);
  const [localStroke, setLocalStroke] = useState(null);

  const color = nicknameToColor(nickname || 'user');

  // Keep a always-fresh ref so pointer event handlers (registered once) can
  // read the latest drawingMode / user / nickname / color / store actions.
  const liveRef = useRef(null);
  liveRef.current = {
    drawingMode, user, nickname, color,
    addPendingWhiteboardStroke,
    updatePendingWhiteboardStrokeId,
    removePendingWhiteboardStroke,
    pushHistory,
  };

  // ── Enable/disable map dragging + touch-action based on mode ──────────────
  useEffect(() => {
    const container = map.getContainer();
    if (drawingMode === 'whiteboard') {
      map.dragging.disable();
      container.style.cursor = 'crosshair';
      container.style.touchAction = 'none'; // prevent browser scroll/zoom on pen/touch
    } else {
      map.dragging.enable();
      container.style.cursor = '';
      container.style.touchAction = '';
      isDrawing.current = false;
      currentPoints.current = [];
      livePointCount.current = 0;
      setLocalStroke(null);
    }
    return () => {
      map.dragging.enable();
      container.style.cursor = '';
      container.style.touchAction = '';
    };
  }, [drawingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared commit logic (called from both mouse and pointer handlers) ──────
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
      isDrawing.current = true;
      livePointCount.current = 0;
      const pt = { lat: Math.round(e.latlng.lat), lng: Math.round(e.latlng.lng) };
      currentPoints.current = [pt];
      setLocalStroke([pt]);
    },
    mousemove(e) {
      if (drawingMode !== 'whiteboard' || !isDrawing.current) return;
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
      if (drawingMode !== 'whiteboard' || !isDrawing.current) return;
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
      // Mouse is already handled by Leaflet's useMapEvents above
      if (e.pointerType === 'mouse') return;
      const { drawingMode: dm } = liveRef.current;
      if (dm !== 'whiteboard') return;
      e.preventDefault();
      e.stopPropagation();
      isDrawing.current = true;
      livePointCount.current = 0;
      const latlng = toLatLng(e.clientX, e.clientY);
      const pt = { lat: Math.round(latlng.lat), lng: Math.round(latlng.lng) };
      currentPoints.current = [pt];
      setLocalStroke([pt]);
    };

    const onPointerMove = (e) => {
      if (e.pointerType === 'mouse') return;
      const { drawingMode: dm, user: u, nickname: nn, color: c } = liveRef.current;
      if (dm !== 'whiteboard' || !isDrawing.current) return;
      e.preventDefault();
      const latlng = toLatLng(e.clientX, e.clientY);
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
      const { drawingMode: dm } = liveRef.current;
      if (dm !== 'whiteboard' || !isDrawing.current) return;
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

  // Merge Firestore strokes + own pending strokes, deduplicated by ID
  const firestoreIds = new Set(whiteboardStrokes.map((s) => s.id));
  const allStrokes = [
    ...whiteboardStrokes,
    ...pendingWhiteboardStrokes.filter((s) => !firestoreIds.has(s.id)),
  ];

  // Determine first stroke ID per user (by createdAt asc; pending strokes have no createdAt → sort last)
  const getTs = (s) => s.createdAt?.toMillis?.() ?? (s.createdAt?.seconds != null ? s.createdAt.seconds * 1000 : Infinity);
  const firstStrokeIdByUser = new Map();
  [...allStrokes].sort((a, b) => getTs(a) - getTs(b)).forEach((s) => {
    if (!firstStrokeIdByUser.has(s.userId)) firstStrokeIdByUser.set(s.userId, s.id);
  });

  return (
    <>
      {/* In-progress stroke preview */}
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

  useEffect(() => {
    const unsub1 = subscribeWhiteboard((strokes) => {
      setWbStrokes(strokes);
    });
    const unsub2 = subscribeLiveStrokes((strokes) => {
      setLiveStrokes(strokes);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  return <WhiteboardEvents whiteboardStrokes={whiteboardStrokes} liveStrokes={liveStrokes} />;
}
