import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getClientIp, metadataRateLimiter } from "@/lib/security/rateLimit";
import { getIceServers } from "@/lib/p2p/turnCredentials";

export const runtime = "nodejs";

/**
 * Not shareId-scoped — this just mints a fresh short-lived TURN credential
 * (when TURN is configured) alongside the public STUN server. Called once
 * per browser per transfer, right before opening the RTCPeerConnection.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  if (!metadataRateLimiter.check(ip).allowed) {
    return apiError("RATE_LIMITED", "Too many requests. Try again shortly.");
  }

  return NextResponse.json({ iceServers: getIceServers() });
}
