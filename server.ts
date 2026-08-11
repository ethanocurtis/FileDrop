/**
 * Custom server, replacing plain `next dev`/`next start`.
 *
 * The only reason this exists: WebRTC signaling for peer-to-peer transfers
 * (see src/lib/p2p) needs a real WebSocket connection, and Next.js's own
 * route handlers have no way to hook the HTTP server's `upgrade` event.
 * Everything else is delegated straight to Next's own request handler, so
 * this changes nothing about how ordinary pages/API routes behave.
 *
 * Running the signaling server in-process (rather than as a separate
 * container/port) means it's reachable at the same domain/port as the
 * rest of the app — no extra reverse-proxy configuration needed beyond
 * "Websockets Support" being on, which most reverse proxies (including
 * Nginx Proxy Manager) already default to for HTTP proxy hosts.
 */
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachSignalingServer, isSignalPath } from "@/lib/p2p/signalingServer";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Must be called after prepare() resolves — unlike getRequestHandler(),
  // getUpgradeHandler() throws if called any earlier.
  const handleUpgrade = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl);
  });

  // Our own listener only claims /ws/p2p/signal and leaves everything
  // else alone (see signalingServer.ts). Everything else is offered to
  // Next's own upgrade handler instead — in particular its dev-mode HMR
  // websocket (/_next/webpack-hmr), which would otherwise never get a
  // response. Deliberately never called for our own path: Next's handler
  // treats unrecognized /api/*-style upgrades as invalid and destroys the
  // socket, which would race our already-claimed connection.
  attachSignalingServer(server);
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url ?? "/");
    if (!isSignalPath(pathname ?? "")) {
      void handleUpgrade(req, socket, head);
    }
  });

  server.listen(port, () => {
    console.log(`> FileDrop ready on port ${port} (${dev ? "development" : "production"})`);
  });
});
