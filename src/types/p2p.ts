import type { ExpirationValue } from "@/lib/utils/time";

export interface CreateP2pTransferRequestBody {
  fileName: string;
  fileSize: number;
  mimeType?: string;
  expiration: ExpirationValue;
  password?: string;
}

export interface CreateP2pTransferResponse {
  shareId: string;
  shareUrl: string;
  expiresAt: string;
  /** Signaling auth token, present only when the transfer is
   * password-protected — the sender just set that password, so they're
   * issued a token immediately rather than being made to "unlock" their
   * own transfer. */
  token: string | null;
}

/** File details are only included once the caller is authorized — either
 * the transfer has no password, or a valid unlock token was presented.
 * Mirrors DropMetadataResponse's `files: null` treatment. */
export interface P2pTransferMetadataResponse {
  shareId: string;
  requiresPassword: boolean;
  expiresAt: string;
  status: "WAITING" | "CONNECTED" | "COMPLETED" | "EXPIRED";
  senderOnline: boolean;
  file: { name: string; size: string; mimeType: string } | null;
}

export interface UnlockP2pTransferResponse extends P2pTransferMetadataResponse {
  token: string;
}
