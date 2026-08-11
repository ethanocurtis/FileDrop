/** Shared WebSocket signaling message shapes between client and server. The
 * server never inspects the "webrtc" payload's contents — it's an opaque
 * relay for whatever the two browsers' RTCPeerConnections need to
 * exchange (offer/answer/ICE candidates). Only the client actually
 * interprets that shape (see src/lib/p2p/webrtc.ts). */

export type ClientSignalMessage =
  | { type: "webrtc"; payload: unknown }
  | { type: "complete" }
  | { type: "error"; message: string };

export type ServerSignalMessage =
  | { type: "ready" }
  | { type: "webrtc"; payload: unknown }
  | { type: "peer-left" }
  | { type: "error"; message: string };

export type PeerRole = "sender" | "receiver";

export function isPeerRole(value: unknown): value is PeerRole {
  return value === "sender" || value === "receiver";
}

/** Shape of the opaque "webrtc" signal payload above — the actual SDP/ICE
 * handshake content, interpreted only by the two browsers. */
export type WebrtcSignal =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };

/** Application-level framing sent over the RTCDataChannel itself, once
 * it's open — this is between the two browsers only, the signaling
 * server never sees it. Control messages are JSON strings; everything
 * else on the channel is a raw binary file chunk. */
export type DataChannelControlMessage =
  | { type: "meta"; name: string; size: number; mimeType: string }
  | { type: "done" };
