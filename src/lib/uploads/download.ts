import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/security/password";
import { issueDownloadToken, verifyDownloadToken } from "@/lib/security/downloadToken";

export type UnlockResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_found" | "wrong_password" };

/**
 * Verify a drop's password and, on success, issue a short-lived download
 * token. Uses a generic "not found" style failure for a missing/expired
 * drop so this endpoint can't be used to probe which share IDs exist.
 */
export async function unlockDrop(shareId: string, password: string): Promise<UnlockResult> {
  const drop = await prisma.drop.findUnique({
    where: { shareId },
    select: { status: true, expiresAt: true, passwordHash: true },
  });

  if (!drop || drop.status !== "ACTIVE" || drop.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "not_found" };
  }
  if (!drop.passwordHash) {
    // Not password protected — treat as success so callers have one path.
    return { ok: true, token: issueDownloadToken(shareId).token };
  }

  const valid = await verifyPassword(password, drop.passwordHash);
  if (!valid) return { ok: false, reason: "wrong_password" };

  return { ok: true, token: issueDownloadToken(shareId).token };
}

export function isDownloadAuthorized(shareId: string, token: string | null): boolean {
  return verifyDownloadToken(shareId, token);
}

export type ClaimDownloadResult =
  | {
      ok: true;
      file: { storageKey: string; mimeType: string; fileName: string; size: bigint };
    }
  | { ok: false; reason: "not_found" | "expired" | "limit_reached" };

/**
 * Atomically validate and record a download attempt in a single UPDATE
 * statement, so concurrent requests against the same drop can't both
 * squeeze through a download-limit or burn-after-read check (a classic
 * TOCTOU race with a plain read-then-write).
 *
 * The UPDATE only touches rows that are still ACTIVE, not expired, and
 * (when a limit is set) still under it — Postgres's row-level locking
 * ensures exactly one caller can win when two requests race for the last
 * allowed download. Status flips to EXPIRED in the same statement when the
 * limit is reached or burnAfterRead is set, so a follow-up request never
 * sees a stale ACTIVE row.
 */
export async function claimDownload(params: {
  shareId: string;
  fileId: string;
}): Promise<ClaimDownloadResult> {
  // The EXISTS clause is part of the UPDATE's WHERE, not a separate check,
  // so an invalid/foreign fileId can never cause the drop's counter to be
  // incremented or its status to flip — the whole statement is a no-op for
  // rows that don't match, atomically.
  const rows = await prisma.$queryRaw<
    { storageKey: string; mimeType: string; originalFileName: string; size: bigint }[]
  >(Prisma.sql`
    WITH claimed AS (
      UPDATE "Drop"
      SET
        "downloadCount" = "downloadCount" + 1,
        "status" = CASE
          WHEN "burnAfterRead" = true THEN 'EXPIRED'::"DropStatus"
          WHEN "maxDownloads" IS NOT NULL AND "downloadCount" + 1 >= "maxDownloads" THEN 'EXPIRED'::"DropStatus"
          ELSE "status"
        END
      WHERE "shareId" = ${params.shareId}
        AND "status" = 'ACTIVE'
        AND "expiresAt" > now()
        AND ("maxDownloads" IS NULL OR "downloadCount" < "maxDownloads")
        AND EXISTS (
          SELECT 1 FROM "UploadFile" f
          WHERE f."dropId" = "Drop"."id" AND f."id" = ${params.fileId} AND f."status" = 'ACTIVE'
        )
      RETURNING "id"
    )
    SELECT f."storageKey", f."mimeType", f."originalFileName", f."size"
    FROM claimed c
    JOIN "UploadFile" f ON f."dropId" = c."id"
    WHERE f."id" = ${params.fileId}
  `);

  if (rows.length === 0) {
    // Distinguish "doesn't exist / never will" from "exists but rejected"
    // only enough to render a friendly message — never leak more detail.
    const drop = await prisma.drop.findUnique({
      where: { shareId: params.shareId },
      select: {
        status: true,
        expiresAt: true,
        maxDownloads: true,
        downloadCount: true,
        files: { where: { id: params.fileId, status: "ACTIVE" }, select: { id: true } },
      },
    });
    if (!drop) return { ok: false, reason: "not_found" };
    if (drop.status === "PENDING") return { ok: false, reason: "not_found" };
    if (drop.files.length === 0) return { ok: false, reason: "not_found" };
    if (
      drop.maxDownloads !== null &&
      drop.downloadCount >= drop.maxDownloads &&
      drop.expiresAt.getTime() > Date.now()
    ) {
      return { ok: false, reason: "limit_reached" };
    }
    return { ok: false, reason: "expired" };
  }

  const row = rows[0];
  return {
    ok: true,
    file: {
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      fileName: row.originalFileName,
      size: row.size,
    },
  };
}
