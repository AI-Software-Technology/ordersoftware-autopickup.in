import { useAuthStore } from '../store/authStore.js';
import { getToken } from './session.js';

// Backend base URL. Example: VITE_API_URL=https://api.yourdomain.com
// When empty, requests go to the same origin ( Vite dev server proxies /api to the backend ).
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const apiUrl = (path: string): string =>
  /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * Drop-in replacement for fetch() that talks to the separate backend server.
 * - prefixes the backend URL
 * - attaches the JWT when the caller did not pass an Authorization header
 * - signs the user out when the session is no longer valid ( 401 )
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const token = useAuthStore.getState().token || getToken();
  const auth = headers.get('Authorization');
  if (token && (!auth || /^Bearer (null|undefined)?$/i.test(auth.trim()))) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(apiUrl(input), { ...init, headers });

  if (res.status === 401 && !input.includes('/api/auth/')) {
    useAuthStore.getState().clearSession();
  }
  return res;
}
