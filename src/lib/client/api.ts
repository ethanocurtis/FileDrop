"use client";

import type {
  AdminDropsResponse,
  AdminLoginResponse,
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

export async function createDrop(
  payload: CreateDropRequestBody,
  adminToken?: string | null,
): Promise<CreateDropResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

  const res = await fetch("/api/drops", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await parseErrorBody(res);
  return res.json();
}

/** Exchanges the shared admin password for a session token — see
 * src/lib/security/adminSession.ts. Throws ApiError("INVALID_PASSWORD")
 * on a wrong password, ApiError("ADMIN_REQUIRED") if this deployment
 * has no ADMIN_PASSWORD configured at all. */
export async function adminLogin(password: string): Promise<AdminLoginResponse> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw await parseErrorBody(res);
  return res.json();
}

/** Every non-deleted drop, independent of which browser created it —
 * see "Admin uploads" in the README. */
export async function adminListDrops(token: string): Promise<AdminDropsResponse> {
  const res = await fetch("/api/admin/drops", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw await parseErrorBody(res);
  return res.json();
}

/** Admin-authorized delete — works even if this browser never held (or
 * has since lost) the drop's own capability token. */
export async function adminDeleteDropByShareId(shareId: string, token: string): Promise<void> {
  const res = await fetch(`/api/admin/drops/${shareId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw await parseErrorBody(res);
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
