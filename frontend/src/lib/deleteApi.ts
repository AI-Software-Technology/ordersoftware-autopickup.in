import { apiFetch } from './api.js';
import { getToken } from './session.js';

/**
 * Asks for confirmation, calls DELETE <url>, shows the server's reason if it is refused
 * (e.g. "used in 3 orders"). Returns true only when the record was really deleted.
 */
export async function confirmAndDelete(url: string, confirmText: string): Promise<boolean> {
  if (!window.confirm(confirmText)) return false;
  try {
    const res = await apiFetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
    if (res.ok) return true;
    const j = await res.json().catch(() => ({}));
    alert(j.error || 'Delete failed');
  } catch (err) {
    console.error(err);
    alert('Network error while deleting');
  }
  return false;
}
