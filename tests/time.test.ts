import { describe, expect, it } from "vitest";
import {
  EXPIRATION_OPTIONS,
  expiresAtFor,
  formatTimeRemaining,
  isExpirationValue,
} from "@/lib/utils/time";

describe("expiresAtFor", () => {
  it("adds the correct duration for each expiration option", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(expiresAtFor("1h", from).toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(expiresAtFor("6h", from).toISOString()).toBe("2026-01-01T06:00:00.000Z");
    expect(expiresAtFor("24h", from).toISOString()).toBe("2026-01-02T00:00:00.000Z");
    expect(expiresAtFor("3d", from).toISOString()).toBe("2026-01-04T00:00:00.000Z");
    expect(expiresAtFor("7d", from).toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("covers every option exposed to the UI", () => {
    for (const option of EXPIRATION_OPTIONS) {
      expect(() => expiresAtFor(option.value)).not.toThrow();
    }
  });
});

describe("isExpirationValue", () => {
  it("accepts only the known set", () => {
    expect(isExpirationValue("24h")).toBe(true);
    expect(isExpirationValue("30m")).toBe(false);
    expect(isExpirationValue("")).toBe(false);
  });
});

describe("formatTimeRemaining", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("returns null once the deadline has passed", () => {
    expect(formatTimeRemaining(new Date("2025-12-31T23:59:59.000Z"), now)).toBeNull();
    expect(formatTimeRemaining(now, now)).toBeNull();
  });

  it("formats remaining time in the largest sensible unit", () => {
    expect(formatTimeRemaining(new Date("2026-01-03T00:00:00.000Z"), now)).toBe("2 days");
    expect(formatTimeRemaining(new Date("2026-01-01T05:00:00.000Z"), now)).toBe("5 hours");
    expect(formatTimeRemaining(new Date("2026-01-01T00:10:00.000Z"), now)).toBe("10 minutes");
    expect(formatTimeRemaining(new Date("2026-01-01T00:00:30.000Z"), now)).toBe(
      "less than a minute",
    );
  });

  it("uses singular units correctly", () => {
    expect(formatTimeRemaining(new Date("2026-01-02T00:00:00.000Z"), now)).toBe("1 day");
    expect(formatTimeRemaining(new Date("2026-01-01T01:00:00.000Z"), now)).toBe("1 hour");
    expect(formatTimeRemaining(new Date("2026-01-01T00:01:00.000Z"), now)).toBe("1 minute");
  });
});
