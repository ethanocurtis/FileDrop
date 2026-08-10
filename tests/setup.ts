import "dotenv/config";

// Route every test at a dedicated database so nothing here ever touches
// dev data. Create it once with:
//   createdb filedrop_test && DATABASE_URL=postgresql://.../filedrop_test npx prisma migrate deploy
// (see README "Running tests").
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://filedrop:filedrop@localhost:5432/filedrop_test?schema=public";

// The env schema requires these to be set for any module that imports
// lib/env.ts (most of the app). Values are irrelevant for the tests that
// don't actually hit S3 — provide harmless defaults so import doesn't
// throw when a test file only cares about DB or pure-function behavior.
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_BUCKET ??= "filedrop-test";
process.env.S3_ACCESS_KEY_ID ??= "S3RVER";
process.env.S3_SECRET_ACCESS_KEY ??= "S3RVER";
process.env.S3_FORCE_PATH_STYLE ??= "true";
process.env.DOWNLOAD_TOKEN_SECRET ??= "test-download-token-secret-not-for-production";
process.env.CLEANUP_SECRET ??= "test-cleanup-secret-not-for-production";
