"use client";

/**
 * Browser-to-browser file transfer engine. The signaling server (see
 * src/lib/p2p/signalingServer.ts) only ever relays small SDP/ICE messages
 * between exactly two sockets — everything here, including the actual
 * file bytes, happens directly between the two browsers over an
 * RTCDataChannel once that handshake completes.
 *
 * Both startP2pSender and startP2pReceiver rebuild the RTCPeerConnection
 * from scratch every time the signaling server reports "ready" (which
 * fires once initially, and again any time the other side reconnects
 * after a drop), so a transfer can recover from a brief disconnect
 * without the user having to reload the page.
 */
import type {
  ClientSignalMessage,
  DataChannelControlMessage,
  PeerRole,
  ServerSignalMessage,
  WebrtcSignal,
} from "@/lib/p2p/types";
import { fetchIceServers } from "@/lib/p2p/client/api";
import type { IceServerConfig } from "@/lib/p2p/turnCredentials";
import type { FileSink } from "@/lib/p2p/client/fileSink";

// "error" isn't a status here — errors go through onError instead, since
// a failed connection attempt shouldn't necessarily be a dead end (a
// receiver reconnecting fires "ready" again and the caller can retry).
export type P2pStatus =
  | "connecting-signal"
  | "waiting-for-peer"
  | "connecting-peer"
  | "transferring"
  | "done"
  | "closed";

interface CommonHandlers {
  onStatus: (status: P2pStatus) => void;
  onProgress: (transferred: number, total: number) => void;
  onError: (message: string) => void;
}

// 64KB keeps each RTCDataChannel message comfortably under every major
// browser's SCTP message-size limit (some are far more generous, but this
// is the widely-cited safe/interoperable floor).
const CHUNK_SIZE = 64 * 1024;
const BUFFERED_AMOUNT_HIGH_WATER = 8 * 1024 * 1024;
const BUFFERED_AMOUNT_LOW_WATER = 1 * 1024 * 1024;
const FALLBACK_ICE_SERVERS: IceServerConfig[] = [{ urls: "stun:stun.l.google.com:19302" }];

function signalingUrl(shareId: string, role: PeerRole, token: string | null): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`${protocol}//${window.location.host}/ws/p2p/signal`);
  url.searchParams.set("shareId", shareId);
  url.searchParams.set("role", role);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

// Mirrors the close codes signalingServer.ts uses for authorization
// failures (see CLOSE_NOT_FOUND / CLOSE_UNAUTHORIZED / CLOSE_CONFLICT
// there) so the UI can show something more useful than "disconnected".
function describeCloseCode(code: number): string | null {
  switch (code) {
    case 4404:
      return "This transfer is no longer available.";
    case 4401:
      return "Incorrect or expired password.";
    case 4409:
      return "This link is already connected from another tab.";
    default:
      return null;
  }
}

function waitForBufferedAmountLow(channel: RTCDataChannel): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      channel.removeEventListener("bufferedamountlow", handler);
      resolve();
    };
    channel.addEventListener("bufferedamountlow", handler);
  });
}

class SignalingChannel {
  private ws: WebSocket;

  constructor(
    url: string,
    private handlers: {
      onOpen: () => void;
      onReady: () => void;
      onWebrtc: (payload: unknown) => void;
      onPeerLeft: () => void;
      onClose: (code: number) => void;
    },
  ) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener("open", () => this.handlers.onOpen());
    this.ws.addEventListener("message", (event) => {
      let message: ServerSignalMessage;
      try {
        message = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (message.type === "ready") this.handlers.onReady();
      else if (message.type === "webrtc") this.handlers.onWebrtc(message.payload);
      else if (message.type === "peer-left") this.handlers.onPeerLeft();
    });
    this.ws.addEventListener("close", (event) => this.handlers.onClose(event.code));
  }

  send(message: ClientSignalMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.ws.close();
  }
}

/** Shared trickle-ICE bookkeeping: candidates that arrive before the
 * remote description is set can't be applied yet, so they're queued and
 * flushed once setRemoteDescription resolves. */
class PendingCandidates {
  private queue: RTCIceCandidateInit[] = [];
  private ready = false;

  async add(pc: RTCPeerConnection, candidate: RTCIceCandidateInit): Promise<void> {
    if (this.ready) {
      await pc.addIceCandidate(candidate).catch(() => {});
    } else {
      this.queue.push(candidate);
    }
  }

  async flush(pc: RTCPeerConnection): Promise<void> {
    this.ready = true;
    const queued = this.queue;
    this.queue = [];
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  reset(): void {
    this.ready = false;
    this.queue = [];
  }
}

export interface P2pSession {
  cancel: () => void;
}

export function startP2pSender(
  params: {
    shareId: string;
    token: string | null;
    file: File;
  } & CommonHandlers,
): P2pSession {
  let cancelled = false;
  let generation = 0;
  let pc: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  let iceServers: IceServerConfig[] | null = null;
  const pending = new PendingCandidates();

  params.onStatus("connecting-signal");

  const signaling = new SignalingChannel(signalingUrl(params.shareId, "sender", params.token), {
    onOpen: () => {
      if (!cancelled) params.onStatus("waiting-for-peer");
    },
    onReady: () => {
      if (!cancelled) void beginOffer();
    },
    onWebrtc: (payload) => {
      if (!cancelled) void handleSignal(payload as WebrtcSignal);
    },
    onPeerLeft: () => {
      if (cancelled) return;
      teardownPeer();
      params.onStatus("waiting-for-peer");
    },
    onClose: (code) => {
      if (cancelled) return;
      const message = describeCloseCode(code);
      if (message) params.onError(message);
      params.onStatus("closed");
    },
  });

  function teardownPeer(): void {
    generation += 1;
    channel?.close();
    pc?.close();
    channel = null;
    pc = null;
    pending.reset();
  }

  async function beginOffer(): Promise<void> {
    teardownPeer();
    const myGeneration = generation;

    if (!iceServers) {
      iceServers = await fetchIceServers().catch(() => FALLBACK_ICE_SERVERS);
    }
    if (cancelled || myGeneration !== generation) return;

    params.onStatus("connecting-peer");
    const connection = new RTCPeerConnection({ iceServers });
    pc = connection;

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.send({
          type: "webrtc",
          payload: { kind: "ice-candidate", candidate: event.candidate.toJSON() },
        });
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" && !cancelled && myGeneration === generation) {
        params.onError("Connection to the receiver failed.");
      }
    };

    const dataChannel = connection.createDataChannel("filedrop");
    dataChannel.binaryType = "arraybuffer";
    dataChannel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_WATER;
    dataChannel.onopen = () => {
      if (!cancelled && myGeneration === generation) void sendFile(myGeneration);
    };
    dataChannel.onerror = () => {
      if (!cancelled && myGeneration === generation) params.onError("Data channel error.");
    };
    channel = dataChannel;

    const offer = await connection.createOffer();
    if (cancelled || myGeneration !== generation) return;
    await connection.setLocalDescription(offer);
    signaling.send({ type: "webrtc", payload: { kind: "offer", sdp: offer.sdp ?? "" } });
  }

  async function handleSignal(signal: WebrtcSignal): Promise<void> {
    if (!pc) return;
    if (signal.kind === "answer") {
      await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
      await pending.flush(pc);
    } else if (signal.kind === "ice-candidate") {
      await pending.add(pc, signal.candidate);
    }
  }

  async function sendFile(myGeneration: number): Promise<void> {
    const activeChannel = channel;
    if (!activeChannel) return;
    params.onStatus("transferring");
    const file = params.file;
    let offset = 0;

    try {
      const meta: DataChannelControlMessage = {
        type: "meta",
        name: file.name,
        size: file.size,
        mimeType: file.type || "application/octet-stream",
      };
      activeChannel.send(JSON.stringify(meta));

      while (offset < file.size) {
        if (cancelled || myGeneration !== generation) return;
        if (activeChannel.bufferedAmount > BUFFERED_AMOUNT_HIGH_WATER) {
          await waitForBufferedAmountLow(activeChannel);
          if (cancelled || myGeneration !== generation) return;
        }
        const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
        activeChannel.send(buffer);
        offset += buffer.byteLength;
        params.onProgress(offset, file.size);
      }

      const done: DataChannelControlMessage = { type: "done" };
      activeChannel.send(JSON.stringify(done));
      signaling.send({ type: "complete" });
      params.onStatus("done");
    } catch (err) {
      if (!cancelled && myGeneration === generation) {
        params.onError(err instanceof Error ? err.message : "Transfer failed.");
      }
    }
  }

  return {
    cancel: () => {
      cancelled = true;
      teardownPeer();
      signaling.close();
    },
  };
}

export function startP2pReceiver(
  params: {
    shareId: string;
    token: string | null;
    fileMeta: { name: string; size: number; mimeType: string };
    sink: FileSink;
    onComplete: () => void;
  } & CommonHandlers,
): P2pSession {
  let cancelled = false;
  let generation = 0;
  let pc: RTCPeerConnection | null = null;
  let iceServers: IceServerConfig[] | null = null;
  let bytesReceived = 0;
  const pending = new PendingCandidates();

  params.onStatus("connecting-signal");

  const signaling = new SignalingChannel(signalingUrl(params.shareId, "receiver", params.token), {
    onOpen: () => {
      if (!cancelled) params.onStatus("waiting-for-peer");
    },
    onReady: () => {
      if (!cancelled) void prepare();
    },
    onWebrtc: (payload) => {
      if (!cancelled) void handleSignal(payload as WebrtcSignal);
    },
    onPeerLeft: () => {
      if (cancelled) return;
      teardownPeer();
      params.onStatus("waiting-for-peer");
    },
    onClose: (code) => {
      if (cancelled) return;
      const message = describeCloseCode(code);
      if (message) params.onError(message);
      params.onStatus("closed");
    },
  });

  function teardownPeer(): void {
    generation += 1;
    pc?.close();
    pc = null;
    pending.reset();
  }

  async function prepare(): Promise<void> {
    teardownPeer();
    const myGeneration = generation;

    if (!iceServers) {
      iceServers = await fetchIceServers().catch(() => FALLBACK_ICE_SERVERS);
    }
    if (cancelled || myGeneration !== generation) return;

    params.onStatus("connecting-peer");
    const connection = new RTCPeerConnection({ iceServers });
    pc = connection;

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.send({
          type: "webrtc",
          payload: { kind: "ice-candidate", candidate: event.candidate.toJSON() },
        });
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" && !cancelled && myGeneration === generation) {
        params.onError("Connection to the sender failed.");
      }
    };
    connection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      dataChannel.binaryType = "arraybuffer";
      dataChannel.onmessage = (messageEvent) => {
        if (!cancelled && myGeneration === generation) {
          void handleChannelMessage(messageEvent.data as string | ArrayBuffer);
        }
      };
      dataChannel.onerror = () => {
        if (!cancelled && myGeneration === generation) params.onError("Data channel error.");
      };
    };
  }

  async function handleSignal(signal: WebrtcSignal): Promise<void> {
    if (!pc) return;
    if (signal.kind === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
      await pending.flush(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signaling.send({ type: "webrtc", payload: { kind: "answer", sdp: answer.sdp ?? "" } });
    } else if (signal.kind === "ice-candidate") {
      await pending.add(pc, signal.candidate);
    }
  }

  async function handleChannelMessage(data: string | ArrayBuffer): Promise<void> {
    if (typeof data === "string") {
      let message: DataChannelControlMessage;
      try {
        message = JSON.parse(data);
      } catch {
        return;
      }
      if (message.type === "meta") {
        bytesReceived = 0;
        params.onStatus("transferring");
      } else if (message.type === "done") {
        try {
          await params.sink.finalize();
          signaling.send({ type: "complete" });
          params.onStatus("done");
          params.onComplete();
        } catch (err) {
          params.onError(err instanceof Error ? err.message : "Could not save the file.");
        }
      }
      return;
    }

    try {
      await params.sink.write(data);
      bytesReceived += data.byteLength;
      params.onProgress(bytesReceived, params.fileMeta.size);
    } catch (err) {
      params.onError(err instanceof Error ? err.message : "Could not write the file.");
    }
  }

  return {
    cancel: () => {
      cancelled = true;
      teardownPeer();
      signaling.close();
      void params.sink.abort();
    },
  };
}
