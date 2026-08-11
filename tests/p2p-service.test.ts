import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createP2pTransfer,
  getActiveP2pTransferByShareId,
  isP2pAuthorized,
  toMetadataResponse,
  unlockP2pTransfer,
} from "@/lib/p2p/service";
import { hashPassword } from "@/lib/security/password";
import { resetDatabase } from "./helpers/db";
import { createTestP2pTransfer } from "./helpers/fixtures";

beforeEach(resetDatabase);
afterEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("createP2pTransfer", () => {
  it("creates a WAITING transfer with a sanitized file name and no token when unprotected", async () => {
    const result = await createP2pTransfer({
      fileName: "../../etc/passwd.png",
      fileSize: 12345,
      mimeType: "image/png",
      expiration: "24h",
    });

    expect(result.token).toBeNull();
    const row = await prisma.p2pTransfer.findUniqueOrThrow({ where: { shareId: result.shareId } });
    expect(row.status).toBe("WAITING");
    expect(row.fileName).toBe("passwd.png"); // traversal stripped
    expect(row.fileSize).toBe(BigInt(12345));
    expect(row.passwordHash).toBeNull();
  });

  it("hashes the password and issues an immediately-usable token when one is set", async () => {
    const result = await createP2pTransfer({
      fileName: "secret.pdf",
      fileSize: 100,
      mimeType: "application/pdf",
      expiration: "1h",
      password: "hunter22",
    });

    expect(result.token).not.toBeNull();
    const row = await prisma.p2pTransfer.findUniqueOrThrow({ where: { shareId: result.shareId } });
    expect(row.passwordHash).not.toBeNull();
    expect(row.passwordHash).not.toBe("hunter22");
    expect(isP2pAuthorized(result.shareId, result.token)).toBe(true);
  });
});

describe("getActiveP2pTransferByShareId", () => {
  it("returns an unexpired transfer", async () => {
    const { shareId } = await createTestP2pTransfer();
    expect(await getActiveP2pTransferByShareId(shareId)).not.toBeNull();
  });

  it("returns null and lazily flips status to EXPIRED once past expiresAt", async () => {
    const { shareId } = await createTestP2pTransfer({ expiresAt: new Date(Date.now() - 1000) });

    expect(await getActiveP2pTransferByShareId(shareId)).toBeNull();

    const row = await prisma.p2pTransfer.findUniqueOrThrow({ where: { shareId } });
    expect(row.status).toBe("EXPIRED");
  });

  it("returns null for a transfer already marked EXPIRED", async () => {
    const { shareId } = await createTestP2pTransfer({ status: "EXPIRED" });
    expect(await getActiveP2pTransferByShareId(shareId)).toBeNull();
  });

  it("returns null for an unknown share ID", async () => {
    expect(await getActiveP2pTransferByShareId("does-not-exist")).toBeNull();
  });

  it("still returns a live transfer regardless of WAITING/CONNECTED/COMPLETED status", async () => {
    const { shareId: waiting } = await createTestP2pTransfer({ status: "WAITING" });
    const { shareId: connected } = await createTestP2pTransfer({ status: "CONNECTED" });
    const { shareId: completed } = await createTestP2pTransfer({ status: "COMPLETED" });

    expect(await getActiveP2pTransferByShareId(waiting)).not.toBeNull();
    expect(await getActiveP2pTransferByShareId(connected)).not.toBeNull();
    expect(await getActiveP2pTransferByShareId(completed)).not.toBeNull();
  });
});

describe("unlockP2pTransfer", () => {
  it("rejects an incorrect password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { shareId } = await createTestP2pTransfer({ passwordHash });

    const result = await unlockP2pTransfer(shareId, "wrong-password");
    expect(result).toEqual({ ok: false, reason: "wrong_password" });
  });

  it("issues a usable token for the correct password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { shareId } = await createTestP2pTransfer({ passwordHash });

    const result = await unlockP2pTransfer(shareId, "correct-password");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isP2pAuthorized(shareId, result.token)).toBe(true);
    }
  });

  it("a token issued for one transfer does not authorize a different one", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { shareId: shareA } = await createTestP2pTransfer({ passwordHash });
    const { shareId: shareB } = await createTestP2pTransfer({ passwordHash });

    const unlockA = await unlockP2pTransfer(shareA, "correct-password");
    expect(unlockA.ok).toBe(true);
    if (unlockA.ok) {
      expect(isP2pAuthorized(shareB, unlockA.token)).toBe(false);
    }
  });

  it("rejects unlocking an expired transfer without leaking why", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { shareId } = await createTestP2pTransfer({
      passwordHash,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await unlockP2pTransfer(shareId, "correct-password");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("succeeds without a real password check when the transfer has none set", async () => {
    const { shareId } = await createTestP2pTransfer({ passwordHash: null });
    const result = await unlockP2pTransfer(shareId, "anything");
    expect(result.ok).toBe(true);
  });
});

describe("toMetadataResponse", () => {
  it("withholds file details when not authorized", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { transfer } = await createTestP2pTransfer({ passwordHash, fileName: "secret.pdf" });

    const body = toMetadataResponse(transfer, false);
    expect(body.requiresPassword).toBe(true);
    expect(body.file).toBeNull();
  });

  it("includes file details when authorized", async () => {
    const { transfer } = await createTestP2pTransfer({ fileName: "photo.jpg", fileSize: 999 });

    const body = toMetadataResponse(transfer, true);
    expect(body.file).toEqual({ name: "photo.jpg", size: "999", mimeType: "application/octet-stream" });
  });

  it("reports senderOnline as false when no signaling connection exists", async () => {
    const { transfer } = await createTestP2pTransfer();
    const body = toMetadataResponse(transfer, true);
    expect(body.senderOnline).toBe(false);
  });
});
