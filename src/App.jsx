import { useEffect } from 'react';
import useAuthStore from './store/useAuthStore';
import useMapStore from './store/useMapStore';
import PasswordGate from './components/Auth/PasswordGate';
import MapView from './components/Map/MapView';
import FeaturePopup from './components/Map/FeaturePopup';
import CityEditPopup from './components/Map/CityEditPopup';
import LayerPanel from './components/LayerControl/LayerPanel';

const TOOLS = [
  { mode: 'select',  label: '選択',    title: 'クリックで地物を選択' },
  { mode: 'marker',  label: 'マーカー', title: 'クリックでマーカーを配置' },
  { mode: 'line',    label: 'ライン',   title: 'クリックで点を追加、ダブルクリックで確定' },
  { mode: 'polygon', label: 'ポリゴン', title: 'クリックで点を追加、ダブルクリックで確定' },
  { mode: 'delete',  label: '削除',    title: '地物を選択して削除' },
];

function Header() {
  const { currentTurn } = useMapStore();
  const { nickname, signOut, isAdmin } = useAuthStore();

  return (
    <header className="h-10 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4 shrink-0">
      <h1 className="text-white font-bold text-sm">NGP地図</h1>
      <span className="text-gray-400 text-xs">ターン: {currentTurn}</span>
      {isAdmin && (
        <span className="text-yellow-400 text-xs bg-yellow-900/30 px-1.5 py-0.5 rounded">
          管理者
        </span>
      )}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-gray-400 text-xs">{nickname}</span>
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

function Toolbar() {
  const { drawingMode, setDrawingMode } = useMapStore();

  return (
    <footer className="h-12 bg-gray-900 border-t border-gray-700 flex items-center px-4 gap-2 shrink-0">
      {TOOLS.map(({ mode, label, title }) => (
        <button
          key={mode}
          title={title}
          onClick={() => setDrawingMode(mode)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors
            ${drawingMode === mode
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }
            ${mode === 'delete' ? 'ml-2 bg-red-900 hover:bg-red-800 text-red-200' + (drawingMode === 'delete' ? ' bg-red-600' : '') : ''}
          `}
        >
          {label}
        </button>
      ))}
      <div className="ml-4 text-xs text-gray-500">
        {drawingMode === 'select' && '地物をクリックして詳細を表示'}
        {drawingMode === 'marker' && 'クリックでマーカーを配置'}
        {drawingMode === 'line' && 'クリックで点を追加 → ダブルクリックで確定'}
        {drawingMode === 'polygon' && 'クリックで点を追加 → ダブルクリックで確定'}
        {drawingMode === 'delete' && '地物を選択→削除ボタンで削除'}
      </div>
    </footer>
  );
}

export default function App() {
  const { isAuthenticated, initializing, restoreSession } = useAuthStore();

  useEffect(() => { restoreSession(); }, []);

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
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <LayerPanel />
        {/* Map area with relative positioning for absolute overlays */}
        <div className="flex-1 relative">
          <MapView />
          <FeaturePopup />
          <CityEditPopup />
        </div>
        {/* Right panel placeholder (Phase 2: faction management) */}
        <div className="w-56 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-gray-700">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">勢力パネル</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-gray-600 text-center px-3">
              Phase 2で<br />実装予定
            </p>
          </div>
        </div>
      </div>
      <Toolbar />
    </div>
  );
}
