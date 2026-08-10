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
  expiresAt: string;
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
