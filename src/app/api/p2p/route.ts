import { NextResponse } from "next/server";
import { apiError, rateLimitHeaders } from "@/lib/http";
import { getClientIp, uploadRateLimiter } from "@/lib/security/rateLimit";
import { createP2pTransferSchema } from "@/lib/validation/schemas";
import { isBlockedExtension } from "@/lib/validation/file";
import { createP2pTransfer } from "@/lib/p2p/service";
import type { CreateP2pTransferResponse } from "@/types/p2p";

export const runtime = "nodejs";

// Reuses the same per-IP budget as server-storage uploads — creating a
// P2P transfer is the equivalent action, just without any bytes involved.
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = uploadRateLimiter.check(ip);
  if (!rateLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many transfers started from this address. Try again later.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const parsed = createP2pTransferSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  if (isBlockedExtension(parsed.data.fileName)) {
    return apiError("VALIDATION_ERROR", `Files of this type are not allowed: ${parsed.data.fileName}`);
  }

  try {
    const transfer = await createP2pTransfer(parsed.data);
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;

    const response: CreateP2pTransferResponse = {
      shareId: transfer.shareId,
      shareUrl: `${origin}/p2p/${transfer.shareId}`,
      expiresAt: transfer.expiresAt.toISOString(),
      token: transfer.token,
    };

    return NextResponse.json(response, { headers: rateLimitHeaders(rateLimit.resetAt) });
  } catch (err) {
    console.error("[POST /api/p2p] failed to create transfer:", err);
    return apiError("INTERNAL_ERROR", "Could not create this transfer. Please try again.");
  }
}
