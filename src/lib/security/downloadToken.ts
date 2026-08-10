import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Short-lived, single-drop-scoped authorization proof issued after a
 * correct password check on a protected drop. The download endpoint is a
 * plain GET (so the browser can navigate/save the file directly), so we
 * can't require the password on every request — this HMAC token stands in
 * for it without needing server-side session storage.
 */
export function issueDownloadToken(shareId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${shareId}.${expiresAt}`;
  const signature = sign(payload);
  return { token: `${expiresAt}.${signature}`, expiresAt };
}

export function verifyDownloadToken(shareId: string, token: string | null): boolean {
  if (!token) return false;
  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expectedSignature = sign(`${shareId}.${expiresAt}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sign(payload: string): string {
  return createHmac("sha256", env.DOWNLOAD_TOKEN_SECRET).update(payload).digest("hex");
}
