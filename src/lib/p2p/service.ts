import { prisma } from "@/lib/prisma";
import { generateShareId } from "@/lib/security/ids";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import { issueDownloadToken, verifyDownloadToken } from "@/lib/security/downloadToken";
import { sanitizeFileName } from "@/lib/validation/filename";
import { expiresAtFor, type ExpirationValue } from "@/lib/utils/time";
import { isSenderOnline } from "@/lib/p2p/signalingServer";
import type { P2pTransfer } from "@/generated/prisma";
import type { P2pTransferMetadataResponse } from "@/types/p2p";

export interface CreateP2pTransferInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiration: ExpirationValue;
  password?: string;
}

export interface CreatedP2pTransfer {
  shareId: string;
  expiresAt: Date;
  token: string | null;
}

/**
 * Create the metadata row for a peer-to-peer transfer. Unlike a Drop, no
 * bytes are ever written anywhere here — this row exists only so a
 * receiver can look up the file's name/size and so the signaling server
 * (src/lib/p2p/signalingServer.ts) has something to authorize connections
 * against.
 */
export async function createP2pTransfer(
  input: CreateP2pTransferInput,
): Promise<CreatedP2pTransfer> {
  const shareId = generateShareId();
  const expiresAt = expiresAtFor(input.expiration);
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  await prisma.p2pTransfer.create({
    data: {
      shareId,
      fileName: sanitizeFileName(input.fileName),
      fileSize: BigInt(input.fileSize),
      mimeType: input.mimeType || "application/octet-stream",
      passwordHash,
      expiresAt,
    },
  });

  // The sender just typed this password to set it — issue them a token
  // immediately rather than making them "unlock" a transfer they created.
  const token = passwordHash ? issueDownloadToken(shareId).token : null;

  return { shareId, expiresAt, token };
}

/**
 * Fetch a transfer by its public share ID. Lazily flips status to EXPIRED
 * if the deadline has passed and the cleanup job hasn't caught it yet.
 * Returns null for anything that isn't a live transfer, without
 * distinguishing "never existed" from "expired" to the caller.
 */
export async function getActiveP2pTransferByShareId(
  shareId: string,
): Promise<P2pTransfer | null> {
  const transfer = await prisma.p2pTransfer.findUnique({ where: { shareId } });
  if (!transfer) return null;

  if (transfer.status !== "EXPIRED" && transfer.expiresAt.getTime() <= Date.now()) {
    await prisma.p2pTransfer.updateMany({
      where: { shareId, status: { not: "EXPIRED" } },
      data: { status: "EXPIRED" },
    });
    transfer.status = "EXPIRED";
  }

  if (transfer.status === "EXPIRED") return null;
  return transfer;
}

export type UnlockP2pResult =
  | { ok: true; token: string }
  | { ok: false; reason: "not_found" | "wrong_password" };

export async function unlockP2pTransfer(
  shareId: string,
  password: string,
): Promise<UnlockP2pResult> {
  const transfer = await getActiveP2pTransferByShareId(shareId);
  if (!transfer) return { ok: false, reason: "not_found" };

  if (!transfer.passwordHash) {
    return { ok: true, token: issueDownloadToken(shareId).token };
  }

  const valid = await verifyPassword(password, transfer.passwordHash);
  if (!valid) return { ok: false, reason: "wrong_password" };

  return { ok: true, token: issueDownloadToken(shareId).token };
}

export function isP2pAuthorized(shareId: string, token: string | null): boolean {
  return verifyDownloadToken(shareId, token);
}

/** Shared shape-builder for the metadata and unlock endpoints. File
 * details are withheld until `authorized` — no password set, or a valid
 * unlock token was presented — same treatment as DropMetadataResponse. */
export function toMetadataResponse(
  transfer: P2pTransfer,
  authorized: boolean,
): P2pTransferMetadataResponse {
  return {
    shareId: transfer.shareId,
    requiresPassword: Boolean(transfer.passwordHash),
    expiresAt: transfer.expiresAt.toISOString(),
    status: transfer.status,
    senderOnline: isSenderOnline(transfer.shareId),
    file: authorized
      ? {
          name: transfer.fileName,
          size: transfer.fileSize.toString(),
          mimeType: transfer.mimeType,
        }
      : null,
  };
}

export { isSenderOnline };
