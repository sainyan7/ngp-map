import { create } from 'zustand';
import { signInWithPassword, signOut as firebaseSignOut, restoreSession as firebaseRestoreSession } from '../firebase/auth';

const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  nickname: localStorage.getItem('ngp_nickname') || '',
  error: null,
  loading: false,
  initializing: true,   // true until restoreSession() completes

  signIn: async (password, nickname) => {
    set({ loading: true, error: null });
    try {
      const { isAdmin } = await signInWithPassword(password, nickname);
      const { auth } = await import('../firebase/config');
      localStorage.setItem('ngp_nickname', nickname);
      set({
        user: auth.currentUser,
        isAuthenticated: true,
        isAdmin,
        nickname,
        loading: false,
        error: null,
      });
    } catch (err) {
      set({ loading: false, error: err.message });
    }
  },

  signOut: async () => {
    const { user } = get();
    await firebaseSignOut(user?.uid);
    localStorage.removeItem('ngp_nickname');
    set({
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      nickname: '',
      error: null,
    });
  },

  restoreSession: async () => {
    const session = await firebaseRestoreSession();
    if (session) {
      localStorage.setItem('ngp_nickname', session.nickname);
      set({
        user: session.user,
        isAuthenticated: true,
        isAdmin: session.isAdmin,
        nickname: session.nickname,
        initializing: false,
      });
    } else {
      set({ initializing: false });
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
