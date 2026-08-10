import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { env } from "@/lib/env";

/**
 * Thin wrapper around the S3 SDK so the rest of the app never imports
 * `@aws-sdk/*` directly and never sees a bucket name, endpoint, or object
 * key. Works with AWS S3 and any S3-compatible provider (MinIO, Cloudflare
 * R2, Backblaze B2, DigitalOcean Spaces, ...).
 */

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export function buildStorageKey(dropId: string, fileId: string): string {
  // Namespaced by drop so a cleanup job can reason about a drop's objects
  // as a group if ever needed. Keys are opaque, server-generated IDs only
  // — never derived from the user-supplied file name — so there is no
  // path-traversal surface here.
  return `drops/${dropId}/${fileId}`;
}

/**
 * Stream a request body directly into object storage without buffering
 * the whole file in memory. `contentLength`, when known, lets the SDK skip
 * a multipart upload for small files.
 */
export async function putObjectStream(params: {
  key: string;
  body: ReadableStream<Uint8Array> | Blob | Buffer;
  contentType: string;
  contentLength?: number;
  signal?: AbortSignal;
}): Promise<void> {
  // Normalize to a Node Readable. The AWS SDK's Node build expects a
  // Node.js stream, Buffer, or Blob — converting explicitly here (rather
  // than handing it a Web ReadableStream and hoping the SDK version in use
  // coerces it) keeps this working across SDK versions.
  const body =
    params.body instanceof ReadableStream
      ? Readable.fromWeb(params.body as never)
      : params.body;

  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: env.S3_BUCKET,
      Key: params.key,
      Body: body,
      ContentType: params.contentType,
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
  });

  if (params.signal) {
    params.signal.addEventListener("abort", () => {
      void upload.abort();
    });
  }

  await upload.done();
}

export async function getObjectStream(key: string): Promise<{
  body: ReadableStream;
  contentLength?: number;
  contentType?: string;
}> {
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
  );

  if (!result.Body) {
    throw new Error("Object has no body");
  }

  return {
    body: result.Body.transformToWebStream(),
    contentLength: result.ContentLength,
    contentType: result.ContentType,
  };
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

/**
 * A short-lived presigned GET URL. Not used by the default download path
 * (which proxies bytes through our own server so the storage
 * endpoint/bucket is never exposed to the client), but available for
 * deployments that prefer redirecting large downloads straight to storage.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 60,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}
