import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { bearerTokenFrom, verifyAdminSessionToken } from "@/lib/security/adminSession";
import { adminDeleteDrop } from "@/lib/uploads/service";

export const runtime = "nodejs";

/**
 * Admin-authorized delete, independent of the per-drop capability token
 * (see DELETE /api/share/[shareId] for the uploader's own version of
 * this). Exists specifically so a never-expiring drop can still be
 * removed even if the browser that created it never saved — or has
 * since lost — its delete token.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  if (!verifyAdminSessionToken(bearerTokenFrom(request))) {
    return apiError("ADMIN_REQUIRED", "Admin session required or expired.");
  }

  const { shareId } = await params;
  const result = await adminDeleteDrop(shareId);
  if (!result.ok) {
    return apiError("NOT_FOUND", "This drop no longer exists.");
  }

  return NextResponse.json({ ok: true });
}
