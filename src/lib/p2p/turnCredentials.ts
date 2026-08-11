import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

const CREDENTIAL_TTL_SECONDS = 10 * 60; // 10 minutes

export interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

/**
 * Short-lived TURN credentials using coturn's "TURN REST API" convention
 * (`use-auth-secret` + `static-auth-secret`): username is an expiry
 * timestamp, credential is an HMAC-SHA1 of that username keyed by a
 * secret shared with the coturn container. Nothing is persisted — coturn
 * verifies these itself by recomputing the same HMAC, so there's no
 * database round trip and no way to reuse a credential past its TTL.
 */
function generateTurnCredential(): { username: string; credential: string } {
  const expiresAt = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
  const username = `${expiresAt}:filedrop`;
  const credential = createHmac("sha1", env.TURN_SECRET ?? "")
    .update(username)
    .digest("base64");
  return { username, credential };
}

/**
 * ICE server list for the browser's RTCPeerConnection. Always includes a
 * public STUN server (works whenever a direct path between the two
 * browsers is possible, which is most of the time on open networks) and,
 * only when TURN_SECRET/TURN_EXTERNAL_IP are configured, our own TURN
 * relay as a fallback for restrictive NATs/firewalls.
 */
export function getIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [{ urls: "stun:stun.l.google.com:19302" }];

  if (env.TURN_SECRET && env.TURN_EXTERNAL_IP) {
    const { username, credential } = generateTurnCredential();
    const host = `${env.TURN_EXTERNAL_IP}:${env.TURN_PORT}`;
    servers.push(
      { urls: `turn:${host}?transport=udp`, username, credential },
      { urls: `turn:${host}?transport=tcp`, username, credential },
    );
  }

  return servers;
}
