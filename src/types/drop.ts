import type { ExpirationValue } from "@/lib/utils/time";

export const MAX_DOWNLOAD_OPTIONS = [1, 5, 10] as const;

export interface CreateDropFileInput {
  name: string;
  size: number;
  mimeType: string;
}

export interface CreateDropRequestBody {
  files: CreateDropFileInput[];
  expiration: ExpirationValue;
  password?: string;
  /** null/undefined = unlimited */
  maxDownloads?: number | null;
  burnAfterRead?: boolean;
}

export interface CreateDropResponseFile {
  fileId: string;
  name: string;
  uploadUrl: string;
}

export interface CreateDropResponse {
  shareId: string;
  dropId: string;
  /** Shown once, right after creation — lets the uploader delete this
   * drop early via DELETE /api/share/[shareId]. Never persisted client-side. */
  deleteToken: string;
  expiresAt: string;
  /** True if a file was over LARGE_FILE_THRESHOLD_BYTES and the
   * requested expiration got reduced to the policy max as a result —
   * `expiresAt` above already reflects the actual (possibly shortened)
   * value either way; this just tells the UI whether to explain why. */
  expirationClamped: boolean;
  shareUrl: string;
  files: CreateDropResponseFile[];
}

export interface PublicFileMetadata {
  fileId: string;
  name: string;
  size: string; // serialized BigInt
  mimeType: string;
}

export interface DropMetadataResponse {
  shareId: string;
  requiresPassword: boolean;
  expiresAt: string;
  burnAfterRead: boolean;
  maxDownloads: number | null;
  downloadCount: number;
  files: PublicFileMetadata[] | null;
}

export type DropErrorCode =
  | "NOT_FOUND"
  | "EXPIRED"
  | "PASSWORD_REQUIRED"
  | "INVALID_PASSWORD"
  | "DOWNLOAD_LIMIT_REACHED"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "STORAGE_ERROR"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: DropErrorCode;
    message: string;
  };
}
