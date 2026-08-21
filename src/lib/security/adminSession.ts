import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Stateless admin session, proven by a single shared password (see
 * ADMIN_PASSWORD in env.ts) rather than a real account — there's no
 * admin user row anywhere, just an HMAC-signed token issued after a
 * correct password check, the same "no server-side session storage"
 * shape as downloadToken.ts. Reuses DOWNLOAD_TOKEN_SECRET as the signing
 * key rather than adding a dedicated secret: it's already an
 * internal-only HMAC key, and the "admin." prefix keeps this token
 * namespace from ever being confused with a download token's signature.
 */
export function issueAdminSessionToken(): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = sign(expiresAt);
  return { token: `${expiresAt}.${signature}`, expiresAt };
}

export function verifyAdminSessionToken(token: string | null): boolean {
  if (!token) return false;
  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = sign(expiresAt);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Bearer-token header parsing shared by every route that accepts one. */
export function bearerTokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

function sign(expiresAt: number): string {
  return createHmac("sha256", env.DOWNLOAD_TOKEN_SECRET).update(`admin.${expiresAt}`).digest("hex");
}
