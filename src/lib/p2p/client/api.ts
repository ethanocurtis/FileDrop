"use client";

import type { ApiErrorBody } from "@/types/drop";
import type {
  CreateP2pTransferRequestBody,
  CreateP2pTransferResponse,
  P2pTransferMetadataResponse,
  UnlockP2pTransferResponse,
} from "@/types/p2p";
import type { IceServerConfig } from "@/lib/p2p/turnCredentials";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(body.error.message, body.error.code, res.status);
  } catch {
    return new ApiError("Something went wrong. Please try again.", "INTERNAL_ERROR", res.status);
  }
}

export async function createP2pTransfer(
  payload: CreateP2pTransferRequestBody,
): Promise<CreateP2pTransferResponse> {
  const res = await fetch("/api/p2p", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorBody(res);
  return res.json();
}

export async function fetchP2pMetadata(
  shareId: string,
  token?: string | null,
): Promise<P2pTransferMetadataResponse> {
  const url = new URL(`/api/p2p/${shareId}`, window.location.origin);
  if (token) url.searchParams.set("token", token);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw await parseErrorBody(res);
  return res.json();
}

export async function unlockP2pTransfer(
  shareId: string,
  password: string,
): Promise<UnlockP2pTransferResponse> {
  const res = await fetch(`/api/p2p/${shareId}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw await parseErrorBody(res);
  return res.json();
}

export async function fetchIceServers(): Promise<IceServerConfig[]> {
  const res = await fetch("/api/p2p/ice-servers", { cache: "no-store" });
  if (!res.ok) throw await parseErrorBody(res);
  const body = (await res.json()) as { iceServers: IceServerConfig[] };
  return body.iceServers;
}
