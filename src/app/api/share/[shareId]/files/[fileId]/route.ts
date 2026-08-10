import { apiError } from "@/lib/http";
import { getClientIp, downloadRateLimiter } from "@/lib/security/rateLimit";
import { claimDownload, isDownloadAuthorized } from "@/lib/uploads/download";
import { getObjectStream } from "@/lib/storage/s3";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string; fileId: string }> },
) {
  const { shareId, fileId } = await params;

  const ip = getClientIp(request);
  if (!downloadRateLimiter.check(ip).allowed) {
    return apiError("RATE_LIMITED", "Too many downloads from this address. Try again later.");
  }

  const drop = await prisma.drop.findUnique({
    where: { shareId },
    select: { passwordHash: true, status: true },
  });

  if (drop?.passwordHash && drop.status === "ACTIVE") {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? request.headers.get("x-download-token");
    if (!isDownloadAuthorized(shareId, token)) {
      return apiError("PASSWORD_REQUIRED", "A password is required to download this file.");
    }
  }

  const claim = await claimDownload({ shareId, fileId });
  if (!claim.ok) {
    switch (claim.reason) {
      case "limit_reached":
        return apiError("DOWNLOAD_LIMIT_REACHED", "This drop has reached its download limit.");
      case "expired":
        return apiError("EXPIRED", "This drop is no longer available.");
      default:
        return apiError("NOT_FOUND", "This drop is no longer available.");
    }
  }

  try {
    const object = await getObjectStream(claim.file.storageKey);
    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": claim.file.mimeType || "application/octet-stream",
        "Content-Length": (object.contentLength ?? Number(claim.file.size)).toString(),
        "Content-Disposition": buildContentDisposition(claim.file.fileName),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(`[GET download] failed to stream object for file ${fileId}:`, err);
    return apiError("STORAGE_ERROR", "This file could not be downloaded right now.");
  }
}

/** RFC 5987-safe Content-Disposition: an ASCII fallback plus a UTF-8
 * `filename*` for browsers/filenames that need it, so the file always
 * downloads under a sane, non-executing name. */
function buildContentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encoded = encodeURIComponent(fileName);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
