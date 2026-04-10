import { create } from 'zustand';

const useMapStore = create((set) => ({
  // ── Layer visibility ────────────────────────────────────────────────────────
  layers: {
    city:          true,
    highway:       true,
    highspeed_rail: true,
    railway:       true,
    border:        true,
    diplomatic:    false,
    features:      true,  // custom drawn features
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
  setSelectedFeature: (feature) => set({ selectedFeature: feature, selectedCity: null }),
  clearSelectedFeature: () => set({ selectedFeature: null }),

  // ── Selected city (for CityEditPopup) ─────────────────────────────────────
  selectedCity: null,
  setSelectedCity: (city) => set({ selectedCity: city, selectedFeature: null }),
  clearSelectedCity: () => set({ selectedCity: null }),

  // ── Overlay opacity ────────────────────────────────────────────────────────
  overlayOpacity: 0.22,
  setOverlayOpacity: (v) => set({ overlayOpacity: v }),

  // ── Map settings ────────────────────────────────────────────────────────────
  mapImageUrl: null,
  setMapImageUrl: (url) => set({ mapImageUrl: url }),
  currentTurn: 1,
  setCurrentTurn: (turn) => set({ currentTurn: turn }),
}));

export default useMapStore;
