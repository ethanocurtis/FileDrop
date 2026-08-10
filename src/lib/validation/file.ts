import { fileTypeFromBuffer } from "file-type";
import { env } from "@/lib/env";

export class FileValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "FILE_TOO_LARGE"
      | "EMPTY_FILE"
      | "TOO_MANY_FILES"
      | "UNSUPPORTED_TYPE",
  ) {
    super(message);
    this.name = "FileValidationError";
  }
}

/**
 * File types we actively refuse. This is a small, conservative denylist
 * (rather than an allowlist) because FileDrop is a general-purpose sharing
 * tool — the goal is to block obviously dangerous executables, not to
 * second-guess every legitimate file type. Real malware defense belongs in
 * `lib/security/scan.ts`, which this module calls out to.
 */
const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "dll",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "ps1",
  "app",
]);

export function assertDeclaredSizeIsAllowed(size: number): void {
  if (size <= 0) {
    throw new FileValidationError("File is empty.", "EMPTY_FILE");
  }
  if (size > env.MAX_UPLOAD_SIZE_BYTES) {
    throw new FileValidationError(
      `File exceeds the maximum upload size of ${env.MAX_UPLOAD_SIZE_BYTES} bytes.`,
      "FILE_TOO_LARGE",
    );
  }
}

export function assertFileCountIsAllowed(count: number): void {
  if (count < 1 || count > env.MAX_FILES_PER_DROP) {
    throw new FileValidationError(
      `A drop may contain between 1 and ${env.MAX_FILES_PER_DROP} files.`,
      "TOO_MANY_FILES",
    );
  }
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

export function isBlockedExtension(fileName: string): boolean {
  return BLOCKED_EXTENSIONS.has(extensionOf(fileName));
}

/**
 * Determine the real MIME type from file bytes (magic-number sniffing),
 * never trusting the browser-supplied `Content-Type`. Falls back to
 * "application/octet-stream" for types the sniffer doesn't recognize
 * (plain text, JSON, and many other legitimate formats have no magic
 * number) rather than rejecting the upload outright.
 */
export async function detectMimeType(sample: Buffer): Promise<string> {
  const detected = await fileTypeFromBuffer(sample);
  return detected?.mime ?? "application/octet-stream";
}
