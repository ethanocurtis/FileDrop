import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildStorageKey, deleteObject } from "@/lib/storage/s3";
import { generateShareId } from "@/lib/security/ids";
import { hashPassword } from "@/lib/security/password";
import { sanitizeFileName } from "@/lib/validation/filename";
import {
  assertDeclaredSizeIsAllowed,
  assertFileCountIsAllowed,
  FileValidationError,
} from "@/lib/validation/file";
import { expiresAtFor, type ExpirationValue } from "@/lib/utils/time";
import type { DropStatus } from "@/generated/prisma";
import type { CreateDropFileInput } from "@/types/drop";

export interface PreparedDropFile {
  fileId: string;
  storageKey: string;
  name: string;
}

export interface PreparedDrop {
  dropId: string;
  shareId: string;
  expiresAt: Date;
  files: PreparedDropFile[];
}

/**
 * Create the drop + file records that describe an upload before any bytes
 * have been received. Files start in PENDING status; each one transitions
 * to ACTIVE independently once its bytes finish streaming into storage
 * (see `markFileUploaded`), and the drop itself becomes ACTIVE once every
 * file in it is.
 */
export async function prepareDrop(input: {
  files: CreateDropFileInput[];
  expiration: ExpirationValue;
  password?: string;
  maxDownloads?: number | null;
  burnAfterRead?: boolean;
}): Promise<PreparedDrop> {
  assertFileCountIsAllowed(input.files.length);
  for (const file of input.files) {
    assertDeclaredSizeIsAllowed(file.size);
    if (!file.name || file.name.trim().length === 0) {
      throw new FileValidationError("Every file needs a name.", "EMPTY_FILE");
    }
  }

  const dropId = randomUUID();
  const shareId = generateShareId();
  const expiresAt = expiresAtFor(input.expiration);
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const preparedFiles: PreparedDropFile[] = input.files.map((file) => {
    const fileId = randomUUID();
    return {
      fileId,
      storageKey: buildStorageKey(dropId, fileId),
      name: sanitizeFileName(file.name),
    };
  });

  await prisma.drop.create({
    data: {
      id: dropId,
      shareId,
      passwordHash,
      maxDownloads: input.maxDownloads ?? null,
      burnAfterRead: input.burnAfterRead ?? false,
      status: "PENDING",
      expiresAt,
      files: {
        create: preparedFiles.map((file, i) => ({
          id: file.fileId,
          originalFileName: input.files[i].name,
          sanitizedFileName: file.name,
          storageKey: file.storageKey,
          mimeType: input.files[i].mimeType || "application/octet-stream",
          size: BigInt(input.files[i].size),
          status: "PENDING",
        })),
      },
    },
  });

  return { dropId, shareId, expiresAt, files: preparedFiles };
}

/**
 * Mark a single file as fully uploaded with its server-verified size and
 * sniffed MIME type, then promote the parent drop to ACTIVE once every
 * file belonging to it has done the same.
 */
export async function markFileUploaded(params: {
  dropId: string;
  fileId: string;
  actualSize: number;
  mimeType: string;
}): Promise<{ dropActive: boolean }> {
  await prisma.uploadFile.update({
    where: { id: params.fileId, dropId: params.dropId },
    data: { size: BigInt(params.actualSize), mimeType: params.mimeType, status: "ACTIVE" },
  });

  const remainingPending = await prisma.uploadFile.count({
    where: { dropId: params.dropId, status: { not: "ACTIVE" } },
  });

  if (remainingPending === 0) {
    await prisma.drop.updateMany({
      where: { id: params.dropId, status: "PENDING" },
      data: { status: "ACTIVE" },
    });
    return { dropActive: true };
  }

  return { dropActive: false };
}

/**
 * Best-effort rollback for a failed or cancelled upload: remove whatever
 * bytes made it to storage and delete the file's row. If the drop has no
 * files left, delete the drop too rather than leaving an empty PENDING
 * drop behind.
 */
export async function abortFileUpload(params: { dropId: string; fileId: string }): Promise<void> {
  const file = await prisma.uploadFile.findUnique({
    where: { id: params.fileId, dropId: params.dropId },
  });
  if (!file) return;

  await deleteObject(file.storageKey).catch(() => {
    // Best-effort: object may not have been created yet.
  });

  await prisma.uploadFile.delete({ where: { id: file.id } }).catch(() => {});

  const remaining = await prisma.uploadFile.count({ where: { dropId: params.dropId } });
  if (remaining === 0) {
    await prisma.drop.delete({ where: { id: params.dropId } }).catch(() => {});
  }
}

export interface DropWithFiles {
  id: string;
  shareId: string;
  status: DropStatus;
  expiresAt: Date;
  createdAt: Date;
  passwordHash: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  burnAfterRead: boolean;
  files: {
    id: string;
    originalFileName: string;
    sanitizedFileName: string;
    mimeType: string;
    size: bigint;
    storageKey: string;
    status: DropStatus;
  }[];
}

/**
 * Fetch a drop by its public share ID. Lazily flips status to EXPIRED if
 * the deadline has passed and the cleanup job hasn't caught it yet, so a
 * stale row never appears available. Returns null for anything that isn't
 * a live, ACTIVE drop with existing files, without distinguishing "never
 * existed" from "deleted" to the caller.
 */
export async function getActiveDropByShareId(shareId: string): Promise<DropWithFiles | null> {
  const drop = await prisma.drop.findUnique({
    where: { shareId },
    include: { files: true },
  });
  if (!drop) return null;

  if (drop.status === "ACTIVE" && drop.expiresAt.getTime() <= Date.now()) {
    await prisma.drop.updateMany({
      where: { id: drop.id, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
    drop.status = "EXPIRED";
  }

  if (drop.status !== "ACTIVE") return null;
  return drop;
}
