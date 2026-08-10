import { describe, expect, it } from "vitest";
import { generateShareId, generateStorageId } from "@/lib/security/ids";

describe("generateShareId", () => {
  it("produces the requested length", () => {
    expect(generateShareId(22)).toHaveLength(22);
    expect(generateShareId(10)).toHaveLength(10);
  });

  it("only uses the unambiguous URL-safe alphabet", () => {
    const id = generateShareId(500);
    expect(id).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);
    // Characters that are easy to confuse (0/O, 1/l/I) must never appear.
    expect(id).not.toMatch(/[0O1lI]/);
  });

  it("is cryptographically random, not predictable/sequential", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateShareId()));
    // 1000 draws from a ~128-bit space should never collide.
    expect(ids.size).toBe(1000);
  });

  it("generateStorageId returns a distinct UUID each call", () => {
    const a = generateStorageId();
    const b = generateStorageId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
