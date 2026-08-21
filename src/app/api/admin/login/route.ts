import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { env } from "@/lib/env";
import { getClientIp, adminLoginRateLimiter } from "@/lib/security/rateLimit";
import { adminLoginSchema } from "@/lib/validation/schemas";
import { issueAdminSessionToken } from "@/lib/security/adminSession";
import type { AdminLoginResponse } from "@/types/drop";

export const runtime = "nodejs";

/**
 * The whole of "admin auth" for this app: one shared password (not a
 * real account — see src/lib/security/adminSession.ts), checked here,
 * that unlocks uploading with no expiration at all. Constant-time
 * compare, tightly rate-limited (a single global password is a much
 * higher-value guessing target than a per-drop one).
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  if (!adminLoginRateLimiter.check(ip).allowed) {
    return apiError("RATE_LIMITED", "Too many attempts. Try again later.");
  }

  if (!env.ADMIN_PASSWORD) {
    return apiError("ADMIN_REQUIRED", "Admin login is not configured on this deployment.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "A password is required.");
  }

  const provided = Buffer.from(parsed.data.password);
  const expected = Buffer.from(env.ADMIN_PASSWORD);
  const valid = provided.length === expected.length && timingSafeEqual(provided, expected);
  if (!valid) {
    return apiError("INVALID_PASSWORD", "Incorrect password.");
  }

  const { token, expiresAt } = issueAdminSessionToken();
  const response: AdminLoginResponse = { token, expiresAt };
  return NextResponse.json(response);
}
