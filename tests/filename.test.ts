import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "@/lib/validation/filename";

describe("sanitizeFileName", () => {
  it("strips directory components to block path traversal", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\Windows\\System32\\evil.exe")).toBe("evil.exe");
    expect(sanitizeFileName("/etc/shadow")).toBe("shadow");
  });

  it("replaces characters that are unsafe in headers/paths", () => {
    expect(sanitizeFileName('weird"name*?.txt')).toBe("weird_name__.txt");
  });

  it("removes leading dots (hidden files / traversal tricks)", () => {
    expect(sanitizeFileName("....hidden")).toBe("hidden");
  });

  it("falls back to a default name when nothing survives sanitization", () => {
    expect(sanitizeFileName("...")).toBe("file");
    expect(sanitizeFileName("")).toBe("file");
  });

  it("truncates very long names while preserving the extension", () => {
    const longName = "a".repeat(300) + ".txt";
    const result = sanitizeFileName(longName);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith(".txt")).toBe(true);
  });

  it("leaves ordinary file names untouched", () => {
    expect(sanitizeFileName("vacation photo (final).jpg")).toBe("vacation photo (final).jpg");
  });
});
