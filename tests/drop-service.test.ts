import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "./helpers/db";
import { createTestDrop } from "./helpers/fixtures";

const deleteObject = vi.fn<(key: string) => Promise<void>>(async () => {});

vi.mock("@/lib/storage/s3", () => ({
  buildStorageKey: (dropId: string, fileId: string) => `drops/${dropId}/${fileId}`,
  deleteObject: (key: string) => deleteObject(key),
}));

// Imported after the mock so service.ts picks up the mocked module.
const { deleteDropByToken, prepareDrop } = await import("@/lib/uploads/service");
const { env } = await import("@/lib/env");

beforeEach(async () => {
  await resetDatabase();
  deleteObject.mockClear();
});
afterEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("prepareDrop — delete token", () => {
  it("generates a unique delete token and stores it on the row", async () => {
    const drop = await prepareDrop({
      files: [{ name: "a.txt", size: 10, mimeType: "text/plain" }],
      expiration: "1h",
    });

    expect(drop.deleteToken).toBeTruthy();
    const row = await prisma.drop.findUniqueOrThrow({ where: { shareId: drop.shareId } });
    expect(row.deleteToken).toBe(drop.deleteToken);
  });

  it("gives different drops different delete tokens", async () => {
    const a = await prepareDrop({
      files: [{ name: "a.txt", size: 10, mimeType: "text/plain" }],
      expiration: "1h",
    });
    const b = await prepareDrop({
      files: [{ name: "b.txt", size: 10, mimeType: "text/plain" }],
      expiration: "1h",
    });
    expect(a.deleteToken).not.toBe(b.deleteToken);
  });
});

describe("prepareDrop — large-file expiration cap", () => {
  it("clamps the expiration when a file is at or over the threshold and the request exceeds the cap", async () => {
    const drop = await prepareDrop({
      files: [{ name: "big.bin", size: env.LARGE_FILE_THRESHOLD_BYTES, mimeType: "application/octet-stream" }],
      expiration: "7d",
    });

    expect(drop.expirationClamped).toBe(true);
    // The cap is 24h by default — expiresAt should land close to now+24h,
    // nowhere near the requested 7 days.
    const hoursUntilExpiry = (drop.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000);
    expect(hoursUntilExpiry).toBeGreaterThan(23);
    expect(hoursUntilExpiry).toBeLessThan(25);
  });

  it("does not clamp a large file whose requested expiration is already under the cap", async () => {
    const drop = await prepareDrop({
      files: [{ name: "big.bin", size: env.LARGE_FILE_THRESHOLD_BYTES, mimeType: "application/octet-stream" }],
      expiration: "1h",
    });

    expect(drop.expirationClamped).toBe(false);
    const minutesUntilExpiry = (drop.expiresAt.getTime() - Date.now()) / (60 * 1000);
    expect(minutesUntilExpiry).toBeGreaterThan(55);
    expect(minutesUntilExpiry).toBeLessThan(65);
  });

  it("never clamps a drop whose largest file is under the threshold, regardless of expiration", async () => {
    const drop = await prepareDrop({
      files: [{ name: "small.txt", size: env.LARGE_FILE_THRESHOLD_BYTES - 1, mimeType: "text/plain" }],
      expiration: "7d",
    });

    expect(drop.expirationClamped).toBe(false);
    const daysUntilExpiry = (drop.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(6.9);
  });

  it("clamps based on the largest file in a multi-file drop, not just the first one", async () => {
    const drop = await prepareDrop({
      files: [
        { name: "small.txt", size: 1024, mimeType: "text/plain" },
        { name: "big.bin", size: env.LARGE_FILE_THRESHOLD_BYTES, mimeType: "application/octet-stream" },
      ],
      expiration: "7d",
    });

    expect(drop.expirationClamped).toBe(true);
  });
});

describe("deleteDropByToken", () => {
  it("deletes storage objects and marks the drop DELETED with the correct token", async () => {
    const { shareId, dropId, deleteToken } = await createTestDrop();

    const result = await deleteDropByToken(shareId, deleteToken);
    expect(result).toEqual({ ok: true });
    expect(deleteObject).toHaveBeenCalledTimes(1);

    const row = await prisma.drop.findUniqueOrThrow({ where: { id: dropId } });
    expect(row.status).toBe("DELETED");
  });

  it("rejects an incorrect token and leaves the drop untouched", async () => {
    const { shareId, dropId } = await createTestDrop();

    const result = await deleteDropByToken(shareId, "wrong-token");
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
    expect(deleteObject).not.toHaveBeenCalled();

    const row = await prisma.drop.findUniqueOrThrow({ where: { id: dropId } });
    expect(row.status).toBe("ACTIVE");
  });

  it("rejects an unknown share ID", async () => {
    const result = await deleteDropByToken("does-not-exist", "any-token");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects deleting a drop that's already DELETED", async () => {
    const { shareId, deleteToken } = await createTestDrop({ status: "DELETED" });

    const result = await deleteDropByToken(shareId, deleteToken);
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("works from PENDING and EXPIRED statuses too, not just ACTIVE", async () => {
    const pending = await createTestDrop({ status: "PENDING", fileStatus: "PENDING" });
    const expired = await createTestDrop({ status: "EXPIRED" });

    expect(await deleteDropByToken(pending.shareId, pending.deleteToken)).toEqual({ ok: true });
    expect(await deleteDropByToken(expired.shareId, expired.deleteToken)).toEqual({ ok: true });
  });

  it("a token from one drop does not delete a different drop", async () => {
    const a = await createTestDrop();
    const b = await createTestDrop();

    const result = await deleteDropByToken(a.shareId, b.deleteToken);
    expect(result).toEqual({ ok: false, reason: "invalid_token" });

    const rowA = await prisma.drop.findUniqueOrThrow({ where: { id: a.dropId } });
    expect(rowA.status).toBe("ACTIVE");
  });
});
