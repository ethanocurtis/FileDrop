import { z } from "zod";

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
