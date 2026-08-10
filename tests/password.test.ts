import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/security/password";

describe("password hashing", () => {
  it("never stores the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
    expect(hash.startsWith("$2")).toBe(true); // bcrypt hash prefix
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects gracefully on a malformed hash instead of throwing", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash")).resolves.toBe(false);
  });
});
