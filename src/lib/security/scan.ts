/**
 * Extension point for malware/content scanning.
 *
 * FileDrop does not ship a scanner today, but the upload service (see
 * `lib/uploads/service.ts`) calls `scanFile` for every uploaded file before
 * it is marked ACTIVE and made downloadable. To add real scanning later
 * (e.g. ClamAV, a cloud AV API, or a hash-based blocklist), implement the
 * body of this function — no call sites need to change.
 */

export interface ScanResult {
  clean: boolean;
  reason?: string;
}

export interface ScanInput {
  sample: Buffer;
  fileName: string;
  mimeType: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function scanFile(_input: ScanInput): Promise<ScanResult> {
  // No-op by default. Always resolves "clean" so the upload pipeline works
  // out of the box; wire up a real scanner here when you have one.
  return { clean: true };
}
