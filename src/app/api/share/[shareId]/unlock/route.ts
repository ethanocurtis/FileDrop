import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getClientIp, passwordAttemptRateLimiter } from "@/lib/security/rateLimit";
import { unlockDropSchema } from "@/lib/validation/schemas";
import { unlockDrop } from "@/lib/uploads/download";
import { getActiveDropByShareId } from "@/lib/uploads/service";
import type { DropMetadataResponse } from "@/types/drop";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const ip = getClientIp(request);

  // Keyed by IP+shareId so guessing attempts against one drop can't burn
  // through the budget for unrelated drops from the same address.
  if (!passwordAttemptRateLimiter.check(`${ip}:${shareId}`).allowed) {
    return apiError("RATE_LIMITED", "Too many attempts. Try again later.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const parsed = unlockDropSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "A password is required.");
  }

  const result = await unlockDrop(shareId, parsed.data.password);
  if (!result.ok) {
    return result.reason === "not_found"
      ? apiError("NOT_FOUND", "This drop is no longer available.")
      : apiError("INVALID_PASSWORD", "Incorrect password.");
  }

  const drop = await getActiveDropByShareId(shareId);
  if (!drop) {
    return apiError("NOT_FOUND", "This drop is no longer available.");
  }

  const metadata: DropMetadataResponse = {
    shareId: drop.shareId,
    requiresPassword: true,
    expiresAt: drop.expiresAt.toISOString(),
    burnAfterRead: drop.burnAfterRead,
    maxDownloads: drop.maxDownloads,
    downloadCount: drop.downloadCount,
    files: drop.files
      .filter((f) => f.status === "ACTIVE")
      .map((f) => ({
        fileId: f.id,
        name: f.sanitizedFileName,
        size: f.size.toString(),
        mimeType: f.mimeType,
      })),
  };

  return NextResponse.json({ ...metadata, token: result.token });
}
