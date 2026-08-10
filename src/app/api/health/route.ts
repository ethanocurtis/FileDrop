import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Liveness/readiness probe for container orchestration (Docker healthcheck,
 * Kubernetes, load balancer health checks, ...). Confirms the app can
 * actually reach the database rather than just that the process is up.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[GET /api/health] database check failed:", err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
