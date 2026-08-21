export const EXPIRATION_OPTIONS = [
  { value: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { value: "6h", label: "6 hours", ms: 6 * 60 * 60 * 1000 },
  { value: "24h", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "3d", label: "3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { value: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

export type ExpirationValue = (typeof EXPIRATION_OPTIONS)[number]["value"];

export const DEFAULT_EXPIRATION: ExpirationValue = "24h";

const EXPIRATION_MS = new Map(EXPIRATION_OPTIONS.map((o) => [o.value, o.ms]));

export function isExpirationValue(value: string): value is ExpirationValue {
  return EXPIRATION_MS.has(value as ExpirationValue);
}

export function expiresAtFor(value: ExpirationValue, from: Date = new Date()): Date {
  const ms = EXPIRATION_MS.get(value);
  if (!ms) throw new Error(`Unknown expiration option: ${value}`);
  return new Date(from.getTime() + ms);
}

/** Duration of an expiration option, in milliseconds — lets callers
 * compare two options (e.g. "is the requested expiration longer than
 * the policy cap for large files?") without hardcoding the ms table
 * themselves. */
export function expirationMsFor(value: ExpirationValue): number {
  const ms = EXPIRATION_MS.get(value);
  if (!ms) throw new Error(`Unknown expiration option: ${value}`);
  return ms;
}

/**
 * Human-friendly "time remaining" string, e.g. "17 hours", "42 minutes",
 * "less than a minute". Returns null once the deadline has passed.
 */
export function formatTimeRemaining(expiresAt: Date, now: Date = new Date()): string | null {
  const diffMs = expiresAt.getTime() - now.getTime();
  if (diffMs <= 0) return null;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs >= day) {
    const days = Math.round(diffMs / day);
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (diffMs >= hour) {
    const hours = Math.round(diffMs / hour);
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  if (diffMs >= minute) {
    const minutes = Math.round(diffMs / minute);
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }
  return "less than a minute";
}

export function formatAbsolute(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Stands in for a real "never expires" (nullable expiresAt would be the
 * more conventional way to model that, but this avoids a schema
 * migration — see prepareDrop() in src/lib/uploads/service.ts for where
 * it's set, admin-only). Every existing `expiresAt <= now()`-style
 * comparison (cleanup's sweep, the atomic download claim, the lazy
 * expiry check) already just naturally never matches a date this far
 * out, so nothing needed to change there — only display code needs to
 * check for it explicitly, via isNeverExpires below, rather than trying
 * to format or count down to it.
 */
export const NO_EXPIRATION_SENTINEL = new Date("9999-12-31T23:59:59.000Z");

export function isNeverExpires(date: Date): boolean {
  return date.getTime() >= NO_EXPIRATION_SENTINEL.getTime();
}
