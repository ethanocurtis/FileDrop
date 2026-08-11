import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDatabase } from "./helpers/db";
import { createTestDrop, createTestP2pTransfer } from "./helpers/fixtures";

const deleteObject = vi.fn<(key: string) => Promise<void>>(async () => {});

vi.mock("@/lib/storage/s3", () => ({
  deleteObject: (key: string) => deleteObject(key),
}));

// Imported after the mock so cleanup.ts picks up the mocked module.
const { runCleanup } = await import("@/lib/cleanup/cleanup");

beforeEach(async () => {
  await resetDatabase();
  deleteObject.mockClear();
});
afterEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("runCleanup", () => {
  it("deletes storage objects and marks expired drops DELETED", async () => {
    const { shareId, dropId } = await createTestDrop({ status: "EXPIRED" });

    const result = await runCleanup();
    expect(result.dropsExamined).toBe(1);
    expect(result.filesDeleted).toBe(1);
    expect(result.dropsMarkedDeleted).toBe(1);
    expect(deleteObject).toHaveBeenCalledTimes(1);

    const row = await prisma.drop.findUniqueOrThrow({ where: { id: dropId } });
    expect(row.status).toBe("DELETED");
    expect(row.shareId).toBe(shareId);
  });

  it("lazily expires ACTIVE drops whose expiresAt has passed, then deletes them", async () => {
    await createTestDrop({ status: "ACTIVE", expiresAt: new Date(Date.now() - 1000) });

    const result = await runCleanup();
    expect(result.dropsMarkedDeleted).toBe(1);
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });

  it("expires abandoned PENDING uploads past their deadline", async () => {
    const { dropId } = await createTestDrop({
      status: "PENDING",
      fileStatus: "PENDING",
      expiresAt: new Date(Date.now() - 1000),
    });

    await runCleanup();
    const row = await prisma.drop.findUniqueOrThrow({ where: { id: dropId } });
    expect(row.status).toBe("DELETED");
  });

  it("leaves active, unexpired drops alone", async () => {
    const { dropId } = await createTestDrop({
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await runCleanup();
    expect(deleteObject).not.toHaveBeenCalled();

    const row = await prisma.drop.findUniqueOrThrow({ where: { id: dropId } });
    expect(row.status).toBe("ACTIVE");
  });

  it("is safe to run multiple times in a row (idempotent)", async () => {
    const { dropId } = await createTestDrop({ status: "EXPIRED" });

    const first = await runCleanup();
    const second = await runCleanup();
    const third = await runCleanup();

    expect(first.dropsMarkedDeleted).toBe(1);
    expect(second.dropsMarkedDeleted).toBe(0);
    expect(third.dropsMarkedDeleted).toBe(0);
    // Only ever attempted the delete once, not once per run.
    expect(deleteObject).toHaveBeenCalledTimes(1);

    const row = await prisma.drop.findUniqueOrThrow({ where: { id: dropId } });
    expect(row.status).toBe("DELETED");
  });

  it("retries only the drops that failed to delete, leaving succeeded ones alone", async () => {
    const failing = await createTestDrop({ status: "EXPIRED" });
    const succeeding = await createTestDrop({ status: "EXPIRED" });

    deleteObject.mockImplementation(async (key: string) => {
      if (key.includes(failing.dropId)) throw new Error("simulated storage outage");
    });

    const result = await runCleanup();
    expect(result.errors).toBe(1);
    expect(result.dropsMarkedDeleted).toBe(1);

    const failingRow = await prisma.drop.findUniqueOrThrow({ where: { id: failing.dropId } });
    const succeedingRow = await prisma.drop.findUniqueOrThrow({ where: { id: succeeding.dropId } });
    expect(failingRow.status).toBe("EXPIRED"); // left for retry
    expect(succeedingRow.status).toBe("DELETED");

    // Next run only touches the previously-failed drop.
    deleteObject.mockClear();
    deleteObject.mockImplementation(async () => {});
    const retry = await runCleanup();
    expect(retry.dropsExamined).toBe(1);
    expect(retry.dropsMarkedDeleted).toBe(1);
  });

  it("does not touch DELETED or PENDING (not-yet-expired) drops", async () => {
    const alreadyDeleted = await createTestDrop({ status: "DELETED" });
    const pending = await createTestDrop({
      status: "PENDING",
      fileStatus: "PENDING",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await runCleanup();
    expect(deleteObject).not.toHaveBeenCalled();

    const a = await prisma.drop.findUniqueOrThrow({ where: { id: alreadyDeleted.dropId } });
    const p = await prisma.drop.findUniqueOrThrow({ where: { id: pending.dropId } });
    expect(a.status).toBe("DELETED");
    expect(p.status).toBe("PENDING");
  });

  it("hard-deletes P2pTransfer rows past their expiry, regardless of status", async () => {
    const { shareId: expiredWaiting } = await createTestP2pTransfer({
      status: "WAITING",
      expiresAt: new Date(Date.now() - 1000),
    });
    const { shareId: expiredCompleted } = await createTestP2pTransfer({
      status: "COMPLETED",
      expiresAt: new Date(Date.now() - 1000),
    });
    const { shareId: stillActive } = await createTestP2pTransfer({
      status: "WAITING",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const result = await runCleanup();
    expect(result.p2pTransfersDeleted).toBe(2);

    expect(await prisma.p2pTransfer.findUnique({ where: { shareId: expiredWaiting } })).toBeNull();
    expect(await prisma.p2pTransfer.findUnique({ where: { shareId: expiredCompleted } })).toBeNull();
    expect(await prisma.p2pTransfer.findUnique({ where: { shareId: stillActive } })).not.toBeNull();
  });

  it("is a no-op for P2pTransfer when nothing has expired", async () => {
    await createTestP2pTransfer({ expiresAt: new Date(Date.now() + 60 * 60 * 1000) });

    const result = await runCleanup();
    expect(result.p2pTransfersDeleted).toBe(0);
  });
});
