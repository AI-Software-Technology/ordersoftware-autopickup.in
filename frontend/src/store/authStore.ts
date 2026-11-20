import { create } from 'zustand';
import { User } from '../types.js';
import { apiFetch } from '../lib/api.js';
import { getToken, setToken, clearToken } from '../lib/session.js';

const LOGOUT_KEY = 'petroflow_explicit_logout';

// Optional demo mode: auto sign-in when nobody is logged in.
// Needs ALL of VITE_DEMO_AUTO_LOGIN=true, VITE_DEMO_EMAIL and VITE_DEMO_PASSWORD (see .env.example).
// There are no built-in default credentials any more, so nothing secret ends up in the bundle.
const DEMO_AUTO_LOGIN = import.meta.env.VITE_DEMO_AUTO_LOGIN === 'true';
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD;

// Why the user is currently signed out - lets the router decide whether to send them back to the page they were on
export type SessionEnd = 'logout' | 'expired' | null;

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  // Set when the server could not be reached while restoring the session (token is kept)
  connectionError: string | null;
  sessionEnd: SessionEnd;
  login: (email: string, pass: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
  refreshUser: () => Promise<void>;
  clearSession: () => void;
}

async function requestLogin(email: string, password: string) {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: getToken(),
  isLoading: true,
  connectionError: null,
  sessionEnd: null,

  // Restores the session from the stored token ( called on app start and from the "Retry" button )
  refreshUser: async () => {
    const storedToken = getToken();
    set({ connectionError: null });

    if (!storedToken) {
      if (DEMO_AUTO_LOGIN && DEMO_EMAIL && DEMO_PASSWORD && !localStorage.getItem(LOGOUT_KEY)) {
        try {
          const { ok, data } = await requestLogin(DEMO_EMAIL, DEMO_PASSWORD);
          if (ok) {
            setToken(data.token, true);
            set({ token: data.token, user: data.user, isLoading: false });
            return;
          }
        } catch {
          // ignore network failure
        }
      }
      set({ user: null, isLoading: false });
      return;
    }

    try {
      const res = await apiFetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        set({ user: data.user, token: storedToken, sessionEnd: null });
      } else if (res.status === 401 || res.status === 403) {
        // Token is genuinely invalid / expired
        clearToken();
        set({ user: null, token: null, sessionEnd: 'expired' });
      } else {
        // Server problem (5xx etc.) - keep the token so a retry can work
        set({ user: get().user, connectionError: get().user ? null : 'The server returned an error. Try again in a moment.' });
      }
    } catch (err) {
      console.error('Failed to verify token:', err);
      set({ user: get().user, connectionError: get().user ? null : 'Cannot reach the server. Check your connection and try again.' });
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (email, pass, remember = true) => {
    localStorage.removeItem(LOGOUT_KEY);
    let result;
    try {
      result = await requestLogin(email, pass);
    } catch {
      throw new Error('Cannot reach the server. Check your connection and try again.');
    }
    if (!result.ok) {
      throw new Error(result.data.error || 'Email or password is incorrect.');
    }
    setToken(result.data.token, remember);
    set({ token: result.data.token, user: result.data.user, connectionError: null, sessionEnd: null });
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    clearToken();
    localStorage.setItem(LOGOUT_KEY, 'true');
    set({ token: null, user: null, sessionEnd: 'logout' });
  },

  // Session expired / token rejected by the server
  clearSession: () => {
    if (!get().token && !get().user) return;
    clearToken();
    set({ token: null, user: null, sessionEnd: 'expired' });
  },

  hasPermission: (code) => {
    const user = get().user;
    if (!user) return false;
    if (user.role_slug === 'super_admin') return true;
    const perms = user.permissions || [];
    const colonCode = code.replace(/\./g, ':');
    const dotCode = code.replace(/:/g, '.');
    return perms.includes(code) || perms.includes(colonCode) || perms.includes(dotCode);
  }
}));

// Same hook the components always used ( previously a React context )
export const useAuth = () => useAuthStore();
