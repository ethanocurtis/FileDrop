import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { bearerTokenFrom, verifyAdminSessionToken } from "@/lib/security/adminSession";
import { listDropsForAdmin } from "@/lib/uploads/service";
import type { AdminDropsResponse } from "@/types/drop";

export const runtime = "nodejs";

/**
 * Lists every non-deleted drop, independent of whatever browser created
 * it — see "Admin uploads" in the README for why this exists: a
 * never-expiring drop has no other lifecycle event that would ever
 * surface it again, so this is the only durable way to find and remove
 * one later.
 */
export async function GET(request: Request) {
  if (!verifyAdminSessionToken(bearerTokenFrom(request))) {
    return apiError("ADMIN_REQUIRED", "Admin session required or expired.");
  }

  const drops = await listDropsForAdmin();
  const response: AdminDropsResponse = {
    drops: drops.map((drop) => ({
      shareId: drop.shareId,
      // Query already excludes DELETED — see listDropsForAdmin.
      status: drop.status as "PENDING" | "ACTIVE" | "EXPIRED",
      createdAt: drop.createdAt.toISOString(),
      expiresAt: drop.expiresAt.toISOString(),
      requiresPassword: drop.requiresPassword,
      burnAfterRead: drop.burnAfterRead,
      maxDownloads: drop.maxDownloads,
      downloadCount: drop.downloadCount,
      files: drop.files.map((f) => ({ name: f.name, size: f.size.toString() })),
    })),
  };

  return NextResponse.json(response);
}
