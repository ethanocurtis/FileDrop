import { NextResponse } from "next/server";
import { apiError, rateLimitHeaders } from "@/lib/http";
import { getClientIp, uploadRateLimiter } from "@/lib/security/rateLimit";
import { createDropSchema } from "@/lib/validation/schemas";
import { isBlockedExtension, FileValidationError } from "@/lib/validation/file";
import { prepareDrop } from "@/lib/uploads/service";
import type { CreateDropResponse } from "@/types/drop";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = uploadRateLimiter.check(ip);
  if (!rateLimit.allowed) {
    return apiError("RATE_LIMITED", "Too many uploads from this address. Try again later.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const parsed = createDropSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  for (const file of parsed.data.files) {
    if (isBlockedExtension(file.name)) {
      return apiError("VALIDATION_ERROR", `Files of this type are not allowed: ${file.name}`);
    }
  }

  try {
    const drop = await prepareDrop(parsed.data);
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;

    const response: CreateDropResponse = {
      shareId: drop.shareId,
      dropId: drop.dropId,
      deleteToken: drop.deleteToken,
      expiresAt: drop.expiresAt.toISOString(),
      expirationClamped: drop.expirationClamped,
      shareUrl: `${origin}/f/${drop.shareId}`,
      files: drop.files.map((f) => ({
        fileId: f.fileId,
        name: f.name,
        uploadUrl: `/api/drops/${drop.dropId}/files/${f.fileId}/content`,
      })),
    };

    return NextResponse.json(response, { headers: rateLimitHeaders(rateLimit.resetAt) });
  } catch (err) {
    if (err instanceof FileValidationError) {
      return apiError("VALIDATION_ERROR", err.message);
    }
    console.error("[POST /api/drops] failed to create drop:", err);
    return apiError("INTERNAL_ERROR", "Could not create this drop. Please try again.");
  }
}
