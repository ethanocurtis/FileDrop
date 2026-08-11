import { prisma } from "@/lib/prisma";

/** Wipe all rows between tests. Cheap enough for the small fixture sets
 * these tests create, and keeps every test independent of run order. */
export async function resetDatabase(): Promise<void> {
  await prisma.uploadFile.deleteMany();
  await prisma.drop.deleteMany();
  await prisma.p2pTransfer.deleteMany();
}
