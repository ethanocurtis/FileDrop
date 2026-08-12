"use client";

/**
 * A small "recent uploads" history, kept entirely in this browser's
 * localStorage — no accounts, nothing sent to or known by the server
 * beyond what it already tracks for the drop itself. This exists mainly
 * so the delete-token shown once at creation time isn't lost the moment
 * you navigate away from the success screen — without it, "Delete Now"
 * only works in the ten seconds right after uploading.
 */

const STORAGE_KEY = "filedrop:recent-uploads";
const CHANGE_EVENT = "filedrop:recent-uploads-changed";
const MAX_ENTRIES = 10;

export interface RecentUpload {
  shareId: string;
  shareUrl: string;
  deleteToken: string;
  fileNames: string[];
  createdAt: string;
  expiresAt: string;
}

function readAll(): RecentUpload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentUpload[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: RecentUpload[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable (private browsing, quota) — this is a
    // pure convenience feature, not worth surfacing an error over.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/**
 * Drops entries that have already expired before returning the list —
 * a dead link's delete token is useless anyway, and this keeps the list
 * from growing forever in a long-lived browser profile without needing
 * a separate cleanup pass.
 */
export function getRecentUploads(): RecentUpload[] {
  const all = readAll();
  const now = Date.now();
  const live = all.filter((entry) => new Date(entry.expiresAt).getTime() > now);
  if (live.length !== all.length) writeAll(live);
  return live.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addRecentUpload(entry: RecentUpload): void {
  const rest = readAll().filter((e) => e.shareId !== entry.shareId);
  writeAll([entry, ...rest].slice(0, MAX_ENTRIES));
}

export function removeRecentUpload(shareId: string): void {
  writeAll(readAll().filter((e) => e.shareId !== shareId));
}

/** Notified on every add/remove/prune, including ones triggered from a
 * different component in the same tab — localStorage's own `storage`
 * event only fires for *other* tabs, not the one that made the change. */
export function subscribeToRecentUploads(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}
