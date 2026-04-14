import { useEffect, useState } from 'react';
import { MapContainer, ImageOverlay, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { subscribeFeatures } from '../../firebase/features';
import { subscribeCities } from '../../firebase/cities';
import { subscribePlaceNames } from '../../firebase/placeNames';
import { subscribeFacilities } from '../../firebase/facilities';
import { subscribeWhiteboard, subscribeLiveStrokes } from '../../firebase/whiteboard';
import useMapStore from '../../store/useMapStore';
import CityLayer from './CityLayer';
import FacilityLayer from './FacilityLayer';
import FeatureLayer from './FeatureLayer';
import DrawingTools from './DrawingTools';
import DiplomaticLines from './DiplomaticLines';
import PlaceNameLayer from './PlaceNameLayer';
import MeasureTool from './MeasureTool';
import WhiteboardLayer from './WhiteboardLayer';

// Fix Leaflet default marker icons broken by Vite's asset bundling
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Coordinate space matches extractCoords.mjs BASE_W / BASE_H constants.
// These are independent of the actual image pixel size.
const MAP_W = 4000;
const MAP_H = 6008;
const BASE_URL  = import.meta.env.BASE_URL.replace(/\/$/, '');

// Fit viewport + set minZoom + maxBounds whenever image dimensions change
function MapBoundsFitter({ h, w }) {
  const map = useMap();
  useEffect(() => {
    if (h > 0 && w > 0) {
      const imageBounds = [[0, 0], [h, w]];
      const center  = [h / 2, w / 2];
      const fitZoom = map.getBoundsZoom(imageBounds);
      map.setView(center, fitZoom, { animate: false });
      map.setMaxBounds([[-h * 0.1, -w * 0.1], [h * 1.1, w * 1.1]]);
      map.setMinZoom(fitZoom);
    }
  }, [h, w]);
  return null;
}

// Coordinate display + vector layers (needs map context)
function MapInner() {
  const [coords, setCoords] = useState({ lat: 0, lng: 0 });

  useMapEvents({
    mousemove(e) {
      setCoords({ lat: Math.round(e.latlng.lat), lng: Math.round(e.latlng.lng) });
    },
  });

  return (
    <>
      <div className="absolute bottom-6 right-2 z-[500] bg-black/60 text-white text-xs
                      px-2 py-1 rounded pointer-events-none font-mono">
        X: {coords.lng} / Y: {coords.lat}
      </div>

      {/* City markers, place name labels, facility markers, and custom drawn features */}
      <CityLayer />
      <PlaceNameLayer />
      <FacilityLayer />
      <FeatureLayer />
      <DrawingTools />
      <DiplomaticLines />
      <MeasureTool />
      <WhiteboardLayer />
      <MapFlyTo />
      <SearchHighlightMarker />
    </>
  );
}

// Fly to a target coordinate when search sets flyToTarget
function MapFlyTo() {
  const { flyToTarget, clearFlyToTarget } = useMapStore();
  const map = useMap();
  useEffect(() => {
    if (!flyToTarget) return;
    const zoom = flyToTarget.zoom ?? (map.getMinZoom() + 3);
    map.flyTo([flyToTarget.lat, flyToTarget.lng], zoom, { duration: 1.0 });
    clearFlyToTarget();
  }, [flyToTarget]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Pulsing ring marker for search results
const highlightIcon = L.divIcon({
  className: 'search-highlight-icon',
  html: '<div class="search-highlight-ring"></div>',
  iconSize: [50, 50],
  iconAnchor: [25, 25],
});

function SearchHighlightMarker() {
  const { searchHighlight } = useMapStore();
  if (!searchHighlight) return null;
  return (
    <Marker
      position={[searchHighlight.lat, searchHighlight.lng]}
      icon={highlightIcon}
      interactive={false}
      zIndexOffset={-200}
    />
  );
}

export default function MapView() {
  const {
    mapImageUrl, setMapImageUrl,
    setFeatures, setCities, setPlaceNames, setFacilities,
    setWhiteboardStrokes, setLiveStrokes,
    setCurrentTurn,
    layers,
    overlayOpacity,
  } = useMapStore();
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'settings', 'main'), async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setCurrentTurn(data.currentTurn ?? 1);

      if (data.activeMapVersionId) {
        const verSnap = await getDoc(doc(db, 'mapVersions', data.activeMapVersionId));
        if (verSnap.exists()) {
          const stored   = verSnap.data().imageUrl ?? '';
          const resolved = stored.startsWith('/') ? BASE_URL + stored : BASE_URL + '/' + stored;
          setMapImageUrl(resolved);
        }
      }
    });

    const unsubFeatures    = subscribeFeatures(setFeatures);
    const unsubCities      = subscribeCities(setCities);
    const unsubPlaceNames  = subscribePlaceNames(setPlaceNames);
    const unsubFacilities  = subscribeFacilities(setFacilities);
    const unsubWhiteboard  = subscribeWhiteboard(setWhiteboardStrokes);
    const unsubLiveStrokes = subscribeLiveStrokes(setLiveStrokes);

    return () => { unsubSettings(); unsubFeatures(); unsubCities(); unsubPlaceNames(); unsubFacilities(); unsubWhiteboard(); unsubLiveStrokes(); };
  }, []);

  useEffect(() => {
    if (!mapImageUrl) return;
    const img = new Image();
    img.onload  = () => setImgLoaded(true);
    img.onerror = () => console.error('[MapView] image failed to load:', mapImageUrl);
    img.src = mapImageUrl;
  }, [mapImageUrl]);

  const bounds = [[0, 0], [MAP_H, MAP_W]];
  const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}"><rect width="100%" height="100%" fill="#374151"/><text x="50%" y="50%" fill="#9CA3AF" font-size="32" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">地図画像が設定されていません</text></svg>`;
  const displayUrl = mapImageUrl || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(placeholderSvg)}`;

  // Trace image overlay helper
  const traceUrl = (name) => `${BASE_URL}/maps/${name}`;

  return (
    <div className="absolute inset-0">
      <MapContainer
        crs={L.CRS.Simple}
        center={[MAP_H / 2, MAP_W / 2]}
        zoom={-5}
        minZoom={-10}
        style={{ width: '100%', height: '100%', background: '#c8d8e8' }}
        zoomControl={true}
        doubleClickZoom={false}
      >
        {/* Base map */}
        <ImageOverlay key={displayUrl} url={displayUrl} bounds={bounds} />

        {/* Trace image overlays — opacity 0.6 for balanced visibility */}
        {layers.border           && <ImageOverlay url={traceUrl('state_line.png')}      bounds={bounds} opacity={overlayOpacity} />}
        {layers.regional_border  && <ImageOverlay url={traceUrl('regional_border.png')} bounds={bounds} opacity={overlayOpacity} />}
        {layers.railway          && <ImageOverlay url={traceUrl('railway.png')}         bounds={bounds} opacity={overlayOpacity} />}
        {layers.highspeed_rail   && <ImageOverlay url={traceUrl('highspeed_rail.png')}  bounds={bounds} opacity={overlayOpacity} />}
        {layers.highway          && <ImageOverlay url={traceUrl('highway.png')}         bounds={bounds} opacity={overlayOpacity} />}

        <MapBoundsFitter h={MAP_H} w={MAP_W} />
        <MapInner />
      </MapContainer>
    </div>
  );
}
