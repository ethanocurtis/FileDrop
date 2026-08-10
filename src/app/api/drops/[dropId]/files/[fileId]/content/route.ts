import { apiError } from "@/lib/http";
import { getClientIp, uploadRateLimiter } from "@/lib/security/rateLimit";
import { prisma } from "@/lib/prisma";
import { putObjectStream } from "@/lib/storage/s3";
import { detectMimeType, assertDeclaredSizeIsAllowed } from "@/lib/validation/file";
import { scanFile } from "@/lib/security/scan";
import { createGuardedUploadStream } from "@/lib/uploads/stream";
import { markFileUploaded, abortFileUpload } from "@/lib/uploads/service";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ dropId: string; fileId: string }> },
) {
  const { dropId, fileId } = await params;

  const ip = getClientIp(request);
  if (!uploadRateLimiter.check(ip).allowed) {
    return apiError("RATE_LIMITED", "Too many uploads from this address. Try again later.");
  }

  const file = await prisma.uploadFile.findUnique({
    where: { id: fileId, dropId },
    include: { drop: true },
  });

  if (!file || file.dropId !== dropId) {
    return apiError("NOT_FOUND", "Upload session not found.");
  }
  if (file.status !== "PENDING" || file.drop.status !== "PENDING") {
    return apiError("VALIDATION_ERROR", "This upload has already been completed or cancelled.");
  }
  if (file.drop.expiresAt.getTime() <= Date.now()) {
    return apiError("EXPIRED", "This upload session has expired.");
  }
  if (!request.body) {
    return apiError("VALIDATION_ERROR", "Request body is required.");
  }

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength)) {
    try {
      assertDeclaredSizeIsAllowed(declaredLength);
    } catch {
      return apiError(
        "VALIDATION_ERROR",
        `File exceeds the maximum upload size of ${env.MAX_UPLOAD_SIZE_BYTES} bytes.`,
      );
    }
  }

  const guarded = createGuardedUploadStream(request.body, {
    maxBytes: env.MAX_UPLOAD_SIZE_BYTES,
  });

  try {
    await putObjectStream({
      key: file.storageKey,
      body: guarded.stream,
      contentType: "application/octet-stream",
      signal: request.signal,
    });
  } catch (err) {
    await abortFileUpload({ dropId, fileId });

    if (guarded.sizeExceeded()) {
      return apiError(
        "VALIDATION_ERROR",
        `File exceeds the maximum upload size of ${env.MAX_UPLOAD_SIZE_BYTES} bytes.`,
      );
    }
    if (request.signal.aborted) {
      // Client cancelled the upload; nothing to send back, but the row and
      // partial object have already been cleaned up above.
      return apiError("VALIDATION_ERROR", "Upload was cancelled.");
    }
    console.error(`[PUT content] upload failed for file ${fileId}:`, err);
    return apiError("STORAGE_ERROR", "Upload failed. Please try again.");
  }

  if (guarded.totalBytes() === 0) {
    await abortFileUpload({ dropId, fileId });
    return apiError("VALIDATION_ERROR", "File is empty.");
  }

  const mimeType = await detectMimeType(guarded.sniffSample());
  const scanResult = await scanFile({
    sample: guarded.sniffSample(),
    fileName: file.sanitizedFileName,
    mimeType,
  });

  if (!scanResult.clean) {
    await abortFileUpload({ dropId, fileId });
    return apiError("VALIDATION_ERROR", "This file was rejected by security scanning.");
  }

  const { dropActive } = await markFileUploaded({
    dropId,
    fileId,
    actualSize: guarded.totalBytes(),
    mimeType,
  });

  return Response.json({ fileId, size: guarded.totalBytes(), mimeType, dropActive });
}

/** Explicit cancel, used when the client aborts before or between chunks
 * rather than mid-stream (where the PUT handler's own catch block already
 * handles cleanup). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ dropId: string; fileId: string }> },
) {
  const { dropId, fileId } = await params;
  await abortFileUpload({ dropId, fileId });
  return new Response(null, { status: 204 });
}
