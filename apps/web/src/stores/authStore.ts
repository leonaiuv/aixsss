import { create } from 'zustand';
import { apiLogin, apiMe, apiRegister, type AuthMeResponse } from '@/lib/api/auth';
import { setApiAccessToken } from '@/lib/api/http';

const TOKEN_KEY = 'aixs_access_token';

type AuthState = {
  accessToken: string | null;
  user: AuthMeResponse | null;
  isLoading: boolean;
  error: string | null;

  loadFromStorage: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, teamName?: string) => Promise<void>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  isLoading: false,
  error: null,

  loadFromStorage: async () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    set({ accessToken: token, error: null });
    setApiAccessToken(token);

    if (!token) {
      set({ user: null });
      return;
    }

    try {
      const me = await apiMe();
      set({ user: me });
    } catch (e) {
      console.warn('[auth] token invalid, clearing', e);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
      setApiAccessToken(null);
      set({ accessToken: null, user: null });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { accessToken } = await apiLogin({ email, password });
      if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, accessToken);
      setApiAccessToken(accessToken);
      const me = await apiMe();
      set({ accessToken, user: me, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  register: async (email: string, password: string, teamName?: string) => {
    set({ isLoading: true, error: null });
    try {
      const { accessToken } = await apiRegister({ email, password, teamName });
      if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, accessToken);
      setApiAccessToken(accessToken);
      const me = await apiMe();
      set({ accessToken, user: me, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: () => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
    setApiAccessToken(null);
    set({ accessToken: null, user: null, error: null, isLoading: false });
  },
}));
