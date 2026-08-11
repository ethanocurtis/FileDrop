"use client";

/**
 * Where a receiver writes incoming bytes as they arrive over the data
 * channel. Two implementations: the File System Access API streams
 * straight to disk (works for files far larger than available memory);
 * the Blob fallback buffers everything in memory and triggers a normal
 * download when the transfer finishes, for browsers that don't support
 * FSA (Firefox, Safari as of this writing).
 */
export interface FileSink {
  write(chunk: ArrayBuffer): Promise<void>;
  /** Finalize the write (close the file handle / trigger the download). */
  finalize(): Promise<void>;
  /** Best-effort cleanup on cancel/error — discard whatever was written. */
  abort(): Promise<void>;
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/**
 * Must be called synchronously from within a user-gesture handler (e.g. a
 * button's onClick) — browsers require "transient activation" for
 * showSaveFilePicker, which doesn't survive an awaited network round trip.
 * Returns null if the user cancels the picker, so callers can fall back
 * to createBlobSink rather than treating it as an error.
 */
export async function pickFileSystemSink(fileMeta: {
  name: string;
  mimeType: string;
}): Promise<FileSink | null> {
  try {
    // showSaveFilePicker isn't in the standard lib.dom.d.ts yet in all TS
    // configurations, so it's accessed via a narrow local type instead of
    // widening the global Window type.
    const picker = (
      window as unknown as {
        showSaveFilePicker: (options: {
          suggestedName: string;
          types?: { description: string; accept: Record<string, string[]> }[];
        }) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker;

    const handle = await picker({
      suggestedName: fileMeta.name,
      types: fileMeta.mimeType
        ? [{ description: fileMeta.mimeType, accept: { [fileMeta.mimeType]: [] } }]
        : undefined,
    });
    const writable = await (
      handle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }
    ).createWritable();

    return {
      async write(chunk) {
        await writable.write(chunk);
      },
      async finalize() {
        await writable.close();
      },
      async abort() {
        await writable.abort().catch(() => {});
      },
    };
  } catch (err) {
    // AbortError = user cancelled the picker; anything else, fall back too
    // rather than failing the whole transfer over a non-essential API.
    void err;
    return null;
  }
}

export function createBlobSink(fileMeta: { name: string; mimeType: string }): FileSink {
  const parts: ArrayBuffer[] = [];

  return {
    async write(chunk) {
      parts.push(chunk);
    },
    async finalize() {
      const blob = new Blob(parts, { type: fileMeta.mimeType || "application/octet-stream" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileMeta.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    },
    async abort() {
      parts.length = 0;
    },
  };
}

// Minimal ambient shapes for the File System Access API types this module
// touches, since they aren't universally present in lib.dom.d.ts.
interface FileSystemWritableFileStream {
  write(chunk: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}
