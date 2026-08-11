import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getClientIp, passwordAttemptRateLimiter } from "@/lib/security/rateLimit";
import { unlockP2pTransferSchema } from "@/lib/validation/schemas";
import { getActiveP2pTransferByShareId, toMetadataResponse, unlockP2pTransfer } from "@/lib/p2p/service";
import type { UnlockP2pTransferResponse } from "@/types/p2p";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const ip = getClientIp(request);

  // Keyed by IP+shareId so guessing attempts against one transfer can't
  // burn through the budget for unrelated transfers from the same address.
  if (!passwordAttemptRateLimiter.check(`${ip}:${shareId}`).allowed) {
    return apiError("RATE_LIMITED", "Too many attempts. Try again later.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const parsed = unlockP2pTransferSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "A password is required.");
  }

  const result = await unlockP2pTransfer(shareId, parsed.data.password);
  if (!result.ok) {
    return result.reason === "not_found"
      ? apiError("NOT_FOUND", "This transfer is no longer available.")
      : apiError("INVALID_PASSWORD", "Incorrect password.");
  }

  const transfer = await getActiveP2pTransferByShareId(shareId);
  if (!transfer) {
    return apiError("NOT_FOUND", "This transfer is no longer available.");
  }

  const response: UnlockP2pTransferResponse = {
    ...toMetadataResponse(transfer, true),
    token: result.token,
  };

  return NextResponse.json(response);
}
