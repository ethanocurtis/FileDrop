import { z } from "zod";
import { EXPIRATION_OPTIONS, type ExpirationValue } from "@/lib/utils/time";

const expirationValues = EXPIRATION_OPTIONS.map((o) => o.value) as [
  ExpirationValue,
  ...ExpirationValue[],
];

/**
 * Centralized, validated environment configuration. Importing from here
 * (instead of reading `process.env` directly all over the codebase) means
 * misconfiguration fails fast with a clear error instead of surfacing as a
 * confusing runtime bug later.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  S3_ENDPOINT: z.string().min(1, "S3_ENDPOINT is required"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID is required"),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY is required"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  DOWNLOAD_TOKEN_SECRET: z
    .string()
    .min(16, "DOWNLOAD_TOKEN_SECRET must be at least 16 characters"),
  CLEANUP_SECRET: z.string().min(16, "CLEANUP_SECRET must be at least 16 characters"),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  MAX_UPLOAD_SIZE_BYTES: z
    .string()
    .default("209715200")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),

  MAX_FILES_PER_DROP: z
    .string()
    .default("10")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive().max(100)),

  // Files at or over this size get their expiration capped to
  // LARGE_FILE_MAX_EXPIRATION regardless of what the uploader picked —
  // see prepareDrop() in src/lib/uploads/service.ts. Doesn't apply to
  // peer-to-peer transfers, which never touch server storage in the
  // first place. Default: 1 GB / 24 hours.
  LARGE_FILE_THRESHOLD_BYTES: z
    .string()
    .default("1073741824")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
  LARGE_FILE_MAX_EXPIRATION: z.enum(expirationValues).default("24h"),

  // Peer-to-peer transfers work without these (best-effort, direct
  // connections only) — a TURN relay is only needed as a fallback when
  // two browsers can't reach each other directly (restrictive NATs /
  // firewalls). Both left unset just means getIceServers() returns STUN
  // only. See README "Peer-to-peer transfers".
  // docker-compose.yml passes these as `${TURN_SECRET:-}` — an empty
  // string when unset, not an absent key — so they need to be normalized
  // to undefined before `.optional()` can treat them as "not configured".
  // Without this, an intentionally-blank TURN_SECRET would fail the
  // `.min(16)` check and crash the app on startup.
  TURN_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(16).optional(),
  ),
  TURN_EXTERNAL_IP: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  TURN_PORT: z
    .string()
    .default("3478")
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().positive()),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
