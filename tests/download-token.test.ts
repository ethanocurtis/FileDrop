import { describe, expect, it, vi } from "vitest";
import { issueDownloadToken, verifyDownloadToken } from "@/lib/security/downloadToken";

describe("download tokens", () => {
  it("verifies a token issued for the same share ID", () => {
    const { token } = issueDownloadToken("share123");
    expect(verifyDownloadToken("share123", token)).toBe(true);
  });

  it("rejects a token used against a different share ID", () => {
    const { token } = issueDownloadToken("share123");
    expect(verifyDownloadToken("other-share", token)).toBe(false);
  });

  it("rejects missing, malformed, or tampered tokens", () => {
    expect(verifyDownloadToken("share123", null)).toBe(false);
    expect(verifyDownloadToken("share123", "")).toBe(false);
    expect(verifyDownloadToken("share123", "garbage")).toBe(false);

    const { token } = issueDownloadToken("share123");
    const tampered = token.slice(0, -1) + (token.at(-1) === "a" ? "b" : "a");
    expect(verifyDownloadToken("share123", tampered)).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    try {
      const { token } = issueDownloadToken("share123");
      vi.advanceTimersByTime(11 * 60 * 1000); // past the 10-minute TTL
      expect(verifyDownloadToken("share123", token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
