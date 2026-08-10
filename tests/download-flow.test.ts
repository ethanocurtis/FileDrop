import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { claimDownload, unlockDrop, isDownloadAuthorized } from "@/lib/uploads/download";
import { getActiveDropByShareId } from "@/lib/uploads/service";
import { hashPassword } from "@/lib/security/password";
import { resetDatabase } from "./helpers/db";
import { createTestDrop } from "./helpers/fixtures";

beforeEach(resetDatabase);
afterEach(resetDatabase);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("claimDownload — expiration", () => {
  it("serves a file from an active, unexpired drop", async () => {
    const { shareId, fileId } = await createTestDrop();
    const result = await claimDownload({ shareId, fileId });
    expect(result.ok).toBe(true);
  });

  it("rejects a download once the drop is past its expiresAt, even if cleanup hasn't run", async () => {
    const { shareId, fileId } = await createTestDrop({
      expiresAt: new Date(Date.now() - 1000),
    });
    const result = await claimDownload({ shareId, fileId });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a download for a drop already marked EXPIRED", async () => {
    const { shareId, fileId } = await createTestDrop({ status: "EXPIRED" });
    const result = await claimDownload({ shareId, fileId });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects an unknown share ID without revealing anything", async () => {
    const result = await claimDownload({ shareId: "does-not-exist", fileId: "nope" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("getActiveDropByShareId lazily flips ACTIVE-but-expired rows to EXPIRED", async () => {
    const { shareId, dropId } = await createTestDrop({ expiresAt: new Date(Date.now() - 1000) });
    expect(await getActiveDropByShareId(shareId)).toBeNull();

    const row = await prisma.drop.findUniqueOrThrow({ where: { id: dropId } });
    expect(row.status).toBe("EXPIRED");
  });
});

describe("claimDownload — download limits", () => {
  it("allows downloads under the limit and blocks once it's reached", async () => {
    const { shareId, fileId } = await createTestDrop({ maxDownloads: 2, downloadCount: 0 });

    expect((await claimDownload({ shareId, fileId })).ok).toBe(true);
    expect((await claimDownload({ shareId, fileId })).ok).toBe(true);

    const third = await claimDownload({ shareId, fileId });
    expect(third).toEqual({ ok: false, reason: "limit_reached" });
  });

  it("does not let concurrent requests exceed a 1-download limit (atomic claim)", async () => {
    const { shareId, fileId } = await createTestDrop({ maxDownloads: 1, downloadCount: 0 });

    // Fire several simultaneous claims — only one should ever succeed,
    // proving the increment+check happens in a single atomic UPDATE
    // rather than a racy read-then-write.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => claimDownload({ shareId, fileId })),
    );

    const successes = results.filter((r) => r.ok);
    expect(successes).toHaveLength(1);

    const row = await prisma.drop.findUniqueOrThrow({ where: { shareId } });
    expect(row.downloadCount).toBe(1);
    expect(row.status).toBe("EXPIRED");
  });

  it("an invalid fileId never consumes the download count", async () => {
    const { shareId } = await createTestDrop({ maxDownloads: 1, downloadCount: 0 });

    const result = await claimDownload({ shareId, fileId: "not-a-real-file-id" });
    expect(result.ok).toBe(false);

    const row = await prisma.drop.findUniqueOrThrow({ where: { shareId } });
    expect(row.downloadCount).toBe(0);
    expect(row.status).toBe("ACTIVE");
  });

  it("leaves unlimited drops (maxDownloads: null) downloadable indefinitely", async () => {
    const { shareId, fileId } = await createTestDrop({ maxDownloads: null });
    for (let i = 0; i < 5; i++) {
      expect((await claimDownload({ shareId, fileId })).ok).toBe(true);
    }
  });
});

describe("claimDownload — burn after read", () => {
  it("expires the drop immediately after the first successful download", async () => {
    const { shareId, fileId } = await createTestDrop({ burnAfterRead: true });

    const first = await claimDownload({ shareId, fileId });
    expect(first.ok).toBe(true);

    const second = await claimDownload({ shareId, fileId });
    expect(second).toEqual({ ok: false, reason: "expired" });

    const row = await prisma.drop.findUniqueOrThrow({ where: { shareId } });
    expect(row.status).toBe("EXPIRED");
    expect(row.downloadCount).toBe(1);
  });
});

describe("unlockDrop — password-protected downloads", () => {
  it("rejects an incorrect password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { shareId } = await createTestDrop({ passwordHash });

    const result = await unlockDrop(shareId, "wrong-password");
    expect(result).toEqual({ ok: false, reason: "wrong_password" });
  });

  it("issues a usable download token for the correct password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { shareId } = await createTestDrop({ passwordHash });

    const result = await unlockDrop(shareId, "correct-password");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isDownloadAuthorized(shareId, result.token)).toBe(true);
    }
  });

  it("never authorizes a download without unlocking first", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { shareId } = await createTestDrop({ passwordHash });

    expect(isDownloadAuthorized(shareId, null)).toBe(false);
    expect(isDownloadAuthorized(shareId, "made-up-token")).toBe(false);
  });

  it("a token issued for one drop does not unlock a different drop", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { shareId: shareA } = await createTestDrop({ passwordHash });
    const { shareId: shareB } = await createTestDrop({ passwordHash });

    const unlockA = await unlockDrop(shareA, "correct-password");
    expect(unlockA.ok).toBe(true);
    if (unlockA.ok) {
      expect(isDownloadAuthorized(shareB, unlockA.token)).toBe(false);
    }
  });

  it("rejects unlocking an expired drop without leaking why", async () => {
    const passwordHash = await hashPassword("correct-password");
    const { shareId } = await createTestDrop({
      passwordHash,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await unlockDrop(shareId, "correct-password");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
