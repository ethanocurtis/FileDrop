/**
 * Standalone expiry-sweep runner, meant to be invoked directly by a host
 * cron job (rather than through the HTTP `/api/cleanup` endpoint). Talks
 * to Postgres and object storage directly — the Next.js server doesn't
 * need to be running for this to work.
 *
 * Usage: npx tsx scripts/cleanup.ts   (see README "Cleanup job" for
 * cron/systemd-timer examples.)
 */
import "dotenv/config";
import { runCleanup } from "../src/lib/cleanup/cleanup";
import { prisma } from "../src/lib/prisma";

async function main() {
  const startedAt = Date.now();
  const result = await runCleanup();
  const durationMs = Date.now() - startedAt;

  console.log(
    `[cleanup] examined=${result.dropsExamined} filesDeleted=${result.filesDeleted} ` +
      `dropsMarkedDeleted=${result.dropsMarkedDeleted} errors=${result.errors} ` +
      `p2pTransfersDeleted=${result.p2pTransfersDeleted} (${durationMs}ms)`,
  );

  if (result.errors > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[cleanup] run failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
