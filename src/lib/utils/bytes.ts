/**
 * Format a byte count as a human-readable string, e.g. 24700000 -> "24.7 MB".
 * Accepts bigint since Prisma returns file sizes as BigInt.
 */
export function formatBytes(bytes: number | bigint, decimals = 1): string {
  const value = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (!Number.isFinite(value) || value < 0) return "0 B";
  if (value === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const amount = value / 1024 ** exponent;
  const formatted = exponent === 0 ? amount.toString() : amount.toFixed(decimals);
  return `${formatted} ${units[exponent]}`;
}
