import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getClientIp, metadataRateLimiter, passwordAttemptRateLimiter } from "@/lib/security/rateLimit";
import { deleteDropByToken, getActiveDropByShareId } from "@/lib/uploads/service";
import { deleteDropSchema } from "@/lib/validation/schemas";
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

/**
 * Lets the uploader delete their own drop early using the capability
 * token they were shown once at creation time — see
 * deleteDropByToken/Drop.deleteToken. Rate-limited the same as password
 * attempts (keyed by IP+shareId) even though the token has ~190 bits of
 * entropy — cheap defense in depth against a guessing script.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await params;
  const ip = getClientIp(request);

  if (!passwordAttemptRateLimiter.check(`${ip}:${shareId}`).allowed) {
    return apiError("RATE_LIMITED", "Too many attempts. Try again later.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const parsed = deleteDropSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "A delete token is required.");
  }

  const result = await deleteDropByToken(shareId, parsed.data.deleteToken);
  if (!result.ok) {
    // Same generic response for "wrong token" and "doesn't exist" —
    // no reason to let a caller distinguish the two.
    return apiError("NOT_FOUND", "This drop is no longer available.");
  }

  return NextResponse.json({ ok: true });
}
