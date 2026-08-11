"use client";

import type {
  ApiErrorBody,
  CreateDropRequestBody,
  CreateDropResponse,
  DropMetadataResponse,
} from "@/types/drop";

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

export async function createDrop(payload: CreateDropRequestBody): Promise<CreateDropResponse> {
  const res = await fetch("/api/drops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorBody(res);
  return res.json();
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * Streams a single file's bytes to its upload URL via XHR (rather than
 * fetch) because only XHR exposes reliable `upload.onprogress` events
 * across browsers, which real progress bars and cancel buttons depend on.
 */
export function uploadFileContent(
  uploadUrl: string,
  file: File,
  handlers: { onProgress?: (p: UploadProgress) => void } = {},
): { promise: Promise<{ size: number; mimeType: string }>; cancel: () => void } {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<{ size: number; mimeType: string }>((resolve, reject) => {
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        handlers.onProgress?.({ loaded: event.loaded, total: event.total });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ size: file.size, mimeType: file.type });
        }
      } else {
        let message = "Upload failed. Please try again.";
        let code = "STORAGE_ERROR";
        try {
          const body = JSON.parse(xhr.responseText) as ApiErrorBody;
          message = body.error.message;
          code = body.error.code;
        } catch {
          // keep defaults
        }
        reject(new ApiError(message, code, xhr.status));
      }
    };

    xhr.onerror = () => reject(new ApiError("Network error during upload.", "STORAGE_ERROR", 0));
    xhr.onabort = () => reject(new ApiError("Upload cancelled.", "CANCELLED", 0));

    xhr.send(file);
  });

  return { promise, cancel: () => xhr.abort() };
}

export async function cancelUploadSession(uploadUrl: string): Promise<void> {
  try {
    await fetch(uploadUrl, { method: "DELETE" });
  } catch {
    // Best-effort; the server also cleans up PENDING rows on expiry.
  }
}

export async function fetchDropMetadata(shareId: string): Promise<DropMetadataResponse> {
  const res = await fetch(`/api/share/${shareId}`, { cache: "no-store" });
  if (!res.ok) throw await parseErrorBody(res);
  return res.json();
}

export async function unlockDrop(
  shareId: string,
  password: string,
): Promise<DropMetadataResponse & { token: string }> {
  const res = await fetch(`/api/share/${shareId}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw await parseErrorBody(res);
  return res.json();
}

/** Deletes a drop early using the capability token shown once at
 * creation time (see CreateDropResponse.deleteToken). */
export async function deleteDrop(shareId: string, deleteToken: string): Promise<void> {
  const res = await fetch(`/api/share/${shareId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deleteToken }),
  });
  if (!res.ok) throw await parseErrorBody(res);
}

/**
 * Downloads a file via fetch + Blob (rather than a plain navigation) so
 * failures surface as catchable errors in the UI instead of the browser
 * rendering a raw JSON/error page.
 */
export async function downloadFile(
  shareId: string,
  fileId: string,
  fileName: string,
  token?: string | null,
): Promise<void> {
  const url = new URL(`/api/share/${shareId}/files/${fileId}`, window.location.origin);
  if (token) url.searchParams.set("token", token);

  const res = await fetch(url.toString());
  if (!res.ok) throw await parseErrorBody(res);

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
