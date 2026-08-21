import { describe, expect, it, vi } from "vitest";
import { issueAdminSessionToken, verifyAdminSessionToken, bearerTokenFrom } from "@/lib/security/adminSession";

describe("admin session tokens", () => {
  it("verifies a token right after issuing it", () => {
    const { token } = issueAdminSessionToken();
    expect(verifyAdminSessionToken(token)).toBe(true);
  });

  it("rejects missing, empty, or malformed tokens", () => {
    expect(verifyAdminSessionToken(null)).toBe(false);
    expect(verifyAdminSessionToken("")).toBe(false);
    expect(verifyAdminSessionToken("garbage")).toBe(false);
    expect(verifyAdminSessionToken("123456")).toBe(false); // no signature half
  });

  it("rejects a tampered signature", () => {
    const { token } = issueAdminSessionToken();
    const tampered = token.slice(0, -1) + (token.at(-1) === "a" ? "b" : "a");
    expect(verifyAdminSessionToken(tampered)).toBe(false);
  });

  it("rejects a token with its expiry moved into the future (signature won't match)", () => {
    const { token } = issueAdminSessionToken();
    const [expiresAtRaw, signature] = token.split(".");
    const forged = `${Number(expiresAtRaw) + 1_000_000}.${signature}`;
    expect(verifyAdminSessionToken(forged)).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    try {
      const { token } = issueAdminSessionToken();
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // past the 24-hour TTL
      expect(verifyAdminSessionToken(token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("issues distinct tokens on separate calls", () => {
    vi.useFakeTimers();
    try {
      const a = issueAdminSessionToken();
      vi.advanceTimersByTime(1000);
      const b = issueAdminSessionToken();
      expect(a.token).not.toBe(b.token);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("bearerTokenFrom", () => {
  function requestWith(header: string | null): Request {
    const headers = new Headers();
    if (header !== null) headers.set("authorization", header);
    return new Request("http://localhost/api/drops", { headers });
  }

  it("extracts the token from a well-formed Bearer header", () => {
    expect(bearerTokenFrom(requestWith("Bearer abc.def"))).toBe("abc.def");
  });

  it("returns null when there's no authorization header", () => {
    expect(bearerTokenFrom(requestWith(null))).toBeNull();
  });

  it("returns null for a non-Bearer scheme or a missing token", () => {
    expect(bearerTokenFrom(requestWith("Basic abc"))).toBeNull();
    expect(bearerTokenFrom(requestWith("Bearer"))).toBeNull();
    expect(bearerTokenFrom(requestWith(""))).toBeNull();
  });
});
