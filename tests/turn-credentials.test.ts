import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getIceServers } from "@/lib/p2p/turnCredentials";
import { env } from "@/lib/env";

describe("getIceServers", () => {
  it("always includes a public STUN server", () => {
    const servers = getIceServers();
    expect(servers.some((s) => s.urls === "stun:stun.l.google.com:19302")).toBe(true);
  });

  it("includes UDP and TCP TURN entries with a valid HMAC credential when TURN is configured", () => {
    // tests/setup.ts sets TURN_SECRET/TURN_EXTERNAL_IP for every test run.
    const servers = getIceServers();
    const turnServers = servers.filter((s) => s.urls.startsWith("turn:"));
    expect(turnServers).toHaveLength(2);
    expect(turnServers.map((s) => s.urls)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("transport=udp"),
        expect.stringContaining("transport=tcp"),
      ]),
    );

    for (const server of turnServers) {
      expect(server.urls).toContain(env.TURN_EXTERNAL_IP);
      expect(server.username).toMatch(/^\d+:filedrop$/);

      const expectedCredential = createHmac("sha1", env.TURN_SECRET ?? "")
        .update(server.username ?? "")
        .digest("base64");
      expect(server.credential).toBe(expectedCredential);
    }
  });

  it("issues a username expiring roughly 10 minutes from now", () => {
    const [server] = getIceServers().filter((s) => s.urls.startsWith("turn:"));
    const expiresAt = Number.parseInt(server.username?.split(":")[0] ?? "0", 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(expiresAt).toBeGreaterThan(nowSeconds + 9 * 60);
    expect(expiresAt).toBeLessThanOrEqual(nowSeconds + 10 * 60);
  });
});
