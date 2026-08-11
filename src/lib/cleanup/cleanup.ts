import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/storage/s3";

export interface CleanupResult {
  dropsExamined: number;
  filesDeleted: number;
  dropsMarkedDeleted: number;
  errors: number;
  p2pTransfersDeleted: number;
}

const BATCH_SIZE = 100;

/**
 * Delete storage objects and mark rows DELETED for every drop that is past
 * its expiration (or already flagged EXPIRED, e.g. via burn-after-read or
 * a hit download limit) and not yet DELETED.
 *
 * Idempotent and safe under overlapping runs: a drop is only flipped to
 * DELETED after every one of its objects has been deleted; if a delete
 * fails partway through, the drop is left EXPIRED so the next run retries
 * the remaining objects. Two runs racing on the same drop is harmless —
 * S3-compatible DeleteObject succeeds (no-op) on a key that's already
 * gone, so redundant deletes never error or corrupt state.
 */
export async function runCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = {
    dropsExamined: 0,
    filesDeleted: 0,
    dropsMarkedDeleted: 0,
    errors: 0,
    p2pTransfersDeleted: 0,
  };

  // First, lazily expire anything past its deadline that cleanup hasn't
  // touched yet (mirrors the check done on-demand in getActiveDropByShareId,
  // so link visits and this job converge on the same state). This also
  // catches PENDING drops abandoned mid-upload (e.g. the browser tab was
  // closed) once their expiration window elapses, so they don't linger
  // forever.
  await prisma.drop.updateMany({
    where: { status: { in: ["ACTIVE", "PENDING"] }, expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });

  // Cursor-paginate through EXPIRED drops in a single forward pass. This
  // (rather than always re-querying "the next N EXPIRED rows") guarantees
  // the loop terminates in one run even if some drops fail to delete and
  // stay EXPIRED for a retry on the next scheduled run.
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.drop.findMany({
      where: { status: "EXPIRED" },
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: BATCH_SIZE,
      include: { files: true },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const drop of batch) {
      result.dropsExamined += 1;

      let dropHadError = false;
      for (const file of drop.files) {
        try {
          await deleteObject(file.storageKey);
          result.filesDeleted += 1;
        } catch (err) {
          dropHadError = true;
          result.errors += 1;
          console.error(`[cleanup] failed to delete object ${file.storageKey}:`, err);
        }
      }

      if (dropHadError) continue; // leave EXPIRED so the next run retries

      // Only flip to DELETED once every object is confirmed gone. Rows
      // are kept (not hard-deleted) so /f/{shareId} can keep returning a
      // clean "expired" response instead of an ambiguous 404.
      const claimed = await prisma.drop.updateMany({
        where: { id: drop.id, status: "EXPIRED" },
        data: { status: "DELETED" },
      });
      if (claimed.count > 0) result.dropsMarkedDeleted += 1;
    }

    if (batch.length < BATCH_SIZE) break;
  }

  // P2pTransfer rows never have an associated storage object — the file
  // itself is never uploaded anywhere (see prisma/schema.prisma) — so
  // unlike Drop there's nothing to delete before the row itself, and no
  // reason to keep an expired row around (getActiveP2pTransferByShareId
  // already treats anything past expiresAt as gone, same generic
  // "not found" either way). A plain hard delete is enough.
  const deletedTransfers = await prisma.p2pTransfer.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  result.p2pTransfersDeleted = deletedTransfers.count;

  return result;
}
