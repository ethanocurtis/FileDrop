import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getClientIp, metadataRateLimiter } from "@/lib/security/rateLimit";
import {
  getActiveP2pTransferByShareId,
  isP2pAuthorized,
  toMetadataResponse,
} from "@/lib/p2p/service";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const ip = getClientIp(request);
  if (!metadataRateLimiter.check(ip).allowed) {
    return apiError("RATE_LIMITED", "Too many requests. Try again shortly.");
  }

  const { shareId } = await params;
  const transfer = await getActiveP2pTransferByShareId(shareId);

  if (!transfer) {
    // Same generic response whether the transfer never existed, already
    // expired, or completed — no information leaks either way.
    return apiError("NOT_FOUND", "This transfer is no longer available.");
  }

  const token = new URL(request.url).searchParams.get("token");
  const authorized = !transfer.passwordHash || isP2pAuthorized(shareId, token);

  return NextResponse.json(toMetadataResponse(transfer, authorized));
}
