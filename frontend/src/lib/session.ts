// Single place that knows where the login token lives.
//  - "Remember me" ON  -> localStorage   (survives closing the browser)
//  - "Remember me" OFF -> sessionStorage (cleared when the tab/browser closes)
// Every file must read the token through getToken(), never localStorage directly.

export const TOKEN_KEY = 'petroflow_token';

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string, remember: boolean): void {
  try {
    clearToken();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked (private mode etc.) - the user just has to sign in again next time
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function isTokenPersistent(): boolean {
  try {
    return localStorage.getItem(TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}
