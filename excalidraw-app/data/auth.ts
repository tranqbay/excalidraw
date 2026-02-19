/**
 * Auth module for Excalidraw dashboard — cookie-based JWT storage.
 * Uses the same Sango/Atlas/Kong auth flow as the backoffice.
 * Cookie names are prefixed with `excalidraw_` to avoid collision.
 */

const AUTH_LOGIN_URL = import.meta.env.VITE_APP_AUTH_LOGIN_URL;
const AUTH_REFRESH_URL = import.meta.env.VITE_APP_AUTH_REFRESH_URL;

const COOKIE_PREFIX = "excalidraw_";
const COOKIE_TOKEN = `${COOKIE_PREFIX}token`;
const COOKIE_REFRESH_TOKEN = `${COOKIE_PREFIX}refreshToken`;
const COOKIE_TOKEN_EXP = `${COOKIE_PREFIX}token_expiration`;
const COOKIE_REFRESH_TOKEN_EXP = `${COOKIE_PREFIX}refreshTokenExpiration`;

export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  userType: string | null;
  email: string | null;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  exp: number;
  refreshTokenExp: number;
  meta: {
    userId: string;
    userType: string;
    email?: string;
    [key: string]: any;
  };
}

// --- Cookie helpers (vanilla, no js-cookie dependency) ---

function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function setCookie(name: string, value: string, expiresDate: Date): void {
  let cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expiresDate.toUTCString()}; SameSite=Strict`;
  if (import.meta.env.PROD) cookie += "; Secure";
  document.cookie = cookie;
}

function removeCookie(name: string): void {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict`;
}

function isExpired(expirationMs: string | number | undefined | null): boolean {
  if (!expirationMs) return true;
  const exp = typeof expirationMs === "string" ? parseInt(expirationMs, 10) : expirationMs;
  return isNaN(exp) || exp < Date.now();
}

function storeTokens(data: LoginResponse): void {
  // exp could be seconds (Unix epoch) or milliseconds — normalize to ms
  const tokenExpMs = data.exp > 1e12 ? data.exp : data.exp * 1000;
  const refreshExpMs = data.refreshTokenExp > 1e12 ? data.refreshTokenExp : data.refreshTokenExp * 1000;
  const refreshExpiry = new Date(refreshExpMs);

  setCookie(COOKIE_TOKEN, data.token, new Date(tokenExpMs));
  setCookie(COOKIE_REFRESH_TOKEN, data.refreshToken, refreshExpiry);
  setCookie(COOKIE_TOKEN_EXP, tokenExpMs.toString(), refreshExpiry);
  setCookie(COOKIE_REFRESH_TOKEN_EXP, refreshExpMs.toString(), refreshExpiry);
}

export function getAuthState(): AuthState {
  const token = getCookie(COOKIE_TOKEN);
  const tokenExp = getCookie(COOKIE_TOKEN_EXP);
  const refreshTokenVal = getCookie(COOKIE_REFRESH_TOKEN);
  const refreshExp = getCookie(COOKIE_REFRESH_TOKEN_EXP);

  const hasValidToken = !!token && !isExpired(tokenExp);
  const hasValidRefresh = !!refreshTokenVal && !isExpired(refreshExp);

  if (!hasValidToken && !hasValidRefresh) {
    return { isAuthenticated: false, userId: null, userType: null, email: null };
  }

  // Decode basic info from JWT payload (not for validation — Kong does that)
  let userId: string | null = null;
  let userType: string | null = null;
  let email: string | null = null;
  try {
    const activeToken = token || refreshTokenVal;
    if (activeToken) {
      const base64 = activeToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64));
      userId = payload.userId || payload.identifier || payload.sub || null;
      userType = payload.userType || payload.meta?.userType || null;
      email = payload.email || null;
    }
  } catch {
    // Token decode failed — still authenticated if cookies exist
  }

  return { isAuthenticated: true, userId, userType, email };
}

export async function login(email: string, password: string): Promise<AuthState> {
  if (!AUTH_LOGIN_URL) {
    throw new Error("Auth login URL not configured");
  }

  const res = await fetch(AUTH_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || body?.error || "Invalid credentials");
  }

  const data: LoginResponse = await res.json();
  storeTokens(data);

  // Extract userId from JWT payload (field is "identifier" in Atlas tokens)
  let userId: string | null = data.meta.userId || null;
  let userType: string | null = data.meta.userType || null;
  if (!userId && data.token) {
    try {
      const base64 = data.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64));
      userId = payload.userId || payload.identifier || payload.sub || null;
      if (!userType) userType = payload.userType || payload.meta?.userType || null;
    } catch {
      // Token decode failed — userId stays null
    }
  }

  return {
    isAuthenticated: true,
    userId,
    userType,
    email: data.meta.email || email,
  };
}

export function logout(): void {
  removeCookie(COOKIE_TOKEN);
  removeCookie(COOKIE_REFRESH_TOKEN);
  removeCookie(COOKIE_TOKEN_EXP);
  removeCookie(COOKIE_REFRESH_TOKEN_EXP);
}

// Single-promise lock to prevent concurrent refresh calls
let refreshingPromise: Promise<string | null> | null = null;

export async function refreshToken(): Promise<string | null> {
  const currentRefreshToken = getCookie(COOKIE_REFRESH_TOKEN);
  const refreshExp = getCookie(COOKIE_REFRESH_TOKEN_EXP);

  if (!currentRefreshToken || isExpired(refreshExp) || !AUTH_REFRESH_URL) {
    logout();
    return null;
  }

  if (!refreshingPromise) {
    refreshingPromise = (async () => {
      try {
        const res = await fetch(AUTH_REFRESH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentRefreshToken}`,
          },
        });

        if (!res.ok) {
          logout();
          return null;
        }

        const data = await res.json();
        const tokenExp = data.exp ?? data.expiresIn;
        if (!data.token || !data.refreshToken || !tokenExp) {
          logout();
          return null;
        }

        storeTokens({
          token: data.token,
          refreshToken: data.refreshToken,
          exp: tokenExp,
          refreshTokenExp: data.refreshTokenExp,
          meta: data.meta || {},
        });

        return data.token as string;
      } catch {
        logout();
        return null;
      } finally {
        refreshingPromise = null;
      }
    })();
  }

  return refreshingPromise;
}

export async function getValidToken(): Promise<string | null> {
  const token = getCookie(COOKIE_TOKEN);
  const tokenExp = getCookie(COOKIE_TOKEN_EXP);

  if (token && !isExpired(tokenExp)) {
    return token;
  }

  // Token expired or missing — try refresh
  return refreshToken();
}
