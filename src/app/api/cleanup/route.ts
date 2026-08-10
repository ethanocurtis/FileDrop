import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { env } from "@/lib/env";
import { runCleanup } from "@/lib/cleanup/cleanup";

export const runtime = "nodejs";

/**
 * Triggers the expiry sweep (delete storage objects + mark rows DELETED
 * for anything past its expiration). Intended to be called by an external
 * scheduler (cron, a platform's scheduled functions, etc.) — see README
 * "Cleanup job" for setup examples. Protected by a bearer token so the
 * sweep can't be triggered by anyone who finds the URL.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CLEANUP_SECRET}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  const authorized = a.length === b.length && timingSafeEqual(a, b);

  if (!authorized) {
    return apiError("NOT_FOUND", "Not found.");
  }

  try {
    const result = await runCleanup();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[POST /api/cleanup] cleanup run failed:", err);
    return apiError("INTERNAL_ERROR", "Cleanup run failed.");
  }
}
