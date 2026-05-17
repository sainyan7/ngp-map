import { create } from 'zustand';

const useMapStore = create((set, get) => ({
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
    region:          true,
    diplomatic:      false,
    features:        false,
  },
  toggleLayer: (layerName) =>
    set((state) => ({
      layers: { ...state.layers, [layerName]: !state.layers[layerName] },
    })),

  // ── Drawing tool state ──────────────────────────────────────────────────────
  drawingMode: 'select',
  setDrawingMode: (mode) => set({ drawingMode: mode, pendingPoints: [], whiteboardTool: 'pen' }),

  // ── Whiteboard sub-tool ('pen' | 'eraser') ────────────────────────────────
  whiteboardTool: 'pen',
  setWhiteboardTool: (tool) => set({ whiteboardTool: tool }),

  pendingPoints: [],
  addPendingPoint: (latlng) =>
    set((state) => ({ pendingPoints: [...state.pendingPoints, latlng] })),
  removeLastPendingPoint: () =>
    set((state) => ({ pendingPoints: state.pendingPoints.slice(0, -1) })),
  clearPendingPoints: () => set({ pendingPoints: [] }),
  setPendingPoints: (pts) => set({ pendingPoints: pts }),

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

  // ── Whiteboard visibility toggle ──────────────────────────────────────────
  showWhiteboard: true,
  toggleShowWhiteboard: () => set((state) => ({ showWhiteboard: !state.showWhiteboard })),

  // ── Ruby (furigana) display toggle ────────────────────────────────────────
  showRuby: false,
  toggleRuby: () => set((state) => ({ showRuby: !state.showRuby })),

  // ── Facility label display toggle ─────────────────────────────────────────
  showFacilityLabel: false,
  toggleFacilityLabel: () => set((state) => ({ showFacilityLabel: !state.showFacilityLabel })),

  // ── Facility type sub-filters ─────────────────────────────────────────────
  facilityTypeFilters: { airport: true, port: true, military: true, other: true },
  toggleFacilityTypeFilter: (key) =>
    set((state) => ({
      facilityTypeFilters: { ...state.facilityTypeFilters, [key]: !state.facilityTypeFilters[key] },
    })),

  // ── Region merge mode ────────────────────────────────────────────────────
  // targetType: 'region' | 'state' | 'archipelago'  (the type being CREATED)
  // selection: array of feature objects whose polygons will be merged
  regionMergeMode: false,
  regionMergeTargetType: null,
  regionMergeSelection: [],
  startRegionMerge: (targetType, initialFeature) => set({
    regionMergeMode: true,
    regionMergeTargetType: targetType,
    regionMergeSelection: initialFeature ? [initialFeature] : [],
    selectedFeature: null,
    selectedCity: null,
    selectedPlaceName: null,
  }),
  toggleRegionMergeSelection: (feature) =>
    set((s) => ({
      regionMergeSelection: s.regionMergeSelection.some((f) => f.id === feature.id)
        ? s.regionMergeSelection.filter((f) => f.id !== feature.id)
        : [...s.regionMergeSelection, feature],
    })),
  clearRegionMerge: () => set({ regionMergeMode: false, regionMergeTargetType: null, regionMergeSelection: [] }),

  // ── Place name → region assignment mode ──────────────────────────────────
  // Used when the user clicks "地図から選択" in PlaceNameEditPopup.
  // FeatureLayer watches this flag: clicking a region polygon calls
  // commitRegionIdForPlaceName with the region id AND the polygon index,
  // enabling per-exclave (飛び地) linking instead of whole-region linking.
  assigningRegionToPlaceName: false,
  startAssigningRegionToPlaceName: () => set({ assigningRegionToPlaceName: true }),
  pendingRegionIdForPlaceName: null,
  pendingPolygonIdxForPlaceName: null,   // null = whole region; 0,1,2... = specific polygon
  commitRegionIdForPlaceName: (regionId, polygonIdx = null) => set({
    pendingRegionIdForPlaceName: regionId,
    pendingPolygonIdxForPlaceName: polygonIdx,
    assigningRegionToPlaceName: false,
  }),
  clearPendingRegionIdForPlaceName: () => set({
    pendingRegionIdForPlaceName: null,
    pendingPolygonIdxForPlaceName: null,
  }),
  cancelAssigningRegionToPlaceName: () => set({ assigningRegionToPlaceName: false }),

  // ── Region type sub-filters ───────────────────────────────────────────────
  regionTypeFilters: { state: true, region: true, county: true, island: true, archipelago: true, other: true },
  toggleRegionTypeFilter: (key) =>
    set((state) => ({
      regionTypeFilters: { ...state.regionTypeFilters, [key]: !state.regionTypeFilters[key] },
    })),

  // ── Map settings ────────────────────────────────────────────────────────────
  mapImageUrl: null,
  setMapImageUrl: (url) => set({ mapImageUrl: url }),
  currentTurn: 1,
  setCurrentTurn: (turn) => set({ currentTurn: turn }),

  // ── Distance measurement ─────────────────────────────────────────────────
  kmPerUnit: 1.45,
  setKmPerUnit: (v) => set({ kmPerUnit: v }),
  measureStart: null,
  setMeasureStart: (pt) => set({ measureStart: pt }),
  measureEnd: null,
  setMeasureEnd: (pt) => set({ measureEnd: pt }),
  clearMeasure: () => set({ measureStart: null, measureEnd: null }),

  // ── Pending whiteboard strokes (own strokes drawn this session) ────────────
  // Added immediately on mouseup — persists until undo / erase button.
  // Independent of Firestore subscription reliability.
  pendingWhiteboardStrokes: [],
  addPendingWhiteboardStroke: (stroke) =>
    set((s) => ({ pendingWhiteboardStrokes: [...s.pendingWhiteboardStrokes, stroke] })),
  updatePendingWhiteboardStrokeId: (tempId, realId) =>
    set((s) => ({
      pendingWhiteboardStrokes: s.pendingWhiteboardStrokes.map((stroke) =>
        stroke.id === tempId ? { ...stroke, id: realId } : stroke,
      ),
    })),
  removePendingWhiteboardStroke: (id) =>
    set((s) => ({
      pendingWhiteboardStrokes: s.pendingWhiteboardStrokes.filter((stroke) => stroke.id !== id),
    })),
  clearPendingWhiteboardStrokesByUser: (userId) =>
    set((s) => ({
      pendingWhiteboardStrokes: s.pendingWhiteboardStrokes.filter((stroke) => stroke.userId !== userId),
    })),
  clearAllPendingWhiteboardStrokes: () => set({ pendingWhiteboardStrokes: [] }),

  // ── Region vertex editing ─────────────────────────────────────────────────
  editingRegion: null,
  editingRegionPolygons: [],
  setEditingRegion: (f) => set({
    editingRegion: f,
    editingRegionPolygons: (f.polygons ?? []).map((p) => p.latlngs.map((v) => [v.lat, v.lng])),
  }),
  setEditingRegionPolygons: (polys) => set({ editingRegionPolygons: polys }),
  clearEditingRegion: () => set({ editingRegion: null, editingRegionPolygons: [] }),

  // ── Region exclave drawing ────────────────────────────────────────────────
  addingExclaveToRegion: null,
  setAddingExclaveToRegion: (f) => set({ addingExclaveToRegion: f, drawingMode: 'add_exclave' }),
  clearAddingExclaveToRegion: () => set({ addingExclaveToRegion: null }),

  // ── Pick-existing-region mode ─────────────────────────────────────────────
  // Activated from DrawingTools when the user wants to add an already-drawn
  // region polygon (including individual exclaves) to the multi-polygon batch.
  // FeatureLayer intercepts polygon clicks and calls commitPickedPolygon.
  pickingExistingRegion: false,
  startPickingExistingRegion: () => set({ pickingExistingRegion: true }),
  cancelPickingExistingRegion: () => set({ pickingExistingRegion: false }),
  pickedPolygonPositions: null,  // [[lat, lng], ...] of the clicked polygon
  commitPickedPolygon: (positions) => set({
    pickedPolygonPositions: positions,
    pickingExistingRegion: false,
  }),
  clearPickedPolygon: () => set({ pickedPolygonPositions: null }),

  // ── Undo / Redo history ───────────────────────────────────────────────────
  // Each entry: { label: string, undoFn: async () => void, redoFn: async () => void }
  historyStack: [],
  futureStack: [],
  pushHistory: (entry) => set((s) => ({
    historyStack: [...s.historyStack.slice(-49), entry],
    futureStack: [],
  })),
  replaceHistoryWithEntry: (entry) => set({ historyStack: [entry], futureStack: [] }),
  performUndo: async () => {
    const { historyStack, futureStack } = get();
    if (historyStack.length === 0) return;
    const entry = historyStack[historyStack.length - 1];
    set({ historyStack: historyStack.slice(0, -1), futureStack: [...futureStack, entry] });
    try { await entry.undoFn(); } catch (e) {
      console.error('[Undo] failed:', e);
      set((s) => ({ historyStack: [...s.historyStack, entry], futureStack: s.futureStack.slice(0, -1) }));
    }
  },
  performRedo: async () => {
    const { historyStack, futureStack } = get();
    if (futureStack.length === 0) return;
    const entry = futureStack[futureStack.length - 1];
    set({ futureStack: futureStack.slice(0, -1), historyStack: [...historyStack, entry] });
    try { await entry.redoFn(); } catch (e) {
      console.error('[Redo] failed:', e);
      set((s) => ({ futureStack: [...s.futureStack, entry], historyStack: s.historyStack.slice(0, -1) }));
    }
  },
}));

export default useMapStore;
