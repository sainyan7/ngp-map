import { useEffect, useRef, useState } from 'react';
import { Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useMapStore from '../../store/useMapStore';
import useAuthStore from '../../store/useAuthStore';
import { addStroke } from '../../firebase/whiteboard';

// Deterministic color from nickname string
function nicknameToColor(nickname) {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = ((hash << 5) - hash) + nickname.charCodeAt(i);
    hash |= 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
}

// Small label at the start of each stroke
function StrokeLabelMarker({ position, nickname, color }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    const icon = L.divIcon({
      className: '',
      html: `<span style="
        color:${color};font-size:10px;font-weight:bold;
        text-shadow:0 0 3px #000,0 0 3px #000;
        white-space:nowrap;pointer-events:none;
      ">${nickname}</span>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    const m = L.marker([position.lat, position.lng], { icon, interactive: false, zIndexOffset: -100 });
    m.addTo(map);
    return () => { m.remove(); };
  }, [position, nickname, color]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function WhiteboardEvents() {
  const map = useMap();
  const { drawingMode, whiteboardStrokes } = useMapStore();
  const { user, nickname } = useAuthStore();
  const isDrawing = useRef(false);
  const currentPoints = useRef([]);
  const [localStroke, setLocalStroke] = useState(null);

  const color = nicknameToColor(nickname || 'user');

  // Enable/disable map dragging based on mode
  useEffect(() => {
    if (drawingMode === 'whiteboard') {
      map.dragging.disable();
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
      isDrawing.current = false;
      currentPoints.current = [];
      setLocalStroke(null);
    }
    return () => {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
    };
  }, [drawingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useMapEvents({
    mousedown(e) {
      if (drawingMode !== 'whiteboard') return;
      isDrawing.current = true;
      const pt = { lat: Math.round(e.latlng.lat), lng: Math.round(e.latlng.lng) };
      currentPoints.current = [pt];
      setLocalStroke([pt]);
    },
    mousemove(e) {
      if (drawingMode !== 'whiteboard' || !isDrawing.current) return;
      const pt = { lat: Math.round(e.latlng.lat), lng: Math.round(e.latlng.lng) };
      currentPoints.current = [...currentPoints.current, pt];
      // Throttle local preview — update every 3 points
      if (currentPoints.current.length % 3 === 0) {
        setLocalStroke([...currentPoints.current]);
      }
    },
    mouseup() {
      if (drawingMode !== 'whiteboard' || !isDrawing.current) return;
      isDrawing.current = false;
      const pts = currentPoints.current;
      if (pts.length >= 2 && user) {
        addStroke({
          userId: user.uid,
          nickname: nickname || 'user',
          color,
          points: pts,
        }).catch((err) => console.error('[Whiteboard] addStroke failed:', err));
      }
      currentPoints.current = [];
      setLocalStroke(null);
    },
  });

  return (
    <>
      {/* Local in-progress stroke preview */}
      {localStroke && localStroke.length >= 2 && (
        <Polyline
          positions={localStroke.map((p) => [p.lat, p.lng])}
          pathOptions={{ color, weight: 3, opacity: 0.85 }}
          interactive={false}
        />
      )}

      {/* All persisted strokes */}
      {whiteboardStrokes.map((stroke) => {
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

      {/* Nickname labels at start of each stroke */}
      {whiteboardStrokes.map((stroke) => {
        if (!stroke.points || stroke.points.length === 0) return null;
        return (
          <StrokeLabelMarker
            key={`lbl-${stroke.id}`}
            position={stroke.points[0]}
            nickname={stroke.nickname}
            color={stroke.color}
          />
        );
      })}
    </>
  );
}

export default function WhiteboardLayer() {
  return <WhiteboardEvents />;
}
