import { useEffect, useState } from 'react';
import useAuthStore from './store/useAuthStore';
import useMapStore from './store/useMapStore';
import { deleteMyStrokes, deleteAllStrokes } from './firebase/whiteboard';
import PasswordGate from './components/Auth/PasswordGate';
import MapView from './components/Map/MapView';
import FeaturePopup from './components/Map/FeaturePopup';
import CityEditPopup from './components/Map/CityEditPopup';
import PlaceNameEditPopup from './components/Map/PlaceNameEditPopup';
import FacilityEditPopup from './components/Map/FacilityEditPopup';
import MapExportModal from './components/Map/MapExportModal';
import LayerPanel from './components/LayerControl/LayerPanel';
import FactionPanel from './components/FactionControl/FactionPanel';
import SearchBox from './components/Search/SearchBox';


const TOOLS = [
  { mode: 'select',       label: '選択',    title: 'クリックで都市・地名・施設を選択' },
  { mode: 'add_city',     label: '都市追加', title: 'クリックした位置に都市を追加' },
  { mode: 'add_label',    label: '地名追加', title: 'クリックした位置に地名ラベルを追加' },
  { mode: 'add_facility', label: '施設追加', title: 'クリックした位置に重要施設を追加' },
  { mode: 'measure',      label: '計測',    title: '2点をクリックして距離を計測（3クリック目でリセット）' },
  { mode: 'whiteboard',   label: '描画',    title: 'マウス・ペンをドラッグして自由描画（会議用）' },
];

function Header({ onToggleLayer }) {
  const { currentTurn } = useMapStore();
  const { nickname, signOut, isAdmin } = useAuthStore();

  return (
    <header className="h-10 bg-gray-900 border-b border-gray-700 flex items-center px-3 gap-2 shrink-0">
      {/* Hamburger — mobile only */}
      <button
        onClick={onToggleLayer}
        className="md:hidden text-gray-400 hover:text-white text-lg w-7 shrink-0"
        title="レイヤーパネル"
      >
        ☰
      </button>
      <h1 className="text-white font-bold text-sm shrink-0">NGP地図</h1>
      <span className="text-gray-400 text-xs hidden sm:inline shrink-0">ターン: {currentTurn}</span>
      {isAdmin && (
        <span className="text-yellow-400 text-xs bg-yellow-900/30 px-1.5 py-0.5 rounded hidden sm:inline shrink-0">
          管理者
        </span>
      )}
      <SearchBox />
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <span className="text-gray-400 text-xs hidden sm:inline">{nickname}</span>
        <button
          onClick={signOut}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}

function Toolbar({ onExport }) {
  const { drawingMode, setDrawingMode, historyStack, futureStack, performUndo, performRedo,
          clearPendingWhiteboardStrokesByUser, clearAllPendingWhiteboardStrokes } = useMapStore();
  const { user, isAdmin } = useAuthStore();

  return (
    <footer className="h-12 bg-gray-900 border-t border-gray-700 flex items-center px-2 gap-1 shrink-0 overflow-x-auto">
      {/* Undo / Redo buttons */}
      <button
        title="元に戻す (Ctrl+Z)"
        onClick={performUndo}
        disabled={historyStack.length === 0}
        className="shrink-0 px-2 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors
                   bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ↩
      </button>
      <button
        title="やり直す (Ctrl+Y)"
        onClick={performRedo}
        disabled={futureStack.length === 0}
        className="shrink-0 px-2 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors
                   bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ↪
      </button>
      <div className="shrink-0 w-px h-5 bg-gray-600 mx-0.5" />
      {TOOLS.map(({ mode, label, title }) => (
        <button
          key={mode}
          title={title}
          onClick={() => setDrawingMode(mode)}
          className={`shrink-0 px-2.5 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors
            ${drawingMode === mode
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
        >
          {label}
        </button>
      ))}

      {/* 解除ボタン — 選択モード以外のとき強調表示、クリックで選択モードに戻る */}
      <button
        title="現在のモードを解除して選択モードに戻る"
        onClick={() => setDrawingMode('select')}
        disabled={drawingMode === 'select'}
        className={`shrink-0 ml-1 px-2.5 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors border
          ${drawingMode !== 'select'
            ? 'bg-orange-700 hover:bg-orange-600 text-white border-orange-500'
            : 'bg-gray-800 text-gray-600 border-gray-700 cursor-default'
          }`}
      >
        解除
      </button>

      {/* Whiteboard clear buttons — visible when in whiteboard mode */}
      {drawingMode === 'whiteboard' && (
        <>
          <button
            title="自分が描いた線をすべて消す"
            onClick={() => {
              if (!user) return;
              deleteMyStrokes(user.uid).catch(console.error);
              clearPendingWhiteboardStrokesByUser(user.uid);
            }}
            className="shrink-0 ml-1 px-2.5 py-1.5 rounded text-xs sm:text-sm font-medium
                       bg-yellow-800 hover:bg-yellow-700 text-yellow-200 transition-colors"
          >
            描画を消す
          </button>
          {isAdmin && (
            <button
              title="全員の描画をすべて消す（管理者専用）"
              onClick={() => {
                deleteAllStrokes().catch(console.error);
                clearAllPendingWhiteboardStrokes();
              }}
              className="shrink-0 px-2.5 py-1.5 rounded text-xs sm:text-sm font-medium
                         bg-red-900 hover:bg-red-800 text-red-200 transition-colors"
            >
              全消去
            </button>
          )}
        </>
      )}

      {/* Export button — not a drawing mode, separated by margin */}
      <button
        onClick={onExport}
        title="マップを画像として保存"
        className="shrink-0 ml-2 px-2.5 py-1.5 rounded text-xs sm:text-sm font-medium
                   bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors border border-gray-600"
      >
        📥 保存
      </button>

      <div className="ml-3 text-xs text-gray-500 hidden md:block shrink-0 whitespace-nowrap">
        {drawingMode === 'select'       && '地物をクリックして詳細を表示'}
        {drawingMode === 'add_city'     && 'クリックした位置に都市を追加'}
        {drawingMode === 'add_label'    && 'クリックした位置に地名ラベルを追加'}
        {drawingMode === 'add_facility' && 'クリックした位置に重要施設を追加'}
        {drawingMode === 'measure'      && '1点目→2点目をクリック、3点目でリセット'}
        {drawingMode === 'whiteboard'   && 'マウス・ペンでドラッグして描画 | 「描画を消す」で自分の線を削除'}
      </div>
    </footer>
  );
}

export default function App() {
  const { isAuthenticated, initializing, restoreSession } = useAuthStore();
  const { performUndo, performRedo } = useMapStore();
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => { restoreSession(); }, []);

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        performUndo();
      } else if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        performRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [performUndo, performRedo]);

  if (initializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PasswordGate />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden">
      <Header onToggleLayer={() => setShowLayerPanel((v) => !v)} />
      <div className="flex flex-1 overflow-hidden relative">
        <LayerPanel open={showLayerPanel} />
        {/* Mobile overlay backdrop — close panel when tapping outside */}
        {showLayerPanel && (
          <div
            className="md:hidden absolute inset-0 z-10 bg-black/40"
            onClick={() => setShowLayerPanel(false)}
          />
        )}
        {/* Map area with relative positioning for absolute overlays */}
        <div className="flex-1 relative">
          <MapView />
          <FeaturePopup />
          <CityEditPopup />
          <PlaceNameEditPopup />
          <FacilityEditPopup />
        </div>
        {/* FactionPanel — hidden on mobile */}
        <FactionPanel />
      </div>
      <Toolbar onExport={() => setShowExport(true)} />
      {showExport && <MapExportModal onClose={() => setShowExport(false)} />}
    </div>
  );
}
