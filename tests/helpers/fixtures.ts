import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateShareId } from "@/lib/security/ids";
import type { DropStatus } from "@/generated/prisma";

/**
 * Insert a Drop + one UploadFile directly via Prisma, bypassing the real
 * upload pipeline (which needs object storage). Good enough for exercising
 * DB-level logic like expiration, download limits, and cleanup.
 */
export async function createTestDrop(overrides: {
  status?: DropStatus;
  expiresAt?: Date;
  passwordHash?: string | null;
  maxDownloads?: number | null;
  downloadCount?: number;
  burnAfterRead?: boolean;
  fileStatus?: DropStatus;
} = {}) {
  const dropId = randomUUID();
  const fileId = randomUUID();
  const shareId = generateShareId();

  const drop = await prisma.drop.create({
    data: {
      id: dropId,
      shareId,
      status: overrides.status ?? "ACTIVE",
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      passwordHash: overrides.passwordHash ?? null,
      maxDownloads: overrides.maxDownloads ?? null,
      downloadCount: overrides.downloadCount ?? 0,
      burnAfterRead: overrides.burnAfterRead ?? false,
      files: {
        create: {
          id: fileId,
          originalFileName: "fixture.txt",
          sanitizedFileName: "fixture.txt",
          storageKey: `drops/${dropId}/${fileId}`,
          mimeType: "text/plain",
          size: BigInt(42),
          status: overrides.fileStatus ?? "ACTIVE",
        },
      },
    },
    include: { files: true },
  });

  return { drop, shareId, dropId, fileId };
}
