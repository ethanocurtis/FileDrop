"use client";

import { useSyncExternalStore } from "react";

/**
 * Client-side half of the admin session — the token itself is opaque
 * and HMAC-verified server-side (see src/lib/security/adminSession.ts);
 * this module just holds onto it in localStorage between page loads and
 * notifies same-tab listeners when it changes. Not a real login system —
 * there's no user, just "does this browser currently hold a token the
 * server will accept."
 */

const STORAGE_KEY = "filedrop:admin-session";
const CHANGE_EVENT = "filedrop:admin-session-changed";

interface AdminSession {
  token: string;
  expiresAt: number;
}

function notifyChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Returns null (and clears storage) once the session has expired,
 * rather than handing back a token the server would reject anyway. */
export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<AdminSession>;
    if (!session.token || !session.expiresAt || Date.now() > session.expiresAt) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session.token;
  } catch {
    return null;
  }
}

export function setAdminSession(session: AdminSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage full or unavailable (private browsing, quota) — the
    // upload will just fall back to requiring login again.
  }
  notifyChange();
}

export function clearAdminSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notifyChange();
}

/** Same-tab reactivity — localStorage's own `storage` event only fires
 * for *other* tabs, not the one that made the change. */
export function subscribeToAdminSession(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/** Reactive read of whether this browser currently holds a valid admin
 * session — re-renders on login/logout and on the session's own
 * expiry (checked at render time via getAdminToken's expiry check). */
export function useAdminSession(): { isAdmin: boolean; token: string | null } {
  const token = useSyncExternalStore(subscribeToAdminSession, getAdminToken, () => null);
  return { isAdmin: token !== null, token };
}
