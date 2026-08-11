/**
 * WebRTC signaling relay for peer-to-peer transfers.
 *
 * This server never sees file bytes — it only relays the small SDP/ICE
 * handshake messages two browsers need to exchange before they can talk
 * directly to each other. Rooms are entirely in-memory, keyed by the
 * transfer's shareId, and hold at most one "sender" and one "receiver"
 * socket. State does not survive a restart, which is fine: an in-progress
 * P2P transfer is inherently tied to both browsers being online anyway,
 * so there's nothing durable to lose.
 */
import type { Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { prisma } from "@/lib/prisma";
import { verifyDownloadToken } from "@/lib/security/downloadToken";
import { getClientIpFromNodeHeaders, p2pSignalRateLimiter } from "@/lib/security/rateLimit";
import {
  isPeerRole,
  type ClientSignalMessage,
  type PeerRole,
  type ServerSignalMessage,
} from "@/lib/p2p/types";

// Deliberately NOT under /api/ — Next.js's own request handler treats any
// Upgrade request whose path matches /api/* as invalid and destroys the
// socket outright once it's been initialized (i.e. after handle() has
// processed at least one real request), racing our own upgrade handler
// even though we claim the socket first. Keeping this path outside /api/
// avoids that entirely.
const SIGNAL_PATH = "/ws/p2p/signal";

interface Room {
  sender?: WebSocket;
  receiver?: WebSocket;
  expiresAtMs: number;
}

const rooms = new Map<string, Room>();

export function isSenderOnline(shareId: string): boolean {
  const room = rooms.get(shareId);
  return Boolean(room?.sender && room.sender.readyState === WebSocket.OPEN);
}

export function attachSignalingServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "", "http://internal");
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname !== SIGNAL_PATH) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const ip = getClientIpFromNodeHeaders(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!p2pSignalRateLimiter.check(ip).allowed) {
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }

    const shareId = url.searchParams.get("shareId");
    const roleParam = url.searchParams.get("role");
    const token = url.searchParams.get("token");

    if (!shareId || !isPeerRole(roleParam)) {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }
    const role: PeerRole = roleParam;

    // Complete the WebSocket handshake immediately, with no async work in
    // between accepting the raw socket and claiming it. Authorization
    // (does this transfer exist / isn't expired / password token checks
    // out) needs a database round trip, which — deployed behind some
    // reverse proxies and in some hosting setups — can leave a freshly
    // upgrade-pending socket vulnerable to being reclaimed as "idle"
    // before that lookup resolves. Doing the async authorization check
    // *after* the handshake completes sidesteps that entirely: an
    // unauthorized connection is closed with a specific WS close code
    // instead of being rejected at the HTTP level.
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Required by `ws` in noServer mode: without this, the socket never
      // gets registered with the WebSocketServer's internal client
      // tracking or its per-message-deflate extension state.
      wss.emit("connection", ws, req);
      void authorizeAndJoin(shareId, role, token, ws);
    });
  });

  startExpirySweep();
}

function rejectUpgrade(socket: Duplex, status: number, statusText: string): void {
  socket.write(`HTTP/1.1 ${status} ${statusText}\r\n\r\n`);
  socket.destroy();
}

// Close codes in the 4000-4999 range are reserved for application use.
const CLOSE_NOT_FOUND = 4404;
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_CONFLICT = 4409;

async function authorizeAndJoin(
  shareId: string,
  role: PeerRole,
  token: string | null,
  ws: WebSocket,
): Promise<void> {
  try {
    const transfer = await prisma.p2pTransfer.findUnique({ where: { shareId } });
    if (!transfer || transfer.status === "EXPIRED" || transfer.expiresAt.getTime() <= Date.now()) {
      ws.close(CLOSE_NOT_FOUND, "Not Found");
      return;
    }

    if (transfer.passwordHash && !verifyDownloadToken(shareId, token)) {
      ws.close(CLOSE_UNAUTHORIZED, "Unauthorized");
      return;
    }

    let room = rooms.get(shareId);
    if (!room) {
      room = { expiresAtMs: transfer.expiresAt.getTime() };
      rooms.set(shareId, room);
    }

    const existing = room[role];
    if (existing && existing.readyState === WebSocket.OPEN) {
      ws.close(CLOSE_CONFLICT, "Conflict");
      return;
    }

    onPeerJoined(shareId, role, ws, room);
  } catch (err) {
    console.error("[p2p signaling] authorization failed:", err);
    ws.close(1011, "Internal Error");
  }
}

function send(ws: WebSocket | undefined, message: ServerSignalMessage): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function peerOf(room: Room, role: PeerRole): WebSocket | undefined {
  return role === "sender" ? room.receiver : room.sender;
}

function onPeerJoined(shareId: string, role: PeerRole, ws: WebSocket, room: Room): void {
  room[role] = ws;

  if (room.sender && room.receiver) {
    send(room.sender, { type: "ready" });
    send(room.receiver, { type: "ready" });
    void prisma.p2pTransfer
      .updateMany({ where: { shareId, status: "WAITING" }, data: { status: "CONNECTED" } })
      .catch(() => {});
  }

  ws.on("message", (data) => {
    let message: ClientSignalMessage;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (message.type === "webrtc") {
      send(peerOf(room, role), { type: "webrtc", payload: message.payload });
    } else if (message.type === "complete") {
      void prisma.p2pTransfer
        .updateMany({ where: { shareId }, data: { status: "COMPLETED" } })
        .catch(() => {});
    }
  });

  const onDisconnect = () => {
    const current = rooms.get(shareId);
    if (!current) return;
    if (current[role] === ws) current[role] = undefined;
    send(peerOf(current, role), { type: "peer-left" });
    if (!current.sender && !current.receiver) rooms.delete(shareId);
  };

  ws.on("close", onDisconnect);
  ws.on("error", () => ws.close());
}

let sweepStarted = false;

/** Backstop against leaked rooms: sockets should always clean themselves
 * up via the `close` handler above, but if that somehow doesn't fire
 * (e.g. a half-open TCP connection that never notices the peer is gone),
 * this drops anything past its transfer's expiry. */
function startExpirySweep(): void {
  if (sweepStarted) return;
  sweepStarted = true;

  setInterval(() => {
    const now = Date.now();
    for (const [shareId, room] of rooms) {
      if (room.expiresAtMs > now) continue;
      room.sender?.close();
      room.receiver?.close();
      rooms.delete(shareId);
    }
  }, 60_000).unref();
}
