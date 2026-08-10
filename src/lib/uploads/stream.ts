/**
 * Wrap an incoming request body stream so it can be forwarded to object
 * storage while, at the same time:
 *  - capturing the first `sniffTarget` bytes for magic-number MIME
 *    detection (see lib/validation/file.ts), and
 *  - enforcing a hard byte cap, aborting the stream the moment more than
 *    `maxBytes` has been read, rather than trusting the declared
 *    Content-Length or the file size the client reported when creating
 *    the drop.
 */
export function createGuardedUploadStream(
  source: ReadableStream<Uint8Array>,
  options: { maxBytes: number; sniffTarget?: number },
) {
  const sniffTarget = options.sniffTarget ?? 4100;
  const sniffChunks: Uint8Array[] = [];
  let sniffBytes = 0;
  let totalBytes = 0;
  let sizeExceeded = false;

  const reader = source.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      totalBytes += value.byteLength;
      if (totalBytes > options.maxBytes) {
        sizeExceeded = true;
        controller.error(new Error("MAX_UPLOAD_SIZE_EXCEEDED"));
        await reader.cancel("max upload size exceeded").catch(() => {});
        return;
      }

      if (sniffBytes < sniffTarget) {
        sniffChunks.push(value);
        sniffBytes += value.byteLength;
      }

      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
    },
  });

  return {
    stream,
    sizeExceeded: () => sizeExceeded,
    totalBytes: () => totalBytes,
    sniffSample: () => Buffer.concat(sniffChunks.map((c) => Buffer.from(c))).subarray(0, sniffTarget),
  };
}
