import { create } from 'zustand';

const useMapStore = create((set) => ({
  // ── Layer visibility ────────────────────────────────────────────────────────
  layers: {
    city:            true,
    place_names:     true,
    facilities:      true,
    highway:         true,
    highspeed_rail:  true,
    railway:         true,
    border:          true,
    regional_border: true,
    diplomatic:      false,
    features:        false,
  },
  toggleLayer: (layerName) =>
    set((state) => ({
      layers: { ...state.layers, [layerName]: !state.layers[layerName] },
    })),

  // ── Drawing tool state ──────────────────────────────────────────────────────
  drawingMode: 'select',
  setDrawingMode: (mode) => set({ drawingMode: mode, pendingPoints: [] }),

  pendingPoints: [],
  addPendingPoint: (latlng) =>
    set((state) => ({ pendingPoints: [...state.pendingPoints, latlng] })),
  clearPendingPoints: () => set({ pendingPoints: [] }),

  // ── Data from Firestore (real-time) ─────────────────────────────────────────
  features: [],
  setFeatures: (features) => set({ features }),

  cities: [],
  setCities: (cities) => set({ cities }),

  // ── Selected feature (for FeaturePopup) ───────────────────────────────────
  selectedFeature: null,
  setSelectedFeature: (feature) => set({ selectedFeature: feature, selectedCity: null, selectedPlaceName: null }),
  clearSelectedFeature: () => set({ selectedFeature: null }),

  // ── Selected city (for CityEditPopup) ─────────────────────────────────────
  selectedCity: null,
  setSelectedCity: (city) => set({ selectedCity: city, selectedFeature: null, selectedPlaceName: null }),
  clearSelectedCity: () => set({ selectedCity: null, cityDragEnabled: false }),

  // ── City drag mode (must be explicitly enabled in CityEditPopup) ───────────
  cityDragEnabled: false,
  setCityDragEnabled: (enabled) => set({ cityDragEnabled: enabled }),

  // ── Facilities (real-time from Firestore) ─────────────────────────────────
  facilities: [],
  setFacilities: (facilities) => set({ facilities }),

  selectedFacility: null,
  setSelectedFacility: (f) => set({ selectedFacility: f, selectedFeature: null, selectedCity: null, selectedPlaceName: null }),
  clearSelectedFacility: () => set({ selectedFacility: null, facilityDragEnabled: false }),

  facilityDragEnabled: false,
  setFacilityDragEnabled: (enabled) => set({ facilityDragEnabled: enabled }),

  // ── Place names (real-time from Firestore) ─────────────────────────────────
  placeNames: [],
  setPlaceNames: (placeNames) => set({ placeNames }),

  selectedPlaceName: null,
  setSelectedPlaceName: (pn) => set({ selectedPlaceName: pn, selectedFeature: null, selectedCity: null }),
  clearSelectedPlaceName: () => set({ selectedPlaceName: null, placeNameDragEnabled: false }),

  placeNameDragEnabled: false,
  setPlaceNameDragEnabled: (enabled) => set({ placeNameDragEnabled: enabled }),

  // ── Fly-to target (triggered by search) ───────────────────────────────────
  flyToTarget: null,
  setFlyToTarget: (target) => set({ flyToTarget: target }),
  clearFlyToTarget: () => set({ flyToTarget: null }),

  // ── Search highlight ───────────────────────────────────────────────────────
  searchHighlight: null,
  setSearchHighlight: (hl) => set({ searchHighlight: hl }),
  clearSearchHighlight: () => set({ searchHighlight: null }),

  // ── Overlay opacity ────────────────────────────────────────────────────────
  overlayOpacity: 0.22,
  setOverlayOpacity: (v) => set({ overlayOpacity: v }),

  // ── Factions (real-time from Firestore) ────────────────────────────────────
  factions: [],
  setFactions: (factions) => set({ factions }),

  // ── Ruby (furigana) display toggle ────────────────────────────────────────
  showRuby: true,
  toggleRuby: () => set((state) => ({ showRuby: !state.showRuby })),

  // ── Facility label display toggle ─────────────────────────────────────────
  showFacilityLabel: true,
  toggleFacilityLabel: () => set((state) => ({ showFacilityLabel: !state.showFacilityLabel })),

  // ── Map settings ────────────────────────────────────────────────────────────
  mapImageUrl: null,
  setMapImageUrl: (url) => set({ mapImageUrl: url }),
  currentTurn: 1,
  setCurrentTurn: (turn) => set({ currentTurn: turn }),

  // ── Distance measurement ─────────────────────────────────────────────────
  kmPerUnit: 100,
  setKmPerUnit: (v) => set({ kmPerUnit: v }),
  measureStart: null,
  setMeasureStart: (pt) => set({ measureStart: pt }),
  measureEnd: null,
  setMeasureEnd: (pt) => set({ measureEnd: pt }),
  clearMeasure: () => set({ measureStart: null, measureEnd: null }),

  // ── Whiteboard strokes (real-time, ephemeral) ─────────────────────────────
  whiteboardStrokes: [],
  setWhiteboardStrokes: (strokes) => set({ whiteboardStrokes: strokes }),
}));

export default useMapStore;
