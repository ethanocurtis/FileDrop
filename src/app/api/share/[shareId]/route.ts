import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getClientIp, metadataRateLimiter } from "@/lib/security/rateLimit";
import { getActiveDropByShareId } from "@/lib/uploads/service";
import type { DropMetadataResponse } from "@/types/drop";

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
  const drop = await getActiveDropByShareId(shareId);

  if (!drop) {
    // Same generic response whether the drop never existed, already
    // expired, or was deleted — no information about the file leaks.
    return apiError("NOT_FOUND", "This drop is no longer available.");
  }

  const requiresPassword = Boolean(drop.passwordHash);

  const body: DropMetadataResponse = {
    shareId: drop.shareId,
    requiresPassword,
    expiresAt: drop.expiresAt.toISOString(),
    burnAfterRead: drop.burnAfterRead,
    maxDownloads: drop.maxDownloads,
    downloadCount: drop.downloadCount,
    files: requiresPassword
      ? null
      : drop.files
          .filter((f) => f.status === "ACTIVE")
          .map((f) => ({
            fileId: f.id,
            name: f.sanitizedFileName,
            size: f.size.toString(),
            mimeType: f.mimeType,
          })),
  };

  return NextResponse.json(body);
}
