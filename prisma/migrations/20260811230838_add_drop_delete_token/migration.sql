-- AlterTable: add as nullable first — a NOT NULL column with no default
-- can't be added directly to a table that already has rows.
ALTER TABLE "Drop" ADD COLUMN "deleteToken" TEXT;

-- Backfill existing rows with a random token so the column can be made
-- required without violating any of them. Not the app's usual
-- crypto.randomBytes-based generator (this is plain SQL, running once,
-- against rows that predate this feature) — combines multiple entropy
-- sources so it's more than adequate for a one-time backfill, and avoids
-- depending on the pgcrypto extension being installed.
UPDATE "Drop"
SET "deleteToken" = md5(random()::text || clock_timestamp()::text || id)
WHERE "deleteToken" IS NULL;

-- AlterTable
ALTER TABLE "Drop" ALTER COLUMN "deleteToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Drop_deleteToken_key" ON "Drop"("deleteToken");
