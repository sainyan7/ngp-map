import { useState } from 'react';
import useAuthStore from '../../store/useAuthStore';

export default function PasswordGate() {
  const [nickname, setNickname] = useState(localStorage.getItem('ngp_nickname') || '');
  const [password, setPassword] = useState('');
  const { signIn, loading, error } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    await signIn(password, nickname.trim());
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white text-center mb-2">NGP地図</h1>
        <p className="text-gray-400 text-sm text-center mb-6">
          架空国家プロジェクト
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              ニックネーム
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="表示名を入力"
              required
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm
                         border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              グループパスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              required
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm
                         border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-900/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900
                       text-white font-medium rounded-lg py-2 text-sm transition-colors"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
